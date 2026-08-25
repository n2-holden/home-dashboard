"""Enlighten cloud API client for IQ PowerPack / site telemetry."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from collections.abc import Iterable
from typing import Any
from urllib.parse import urlencode

import aiohttp
from yarl import URL

from .const import BASE_URL

_LOGGER = logging.getLogger(__name__)

JsonDict = dict[str, Any]

# Enlighten now rejects Home Assistant's default User-Agent with HTTP 406.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)

# Live-status protobuf powers are signed varints of kW * 1_000_000.
_LIVE_POWER_SCALE = 1_000_000.0


class EnphaseAuthError(Exception):
    """Raised when Enlighten authentication fails."""


class EnphaseApiError(Exception):
    """Raised when an Enlighten API call fails."""


class EnphaseSessionExpired(EnphaseApiError):
    """Raised when Enlighten returns a login HTML page instead of JSON."""


class EnphaseCloudClient:
    """Minimal Enlighten web-session client (same path the website uses)."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        email: str,
        password: str,
        site_id: str | None = None,
    ) -> None:
        self._session = session
        self._email = email.strip()
        self._password = password
        self.site_id = (site_id or "").strip() or None
        self._cookie: str | None = None
        self._manager_token: str | None = None
        self._session_id: str | None = None
        self._gateway_serial: str | None = None

    async def async_login(self) -> str:
        """Authenticate and return the selected site id."""
        # Drop any stale / rate-limit cookies from prior attempts.
        self._session.cookie_jar.clear()
        self._cookie = None
        self._manager_token = None
        self._session_id = None

        payload: JsonDict | None = None
        status = 0
        text = ""

        try:
            status, text, payload = await self._post_login_json()
        except EnphaseAuthError:
            raise
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("login.json failed: %s", err)
            status = 0

        # Enlighten often returns 406 unless we look like a browser form POST.
        if status == 406 or payload is None:
            _LOGGER.info("Falling back to Enlighten HTML form login")
            await self._post_login_form()
            self._refresh_cookie_header()
            await self._hydrate_tokens_from_session()
        else:
            await self._apply_login_payload(payload, status, text)

        self._refresh_cookie_header()

        if self._cookie_has("login_otp_nonce") and not self._session_id:
            raise EnphaseAuthError(
                "Enlighten is still requiring an MFA/OTP challenge "
                "(login_otp_nonce cookie present). Turn MFA off in the Enphase "
                "account security settings, wait a few minutes, then retry."
            )

        if not self._session_id and not self._cookie_has("_enlighten_4_session"):
            raise EnphaseAuthError(
                "Login did not establish an Enlighten session. "
                "Check email/password, or try again later if the account is rate-limited."
            )

        if not self._session_id and self._cookie_has("_enlighten_4_session"):
            # Newer responses omit session_id and only set the session cookie.
            self._session_id = self._cookie_value("_enlighten_4_session")

        if not self._manager_token:
            await self._hydrate_tokens_from_session()

        if not self.site_id:
            self.site_id = await self._discover_site_id()

        if not self.site_id:
            raise EnphaseAuthError(
                "Login succeeded but no system/site id was found. "
                "Enter the site id from your Enlighten URL "
                "(…/web/5904582/…) in the Site ID field."
            )

        _LOGGER.info("Enlighten login ok for site %s", self.site_id)
        return self.site_id

    async def _post_login_json(self) -> tuple[int, str, JsonDict | None]:
        url = f"{BASE_URL}/login/login.json"
        data = {
            "user[email]": self._email,
            "user[password]": self._password,
        }
        async with self._session.post(
            url,
            data=data,
            headers={
                "Accept": "*/*",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Origin": BASE_URL,
                "Referer": f"{BASE_URL}/",
                "User-Agent": BROWSER_UA,
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            text = await resp.text()
            status = resp.status
            if status in (401, 403):
                raise EnphaseAuthError("Invalid Enlighten email or password")
            if status == 406:
                return status, text, None
            if status >= 400:
                raise EnphaseAuthError(f"Login HTTP {status}: {text[:240]}")
            try:
                payload = await resp.json(content_type=None)
            except Exception:  # noqa: BLE001
                return status, text, None
            if isinstance(payload, dict):
                return status, text, payload
            return status, text, None

    async def _post_login_form(self) -> None:
        """Browser-style Rails form login used when login.json returns 406."""
        authenticity: str | None = None
        async with self._session.get(
            f"{BASE_URL}/login",
            headers={
                "Accept": "text/html,application/xhtml+xml",
                "User-Agent": BROWSER_UA,
                "Referer": f"{BASE_URL}/",
            },
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            html = await resp.text()
            match = re.search(
                r'name="authenticity_token"[^>]*value="([^"]+)"',
                html,
            ) or re.search(
                r'value="([^"]+)"[^>]*name="authenticity_token"',
                html,
            )
            if match:
                authenticity = match.group(1)

        form: dict[str, str] = {
            "utf8": "✓",
            "user[email]": self._email,
            "user[password]": self._password,
        }
        if authenticity:
            form["authenticity_token"] = authenticity

        async with self._session.post(
            f"{BASE_URL}/login/login",
            data=form,
            headers={
                "Accept": "text/html,application/xhtml+xml",
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": BASE_URL,
                "Referer": f"{BASE_URL}/login",
                "User-Agent": BROWSER_UA,
            },
            timeout=aiohttp.ClientTimeout(total=30),
            allow_redirects=True,
        ) as resp:
            if resp.status in (401, 403):
                raise EnphaseAuthError("Invalid Enlighten email or password (form login)")
            body = await resp.text()
            if "Invalid Email or password" in body or "invalid email or password" in body.lower():
                raise EnphaseAuthError("Invalid Enlighten email or password (form login)")

    async def _apply_login_payload(self, payload: JsonDict, status: int, text: str) -> None:
        if payload.get("isBlocked") or payload.get("is_blocked"):
            raise EnphaseAuthError("Enlighten account is temporarily blocked")

        if payload.get("requires_mfa") or payload.get("requiresMfa"):
            raise EnphaseAuthError(
                "Enlighten reports MFA is required for this account. "
                "Disable MFA in account security settings and retry."
            )

        if payload.get("success") is False:
            raise EnphaseAuthError(f"Login rejected: {payload}")

        self._session_id = _as_str(
            payload.get("session_id") or payload.get("sessionId") or payload.get("session")
        )
        self._manager_token = _as_str(
            payload.get("manager_token") or payload.get("managerToken")
        )
        site = _as_str(payload.get("system_id") or payload.get("systemId"))
        if self.site_id is None and site:
            self.site_id = site

        self._refresh_cookie_header()

        if (
            payload.get("success") is True
            and not self._session_id
            and self._cookie_has("login_otp_nonce")
        ):
            raise EnphaseAuthError(
                "Login returned success but Enlighten issued an MFA nonce. "
                "MFA may still be enabled on the account or was only recently disabled."
            )

        _LOGGER.debug(
            "login.json status=%s keys=%s session=%s site=%s",
            status,
            list(payload.keys()),
            bool(self._session_id),
            self.site_id,
        )
        if not self._session_id and not self._cookie_has("_enlighten_4_session"):
            _LOGGER.warning("login.json response lacked session fields: %s", text[:240])

    async def _hydrate_tokens_from_session(self) -> None:
        """Pull JWT / manager token and site id from authenticated session endpoints."""
        self._refresh_cookie_header()
        try:
            data = await self._json("GET", f"{BASE_URL}/app-api/jwt_token.json")
            token = _as_str(data.get("token") or data.get("jwt") or data.get("access_token"))
            if token:
                self._manager_token = token
        except EnphaseApiError as err:
            _LOGGER.debug("jwt_token.json unavailable: %s", err)

        if not self.site_id:
            self.site_id = await self._discover_site_id()

    def _refresh_cookie_header(self) -> None:
        filtered = self._session.cookie_jar.filter_cookies(URL(BASE_URL))
        jar_parts = [f"{key}={morsel.value}" for key, morsel in filtered.items()]
        if jar_parts:
            self._cookie = "; ".join(jar_parts)

    def _cookie_has(self, name: str) -> bool:
        return bool(self._cookie and f"{name}=" in self._cookie)

    def _cookie_value(self, name: str) -> str | None:
        if not self._cookie:
            return None
        for part in self._cookie.split("; "):
            if part.startswith(f"{name}="):
                return part.split("=", 1)[1]
        return None

    async def _discover_site_id(self) -> str | None:
        for url in (
            f"{BASE_URL}/app-api/systems",
            f"{BASE_URL}/service/ensemble/api/v1/sites",
        ):
            try:
                data = await self._json("GET", url)
            except EnphaseApiError:
                continue
            site = _site_from_payload(data)
            if site:
                return site
        return None

    async def async_fetch_snapshot(self) -> JsonDict:
        """Fetch PowerPack SOC (+ power) via PES livestream (same as Enlighten web)."""
        result: JsonDict = {
            "site_id": self.site_id,
            "battery_soc": None,
            "pv_power": None,
            "consumption_power": None,
            "battery_power": None,
            "grid_power": None,
            "raw": {},
        }
        probes: list[str] = []

        await self.async_login()
        assert self.site_id
        result["site_id"] = self.site_id

        # 1) Discover PowerPack serial (HAR used serial_num=492523011111&device_type=pes;
        # devices.json alone often returns a different SN that livestream rejects.)
        devices: JsonDict | list[Any] | None = None
        try:
            devices = await self._json(
                "GET", f"{BASE_URL}/app-api/{self.site_id}/devices.json"
            )
            probes.append(
                f"devices_json: OK keys={_safe_keys(devices) if isinstance(devices, dict) else ['list']}"
            )
            result["raw"]["devices"] = devices
            _LOGGER.warning(
                "devices_json_payload=%s", json.dumps(devices, default=str)[:1500]
            )
        except EnphaseApiError as err:
            probes.append(f"devices_json: FAIL {err}")

        site_data: JsonDict | None = None
        try:
            site_data = await self._json(
                "GET",
                str(
                    URL(f"{BASE_URL}/app-api/{self.site_id}/data.json").update_query(
                        {"app": "1", "device_status": "non_retired", "is_mobile": "0"}
                    )
                ),
            )
            probes.append(f"data_json: OK keys={_safe_keys(site_data)[:12]}")
            result["raw"]["data_json"] = {
                "loggers": site_data.get("loggers") if isinstance(site_data, dict) else None,
                "module": site_data.get("module") if isinstance(site_data, dict) else None,
                "keys": _safe_keys(site_data) if isinstance(site_data, dict) else None,
            }
            if isinstance(site_data, dict) and site_data.get("loggers") is not None:
                _LOGGER.warning(
                    "data_json_loggers=%s",
                    json.dumps(site_data.get("loggers"), default=str)[:1500],
                )
        except EnphaseApiError as err:
            probes.append(f"data_json: FAIL {err}")

        settings: JsonDict | None = None
        try:
            settings = await self._json(
                "GET",
                f"{BASE_URL}/service/pes_management/systems/{self.site_id}/settings/latest",
            )
            probes.append(f"pes_settings: OK keys={_safe_keys(settings)[:12]}")
            result["raw"]["pes_settings"] = settings
            probes.append(f"pes_settings_shape={_numeric_leaf_summary(settings)}")
            # settings.soc is often hours/days stale (SyncPulse); only trust if fresh
            last_upd = _as_str(settings.get("last_updated"))
            age_h = _age_hours(last_upd)
            probes.append(f"pes_settings_age_h={age_h!s}")
            parsed_settings = _parse_pes_status(settings)
            if (
                parsed_settings.get("battery_soc") is not None
                and age_h is not None
                and age_h <= 2.0
            ):
                result["battery_soc"] = parsed_settings["battery_soc"]
                result["soc_source"] = "pes_settings.soc"
                probes.append(f"soc_from_pes_settings={parsed_settings['battery_soc']}")
            elif parsed_settings.get("battery_soc") is not None:
                probes.append(
                    f"ignored_stale_pes_settings_soc={parsed_settings['battery_soc']} age_h={age_h}"
                )
            _merge_snapshot(
                result,
                {
                    k: parsed_settings[k]
                    for k in (
                        "pv_power",
                        "consumption_power",
                        "battery_power",
                        "grid_power",
                    )
                    if parsed_settings.get(k) is not None
                },
            )
            _LOGGER.warning(
                "pes_settings_payload=%s", json.dumps(settings, default=str)[:1200]
            )
        except EnphaseApiError as err:
            probes.append(f"pes_settings: FAIL {err}")

        preferred_sn = (
            "492523011111"
            if str(self.site_id) == "5904582"
            else "202351024140"
            if str(self.site_id) == "5478356"
            else self._gateway_serial
        )
        uniq_serials = _rank_serials(
            _dedupe_serials(
                _pes_serials(devices)
                + _pes_serials(site_data)
                + _pes_serials(settings)
                + _logger_serials(site_data)
                + _all_serials(devices)
                + _all_serials(site_data)
                + _all_serials(settings)
                + _harvest_serials(devices)
                + _harvest_serials(site_data)
                + _harvest_serials(settings)
                + ([self._gateway_serial] if self._gateway_serial else [])
                + ([preferred_sn] if preferred_sn else [])
            ),
            preferred=preferred_sn,
        )
        if uniq_serials:
            probes.append(f"serials={uniq_serials[:8]}")
        else:
            probes.append("serials=none")

        # 2) Live MQTT — try ranked candidates (good PES SN first)
        live_ok = False
        tried_serials: set[str] = set()
        for serial in uniq_serials[:5]:
            tried_serials.add(serial)
            authz = await self._try_pes_livestream(serial, probes)
            if not authz:
                continue
            live = await self._mqtt_from_authorizer(
                authz, probes, label=f"pes_live({serial[-4:]})", serial=serial
            )
            if live:
                self._gateway_serial = serial
                _apply_live(result, live, probes, source=f"pes_livestream:{serial[-4:]}")
                live_ok = True
                break

        # 3) PES today time-series (HAR: ~5KB) — last sample for power/SOC fallback
        try:
            today = await self._json(
                "GET",
                f"{BASE_URL}/service/pes_management/systems/{self.site_id}/today",
            )
            probes.append(f"pes_today: OK keys={_safe_keys(today)[:12]}")
            result["raw"]["pes_today"] = today
            parsed_today = _parse_pes_today(today)
            probes.append(f"pes_today_shape={_numeric_leaf_summary(today)}")
            if parsed_today:
                if live_ok:
                    # Only fill gaps; live stream wins
                    _merge_snapshot(result, parsed_today)
                else:
                    _apply_live(result, parsed_today, probes, source="pes_today")
        except EnphaseApiError as err:
            probes.append(f"pes_today: FAIL {err}")

        # 4) PES status — operating mode + last-known SOC (often stale vs app live %)
        path = f"/service/pes_management/systems/{self.site_id}/status"
        pes: JsonDict | None = None
        try:
            pes = await self._json("GET", f"{BASE_URL}{path}")
            probes.append(f"pes_status: OK keys={_safe_keys(pes)[:12]}")
        except EnphaseSessionExpired as err:
            probes.append(f"pes_status: session expired ({err}); re-login")
            await self.async_login()
            try:
                pes = await self._json("GET", f"{BASE_URL}{path}")
                probes.append(f"pes_status_retry: OK keys={_safe_keys(pes)[:12]}")
            except EnphaseApiError as retry_err:
                probes.append(f"pes_status_retry: FAIL {retry_err}")
        except EnphaseApiError as err:
            probes.append(f"pes_status: FAIL {err}")

        if pes:
            result["raw"]["pes_status"] = pes
            result["operating_mode"] = pes.get("operatingMode")
            result["unit_status"] = pes.get("unitStatus")
            result["grid_connection_status"] = pes.get("gridConnectionStatus")
            result["last_report_date"] = pes.get("lastReportDate")
            parsed = _parse_pes_status(pes)
            probes.append(f"pes_status_shape={_numeric_leaf_summary(pes)}")
            # pes_status.soc is often hours stale vs the app (e.g. 35% vs 99%).
            # Only keep power fields from it; never promote status SOC unless live worked
            # and somehow left SOC empty.
            power_only = {
                k: parsed[k]
                for k in (
                    "pv_power",
                    "consumption_power",
                    "battery_power",
                    "grid_power",
                )
                if parsed.get(k) is not None
            }
            _merge_snapshot(result, power_only)
            if live_ok and result.get("battery_soc") is None and parsed.get("battery_soc") is not None:
                result["battery_soc"] = parsed["battery_soc"]
                result["soc_source"] = "pes_status.soc"
                probes.append(f"soc_from_pes_status={parsed['battery_soc']}")
            elif not live_ok and parsed.get("battery_soc") is not None:
                probes.append(
                    f"ignored_stale_pes_status_soc={parsed['battery_soc']}"
                )
            for serial in _dedupe_serials(
                _pes_serials(pes) + _all_serials(pes) + _harvest_serials(pes)
            ):
                if serial not in uniq_serials:
                    uniq_serials.append(serial)

        if not live_ok or result.get("pv_power") is None:
            # IQ Gateway / Envoy Live Status (protobuf MQTT) — house PV array
            envoy_live = await self._fetch_envoy_livestream(probes)
            if envoy_live:
                _apply_live(result, envoy_live, probes, source="envoy_livestream")
                live_ok = True

        _LOGGER.warning(
            "Enphase PowerPack probe site=%s soc=%s (src=%s) pv=%s load=%s batt=%s grid=%s | %s",
            self.site_id,
            result["battery_soc"],
            result.get("soc_source"),
            result["pv_power"],
            result["consumption_power"],
            result["battery_power"],
            result["grid_power"],
            " ; ".join(probes),
        )
        return result

    async def _try_pes_livestream(
        self,
        serial: str,
        probes: list[str],
        *,
        label: str = "pes_livestream",
    ) -> JsonDict | None:
        """Authorize PES MQTT live stream for a serial (HAR: device_type=pes)."""
        tag = f"{label}({serial[-4:]})"
        try:
            authz = await self._json(
                "GET",
                str(
                    URL(f"{BASE_URL}/pv/aws_sigv4/livestream.json").update_query(
                        {"serial_num": serial, "device_type": "pes"}
                    )
                ),
            )
        except EnphaseApiError as err:
            probes.append(f"{tag}: FAIL {err}")
            return None
        probes.append(f"{tag}: OK keys={_safe_keys(authz)[:10]}")
        return authz

    async def _mqtt_from_authorizer(
        self,
        authorizer: JsonDict,
        probes: list[str],
        *,
        label: str,
        serial: str | None = None,
    ) -> JsonDict | None:
        topic = _as_str(
            authorizer.get("live_stream_topic")
            or authorizer.get("topic")
            or authorizer.get("mqttTopic")
        )
        endpoint = _as_str(
            authorizer.get("aws_iot_endpoint")
            or authorizer.get("endpoint")
            or authorizer.get("iotEndpoint")
        )
        signed_url = _as_str(authorizer.get("signed_url"))
        username = self._mqtt_username(authorizer)
        if not topic or not (endpoint or signed_url):
            nested = authorizer.get("data")
            if isinstance(nested, dict):
                return await self._mqtt_from_authorizer(
                    nested, probes, label=label, serial=serial
                )
            probes.append(
                f"{label}: authorizer incomplete "
                f"(topic={bool(topic)} endpoint={bool(endpoint)} signed={bool(signed_url)})"
            )
            return None
        probes.append(f"{label}_topic={topic[:90]}")

        # PES/ojas live frames arrive on the SigV4 signed_url socket as JSON.
        # Custom-authorizer username connects but never receives publishes.
        errors: list[str] = []
        attempts: list[tuple[str, str | None, str | None]] = []
        is_ojas = "ojas" in topic.lower() or "pes" in topic.lower()
        if signed_url:
            attempts.append(("signed_url", signed_url, None))
        if endpoint and username and not is_ojas:
            attempts.append(("custom_auth", endpoint, username))
        if not attempts and endpoint and username:
            attempts.append(("custom_auth", endpoint, username))

        # Lightweight capability ping only — do not spam missing start_live_stream paths
        try:
            await self._json(
                "GET", f"{BASE_URL}/app-api/{self.site_id}/show_livestream"
            )
        except EnphaseApiError:
            pass

        for mode, ep_or_url, user in attempts:
            try:
                payload = await self._read_mqtt_publish(
                    endpoint=ep_or_url if mode == "custom_auth" else None,
                    signed_url=ep_or_url if mode == "signed_url" else None,
                    topic=topic,
                    username=user,
                    timeout_s=25.0 if is_ojas else 40.0,
                    probes=probes,
                    label=f"{label}/{mode}",
                )
            except Exception as err:  # noqa: BLE001
                errors.append(f"{mode}:{type(err).__name__}:{err!r}")
                continue
            decoded = _decode_live_status_payload(payload)
            if not decoded:
                probes.append(
                    f"{label}/{mode}: undecoded len={len(payload)} head={payload[:24].hex()}"
                )
                _LOGGER.warning(
                    "%s undecoded mqtt payload head=%s text=%s",
                    label,
                    payload[:80].hex(),
                    payload[:200],
                )
                continue
            probes.append(f"{label}/{mode}_mqtt: OK keys={list(decoded)}")
            return decoded

        probes.append(f"{label}_mqtt: FAIL {' | '.join(errors) or 'no attempts'}")
        return None

    async def _kick_pes_live_stream(
        self, probes: list[str], *, serial: str | None
    ) -> None:
        """Best-effort wake/start for PES MQTT (mirrors EVSE/HEMS live-stream enable)."""
        assert self.site_id

        # Enable site live-stream transport (HEMS), then capability check.
        for path, body in (
            (
                f"https://hems-integration.enphaseenergy.com/api/v1/hems/{self.site_id}/live-stream/status",
                {"livestream-enabled": True},
            ),
            (
                f"https://hems-integration.enphaseenergy.com/api/v1/hems/{self.site_id}/live-stream/vitals",
                {"livestream-enabled": True},
            ),
        ):
            try:
                data = await self._json_put(path, body)
                probes.append(
                    f"hems_enable({path.rsplit('/', 1)[-1]}): OK keys={_safe_keys(data)[:8]}"
                )
            except EnphaseApiError as err:
                probes.append(f"hems_enable({path.rsplit('/', 1)[-1]}): FAIL {err}")

        paths = [
            f"/service/pes_management/systems/{self.site_id}/start_live_stream",
            f"/service/pes_management/systems/{self.site_id}/live_stream/start",
            f"/service/pes_management/systems/{self.site_id}/retry_start_live_stream",
            f"/app-api/{self.site_id}/show_livestream",
        ]
        if serial:
            paths.extend(
                [
                    f"/service/pes_management/systems/{self.site_id}/devices/{serial}/start_live_stream",
                    f"/service/pes_management/systems/{self.site_id}/devices/{serial}/retry_start_live_stream",
                ]
            )
        for path in paths:
            try:
                data = await self._json("GET", f"{BASE_URL}{path}")
                probes.append(
                    f"kick({path.rsplit('/', 1)[-1]}): OK {json.dumps(data, default=str)[:120]}"
                )
            except EnphaseApiError as err:
                msg = str(err)
                if "404" in msg or "HTML" in msg:
                    probes.append(f"kick({path.rsplit('/', 1)[-1]}): miss")
                    continue
                if "429" in msg:
                    probes.append(f"kick({path.rsplit('/', 1)[-1]}): rate-limited")
                    return
                probes.append(f"kick({path.rsplit('/', 1)[-1]}): FAIL {err}")

    async def _fetch_envoy_livestream(self, probes: list[str]) -> JsonDict | None:
        """Read one IQ Gateway / Envoy Live Status MQTT frame (protobuf)."""
        serials = await self._discover_gateway_serials()
        preferred = (
            "202351024140"
            if str(self.site_id) == "5478356"
            else None
        )
        if preferred and preferred not in serials:
            serials = [preferred] + serials
        if not serials:
            probes.append("envoy_serial: none found")
            return None
        probes.append(f"envoy_serial_candidates={serials[:4]}")

        for serial in serials[:6]:
            for dtype in ("emu", "envoy", "iq_gateway", "gateway"):
                try:
                    authorizer = await self._json(
                        "GET",
                        str(
                            URL(f"{BASE_URL}/pv/aws_sigv4/livestream.json").update_query(
                                {"serial_num": serial, "device_type": dtype}
                            )
                        ),
                    )
                except EnphaseApiError as err:
                    probes.append(f"envoy_auth({serial[-4:]}/{dtype}): FAIL {err}")
                    continue

                topic = _as_str(authorizer.get("live_stream_topic"))
                endpoint = _as_str(authorizer.get("aws_iot_endpoint"))
                username = self._mqtt_username(authorizer)
                if not topic or not endpoint or not username:
                    probes.append(f"envoy_auth({serial[-4:]}/{dtype}): incomplete")
                    continue

                try:
                    await self._json(
                        "GET", f"{BASE_URL}/app-api/{self.site_id}/show_livestream"
                    )
                except EnphaseApiError:
                    pass

                try:
                    payload = await self._read_mqtt_publish(
                        endpoint=endpoint,
                        topic=topic,
                        username=username,
                        timeout_s=25.0,
                        probes=probes,
                        label=f"envoy({serial[-4:]}/{dtype})",
                    )
                except Exception as err:  # noqa: BLE001
                    probes.append(f"envoy_mqtt({serial[-4:]}/{dtype}): FAIL {err}")
                    continue

                decoded = _decode_live_status_payload(payload)
                if not decoded:
                    probes.append(
                        f"envoy_mqtt({serial[-4:]}/{dtype}): undecoded "
                        f"len={len(payload)} head={payload[:12].hex()}"
                    )
                    continue

                self._gateway_serial = serial
                decoded["gateway_serial"] = serial
                probes.append(
                    f"envoy_live({serial[-4:]}/{dtype}): OK "
                    f"pv={decoded.get('pv_power')} load={decoded.get('consumption_power')} "
                    f"grid={decoded.get('grid_power')}"
                )
                return decoded

        return None

    async def _fetch_live_status(self, probes: list[str]) -> JsonDict | None:
        """Back-compat alias."""
        return await self._fetch_envoy_livestream(probes)

    def _mqtt_username(self, authorizer: JsonDict) -> str | None:
        authorizer_name = _as_str(authorizer.get("aws_authorizer"))
        token_key = _as_str(authorizer.get("aws_token_key"))
        token_value = _as_str(authorizer.get("aws_token_value"))
        digest = _as_str(authorizer.get("aws_digest"))
        if not authorizer_name or not token_key or not token_value or not digest:
            return None
        if not self.site_id:
            return None
        return "?" + urlencode(
            {
                "x-amz-customauthorizer-name": authorizer_name,
                token_key: token_value,
                "site-id": str(self.site_id),
                "x-amz-customauthorizer-signature": digest,
                "env": "production",
            }
        )

    async def _discover_gateway_serials(self) -> list[str]:
        """Return candidate gateway / PowerPack serials (best first)."""
        found: list[str] = []
        if self._gateway_serial:
            found.append(self._gateway_serial)

        def add(serial: str | None) -> None:
            if serial and serial not in found:
                found.append(serial)

        try:
            phase_map = await self._json(
                "GET",
                f"{BASE_URL}/app-api/{self.site_id}/phase_map_multiple_envoy",
            )
            add(_serial_from_phase_map(phase_map))
            for key, meta in phase_map.items():
                if isinstance(meta, dict):
                    add(_as_str(key))
        except EnphaseApiError:
            pass

        for path in (
            f"/app-api/{self.site_id}/devices.json",
            f"/pv/systems/{self.site_id}/system_dashboard/devices-tree",
            f"/service/ensemble/api/v1/sites/{self.site_id}/devices",
            f"/service/pes_management/systems/{self.site_id}/devices",
        ):
            try:
                data = await self._json("GET", f"{BASE_URL}{path}")
            except EnphaseApiError:
                continue
            for serial in _all_serials(data):
                add(serial)

        return found

    async def _read_mqtt_publish(
        self,
        *,
        endpoint: str | None,
        topic: str,
        username: str | None,
        timeout_s: float,
        signed_url: str | None = None,
        probes: list[str] | None = None,
        label: str = "mqtt",
    ) -> bytes:
        if signed_url:
            ws_url = signed_url
            if ws_url.startswith("https://"):
                ws_url = "wss://" + ws_url[len("https://") :]
            elif ws_url.startswith("http://"):
                ws_url = "ws://" + ws_url[len("http://") :]
            elif "://" not in ws_url and endpoint:
                ws_url = f"wss://{endpoint}/mqtt?{ws_url.lstrip('?')}"
            elif "://" not in ws_url:
                ws_url = f"wss://{ws_url}"
        else:
            assert endpoint
            ws_url = f"wss://{endpoint}/mqtt"

        client_id = f"ha-enphase-pp-{uuid.uuid4().hex[:18]}"
        deadline = asyncio.get_running_loop().time() + timeout_s
        if probes is not None:
            probes.append(f"{label}: connecting")

        async with self._session.ws_connect(
            ws_url,
            protocols=("mqtt",),
            headers={"Origin": BASE_URL, "User-Agent": BROWSER_UA},
            heartbeat=20,
            timeout=aiohttp.ClientTimeout(total=timeout_s + 5),
        ) as ws:
            await ws.send_bytes(_mqtt_connect_packet(client_id, username))
            _, connack = await _wait_for_mqtt_packet(ws, {0x20}, deadline=deadline)
            _validate_mqtt_connack(connack)
            if probes is not None:
                probes.append(f"{label}: connack_ok")
            await ws.send_bytes(_mqtt_subscribe_packet(topic))
            _, suback = await _wait_for_mqtt_packet(ws, {0x90}, deadline=deadline)
            _validate_mqtt_suback(suback)
            if probes is not None:
                probes.append(f"{label}: subscribed, waiting_publish")
            # Do NOT publish to the live-stream topic — AWS IoT drops the socket
            # when this client lacks publish permission (seen as immediate WS close).
            packet_type, publish = await _wait_for_mqtt_publish_with_ping(
                ws, deadline=deadline
            )
            return _mqtt_publish_payload(packet_type, publish)

    async def _json(self, method: str, url: str) -> JsonDict:
        # Cookie jar carries the session; only add e-auth-token explicitly.
        self._refresh_cookie_header()
        headers = {
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{BASE_URL}/web/{self.site_id or ''}/dashboard",
            "Origin": BASE_URL,
            "User-Agent": BROWSER_UA,
        }
        token = self._manager_token or self._session_id
        if token:
            headers["e-auth-token"] = token

        async with self._session.request(
            method,
            url,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            if resp.status in (401, 403):
                raise EnphaseSessionExpired(f"{method} {url} -> {resp.status}")
            if resp.status == 429:
                raise EnphaseApiError(f"{method} {url} -> 429 rate-limited")
            return await self._parse_json_response(method, url, resp)

    async def _json_put(self, url: str, body: JsonDict) -> JsonDict:
        self._refresh_cookie_header()
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{BASE_URL}/web/{self.site_id or ''}/dashboard",
            "Origin": BASE_URL,
            "User-Agent": BROWSER_UA,
        }
        token = self._manager_token or self._session_id
        if token:
            headers["e-auth-token"] = token
        async with self._session.request(
            "PUT",
            url,
            headers=headers,
            json=body,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            if resp.status in (401, 403):
                raise EnphaseSessionExpired(f"PUT {url} -> {resp.status}")
            if resp.status == 429:
                raise EnphaseApiError(f"PUT {url} -> 429 rate-limited")
            return await self._parse_json_response("PUT", url, resp)

    async def _parse_json_response(
        self, method: str, url: str, resp: aiohttp.ClientResponse
    ) -> JsonDict:
        text = await resp.text()
        if resp.status >= 400:
            raise EnphaseApiError(f"{method} {url} -> {resp.status}: {text[:200]}")

        stripped = text.lstrip()
        if not stripped:
            raise EnphaseApiError(f"{method} {url} -> empty body")
        if stripped.startswith("<!") or stripped.lower().startswith("<html"):
            kind = "login" if "login" in stripped.lower()[:800] else "html"
            raise EnphaseSessionExpired(
                f"{method} {url} -> {kind} page instead of JSON ({text[:80]!r})"
            )

        try:
            data = json.loads(text)
        except Exception as err:  # noqa: BLE001
            raise EnphaseApiError(
                f"{method} {url} -> non-JSON body: {text[:120]!r}"
            ) from err

        if isinstance(data, dict):
            return data
        if isinstance(data, list):
            return {"items": data}
        return {}


def _site_from_payload(data: Any) -> str | None:
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return _as_str(data[0].get("system_id") or data[0].get("id") or data[0].get("site_id"))
    if isinstance(data, dict):
        direct = _as_str(data.get("system_id") or data.get("id") or data.get("site_id"))
        if direct:
            return direct
        for key in ("systems", "data", "items", "sites"):
            systems = data.get(key)
            if isinstance(systems, list) and systems and isinstance(systems[0], dict):
                return _as_str(
                    systems[0].get("system_id") or systems[0].get("id") or systems[0].get("site_id")
                )
    return None


def _age_hours(iso_ts: str | None) -> float | None:
    """Hours since an ISO-8601 timestamp, or None if unparseable."""
    if not iso_ts:
        return None
    try:
        from datetime import datetime, timezone

        text = iso_ts.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
    except Exception:  # noqa: BLE001
        return None


def _as_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_keys(payload: JsonDict) -> list[str]:
    return sorted(str(k) for k in payload.keys())[:40]


def _apply_live(
    result: JsonDict,
    live: JsonDict,
    probes: list[str],
    *,
    source: str,
) -> None:
    """Merge live MQTT/PES frame into snapshot, preferring live SOC/power."""
    for key in (
        "battery_soc",
        "pv_power",
        "consumption_power",
        "battery_power",
        "grid_power",
        "battery_power_source",
        "storage_w",
    ):
        if live.get(key) is not None:
            result[key] = live[key]
    if live.get("battery_soc") is not None:
        result["soc_source"] = source
        probes.append(f"soc_from_{source}={live['battery_soc']}")
    probes.append(f"live_from_{source}={ {k: live.get(k) for k in ('pv_power','consumption_power','battery_power','grid_power','battery_power_source','storage_w') if live.get(k) is not None} }")


def _merge_snapshot(target: JsonDict, source: JsonDict) -> None:
    for key in (
        "battery_soc",
        "pv_power",
        "consumption_power",
        "battery_power",
        "grid_power",
    ):
        if target.get(key) is None and source.get(key) is not None:
            target[key] = source[key]


def _dedupe_serials(serials: Iterable[str | None]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for serial in serials:
        text = _as_str(serial)
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _rank_serials(serials: list[str], *, preferred: str | None = None) -> list[str]:
    """Prefer real Enphase PES/gateway SNs; drop timestamps / INT_MAX junk."""

    def score(serial: str) -> tuple[int, str]:
        if preferred and serial == preferred:
            return (0, serial)
        if serial.startswith("49252") and len(serial) == 12:
            return (1, serial)
        if serial.startswith("492") and len(serial) >= 10:
            return (2, serial)
        if len(serial) == 12 and serial.isdigit():
            return (3, serial)
        # Unix-ish timestamps and sentinel values
        if serial in {"2147483647"} or (serial.isdigit() and 1_600_000_000 <= int(serial) <= 2_000_000_000):
            return (9, serial)
        return (5, serial)

    filtered = [s for s in serials if score(s)[0] < 9]
    return sorted(filtered or serials, key=score)


def _logger_serials(payload: Any) -> list[str]:
    """Extract serials from data.json `loggers` (often the PES/gateway SN)."""
    if not isinstance(payload, dict):
        return []
    loggers = payload.get("loggers")
    found: list[str] = []
    if isinstance(loggers, dict):
        # Sometimes keyed by serial
        for key, meta in loggers.items():
            key_s = _as_str(key)
            if key_s and key_s.isdigit() and 10 <= len(key_s) <= 16:
                found.append(key_s)
            found.extend(_all_serials(meta))
            found.extend(_harvest_serials(meta))
    else:
        found.extend(_all_serials(loggers))
        found.extend(_harvest_serials(loggers))
    return _dedupe_serials(found)


def _harvest_serials(payload: Any) -> list[str]:
    """Pull Enphase-looking serial numbers from any nested JSON."""
    found: list[str] = []
    blob = json.dumps(payload, default=str) if payload is not None else ""
    for match in re.findall(r"\b(\d{10,16})\b", blob):
        if match not in found:
            found.append(match)

    def walk(obj: Any, depth: int = 0) -> None:
        if depth > 10:
            return
        if isinstance(obj, dict):
            for key, value in obj.items():
                key_l = str(key).lower()
                if any(
                    tok in key_l
                    for tok in ("serial", "sn", "eid", "emu", "gateway", "pes")
                ):
                    text = _as_str(value)
                    if text and text.isdigit() and 10 <= len(text) <= 16:
                        if text not in found:
                            found.append(text)
                walk(value, depth + 1)
        elif isinstance(obj, list):
            for item in obj[:100]:
                walk(item, depth + 1)

    walk(payload)
    return found


def _pes_serials(payload: Any) -> list[str]:
    """Prefer serials explicitly tagged as PES / PowerPack."""
    preferred: list[str] = []
    tokens = (
        "pes",
        "powerpack",
        "power_pack",
        "power pack",
        "portable",
        "iq powerpack",
    )

    def walk(obj: Any, depth: int = 0) -> None:
        if depth > 10:
            return
        if isinstance(obj, dict):
            dtype = str(
                obj.get("device_type")
                or obj.get("type")
                or obj.get("product")
                or obj.get("model")
                or obj.get("category")
                or obj.get("name")
                or ""
            ).lower()
            serial = _as_str(
                obj.get("serial_num")
                or obj.get("serial_number")
                or obj.get("serialNumber")
                or obj.get("serial")
                or obj.get("sn")
            )
            if serial and len(serial) >= 6 and any(tok in dtype for tok in tokens):
                if serial not in preferred:
                    preferred.append(serial)
            for value in obj.values():
                walk(value, depth + 1)
        elif isinstance(obj, list):
            for item in obj[:80]:
                walk(item, depth + 1)

    walk(payload)
    return preferred


def _parse_pes_today(payload: JsonDict) -> JsonDict:
    """Parse PES /today time series — prefer the last sample with SOC/power."""
    # Flatten candidate sample dicts from common Enlighten shapes.
    samples: list[JsonDict] = []

    def collect(obj: Any, depth: int = 0) -> None:
        if depth > 8:
            return
        if isinstance(obj, dict):
            keys = {str(k).lower() for k in obj}
            if keys & {
                "soc",
                "pv_power",
                "pvpower",
                "load_power",
                "loadpower",
                "battery_power",
                "batterypower",
                "grid_power",
                "gridpower",
                "production",
                "consumption",
                "power",
            }:
                samples.append(obj)
            for value in obj.values():
                collect(value, depth + 1)
        elif isinstance(obj, list):
            for item in obj:
                collect(item, depth + 1)

    collect(payload)

    # Walk newest-first when list order is chronological.
    for sample in reversed(samples):
        parsed = _parse_pes_status(sample)
        if any(parsed.get(k) is not None for k in parsed):
            return parsed

    # Whole-payload scrape as last resort
    return _parse_pes_status(payload)


def _parse_ojas_live(payload: JsonDict) -> JsonDict | None:
    """Parse PES/ojas MQTT JSON frame (confirmed live against Enlighten UI).

    Prefer the ``ui*`` fields the Enlighten PowerPack page renders:
      uiSolP, uiACP, uiBatP, uiImpP
    ``storage_W`` is an internal figure and does not match the UI discharge value.
    """
    if (
        "soc" not in payload
        and "uiBatP" not in payload
        and "load_ac_W" not in payload
        and "storage_W" not in payload
    ):
        return None

    out: JsonDict = {}
    soc = _to_float(payload.get("soc"))
    if soc is not None and 0 <= soc <= 100:
        out["battery_soc"] = soc

    # Production — UI solar power, then raw PV produce
    pv = _to_float(payload.get("uiSolP"))
    if pv is None:
        pv = 0.0
        pv_parts = False
        for key in ("pv_dc_produce_W", "ext_ac_produce_W"):
            num = _to_float(payload.get(key))
            if num is not None:
                pv += abs(num)
                pv_parts = True
        if not pv_parts:
            pv = None
    if pv is not None:
        out["pv_power"] = abs(pv)

    # Load / consuming
    load = _to_float(payload.get("uiACP"))
    if load is None:
        load = 0.0
        load_parts = False
        for key in ("load_ac_W", "load_dc_usb_W", "load_dc_aux_W"):
            num = _to_float(payload.get(key))
            if num is not None:
                load += abs(num)
                load_parts = True
        if not load_parts:
            load = _to_float(payload.get("pcu_output_W"))
    if load is not None:
        out["consumption_power"] = abs(load)

    # Battery power — Enlighten "Discharging" / charge label uses uiBatP.
    # Never use storage_W (internal DC figure; ~28 W when UI shows ~16 W).
    batt = _to_float(payload.get("uiBatP"))
    if batt is None:
        # Fallbacks that still match the UI energy map, not storage_W
        bat2load = _to_float(payload.get("uiBat2Load"))
        # uiBat2Load is often a 0/1 flag, not watts — only use if it looks like power
        if bat2load is not None and bat2load > 1:
            batt = bat2load
        else:
            charge_in = (_to_float(payload.get("uiImp2bat")) or 0) + (
                _to_float(payload.get("uiSol2bat")) or 0
            )
            if charge_in > 0:
                batt = charge_in
    if batt is not None:
        charging = (
            _to_float(payload.get("uiImp2bat")) or 0
        ) > 0 or (
            _to_float(payload.get("uiSol2bat")) or 0
        ) > 0
        # uiBat2Load is a discharge flag (0/1) on live frames
        discharging = (_to_float(payload.get("uiBat2Load")) or 0) > 0
        if charging and not discharging:
            out["battery_power"] = -abs(batt)
        else:
            out["battery_power"] = abs(batt) if discharging or batt != 0 else 0.0
        out["battery_power_source"] = "uiBatP"
        storage_raw = _to_float(payload.get("storage_W"))
        if storage_raw is not None:
            out["storage_w"] = storage_raw

    # Grid import shown on UI
    grid = _to_float(payload.get("uiImpP"))
    if grid is None:
        grid = _to_float(payload.get("grid_import_W"))
    if grid is not None:
        out["grid_power"] = grid

    return out or None


def _parse_pes_status(payload: JsonDict) -> JsonDict:
    """Parse IQ PowerPack / PES status payload."""
    # Prefer ojas live JSON shape when present
    ojas = _parse_ojas_live(payload)
    if ojas and ojas.get("battery_soc") is not None:
        return ojas

    out: JsonDict = {}

    # Top-level soc — often stale vs livestream; still useful as fallback.
    soc = _to_float(payload.get("soc"))
    if soc is None:
        # Sometimes nested under unitStatus / battery
        for container_key in ("unitStatus", "battery", "status", "data"):
            container = payload.get(container_key)
            if isinstance(container, dict):
                soc = _to_float(container.get("soc") or container.get("current_charge"))
                if soc is not None:
                    break
    if soc is not None and 0 <= soc <= 100:
        out["battery_soc"] = soc

    # Map power-like leaves into our sensors.
    power_map = {
        "pv_power": (
            "pv_power",
            "pvPower",
            "solar_power",
            "solarPower",
            "dcSolarPower",
            "dc_solar_power",
            "solarInputPower",
            "inputSolarPower",
            "pvInputPower",
        ),
        "consumption_power": (
            "consumption_power",
            "consumptionPower",
            "load_power",
            "loadPower",
            "acOutputPower",
            "ac_output_power",
            "outputPower",
            "output_power",
            "home_power",
            "appliancePower",
        ),
        "battery_power": (
            "battery_power",
            "batteryPower",
            "storage_power",
            "batt_power",
            "dischargePower",
            "chargePower",
        ),
        "grid_power": (
            "grid_power",
            "gridPower",
            "acInputPower",
            "ac_input_power",
            "gridChargePower",
            "grid_charge_power",
            "wallPower",
            "acChargePower",
        ),
    }

    for target, keys in power_map.items():
        value = _find_number(payload, keys=keys)
        if value is not None:
            out[target] = value

    # Fallback: any *Power / *Watts leaf that we can classify by name
    if len([k for k in out if k.endswith("_power")]) == 0:
        for path, num in _iter_numeric_leaves(payload):
            low = path.lower()
            if "soc" in low or "percent" in low or "reserve" in low:
                continue
            if "power" not in low and "watt" not in low:
                continue
            if any(tok in low for tok in ("solar", "pv", "panel")) and "pv_power" not in out:
                out["pv_power"] = num
            elif any(tok in low for tok in ("load", "output", "consum", "appliance")) and (
                "consumption_power" not in out
            ):
                out["consumption_power"] = num
            elif any(tok in low for tok in ("grid", "acinput", "ac_input", "wall")) and (
                "grid_power" not in out
            ):
                out["grid_power"] = num
            elif any(tok in low for tok in ("batt", "storage", "discharge")) and (
                "battery_power" not in out
            ):
                out["battery_power"] = num

    return out


def _parse_battery_status(payload: JsonDict) -> JsonDict:
    """Parse /pv/settings/<site>/battery_status.json — current_charge only."""
    out: JsonDict = {}
    charge = payload.get("current_charge")
    soc = _to_float(charge)
    if soc is None and isinstance(payload.get("storages"), list):
        values: list[float] = []
        for item in payload["storages"]:
            if isinstance(item, dict):
                num = _to_float(item.get("current_charge"))
                if num is not None:
                    values.append(num)
        if values:
            soc = sum(values) / len(values)
    if soc is not None:
        out["battery_soc"] = soc
    return out


def _numeric_leaf_summary(payload: Any, *, limit: int = 24) -> str:
    """Compact diagnostic of numeric leaves (no secrets)."""
    parts: list[str] = []
    for path, num in _iter_numeric_leaves(payload):
        parts.append(f"{path}={num:g}")
        if len(parts) >= limit:
            break
    # Also note non-numeric top-level enums useful for PowerPack
    if isinstance(payload, dict):
        for key in ("operatingMode", "unitStatus", "gridConnectionStatus"):
            if key in payload and not isinstance(payload[key], (dict, list)):
                parts.append(f"{key}={payload[key]!s}"[:60])
    return "{" + ", ".join(parts) + "}"


def _iter_numeric_leaves(payload: Any, prefix: str = "") -> list[tuple[str, float]]:
    found: list[tuple[str, float]] = []

    def walk(obj: Any, path: str, depth: int = 0) -> None:
        if depth > 6 or len(found) > 40:
            return
        if isinstance(obj, dict):
            for k, v in obj.items():
                walk(v, f"{path}.{k}" if path else str(k), depth + 1)
        elif isinstance(obj, list):
            for i, item in enumerate(obj[:10]):
                walk(item, f"{path}[{i}]", depth + 1)
        else:
            num = _to_float(obj)
            if num is not None:
                found.append((path, num))

    walk(payload, prefix)
    return found


def _parse_latest_power_watts(payload: JsonDict) -> float | None:
    sample = payload.get("latest_power")
    if not isinstance(sample, dict):
        data = payload.get("data")
        if isinstance(data, dict):
            nested = data.get("latest_power")
            sample = nested if isinstance(nested, dict) else data
        else:
            sample = payload
    if not isinstance(sample, dict):
        return None
    value = _to_float(sample.get("value"))
    if value is None:
        return None
    units = str(sample.get("units") or "W").strip().lower()
    if units in ("w", "watt", "watts", ""):
        return value
    if units in ("kw", "kilowatt", "kilowatts"):
        return value * 1000.0
    if units in ("mw", "milliwatt", "milliwatts"):
        return value / 1000.0
    return None


def _parse_explicit_soc_and_power(payload: Any, *, source: str) -> JsonDict:
    """Pull SOC/power only from explicit live-telemetry key names."""
    soc_keys = (
        "current_charge",
        "battery_soc",
        "state_of_charge",
        "stateOfCharge",
        "enc_agg_soc",
        "percentFull",
        "batteryPercentFull",
        "last_reported_aggregate_soc",
        "last_reported_soc",
        "socPercent",
        "soc_percent",
    )
    # Never treat reserve/backup/config percentages as SOC.
    deny = {
        "reserved_soc",
        "reserve_soc",
        "backup_soc",
        "configured_backup_soc",
        "adjusted_backup_soc",
        "batterybackuppercentage",
        "battery_backup_percentage",
        "previousbatterybackuppercentage",
        "verylowsoc",
        "percent",  # too generic
        "soc",  # too generic alone (matches reserved_soc? no - exact key match)
    }
    found_soc: float | None = None
    found_key: str | None = None

    def walk_soc(obj: Any, depth: int = 0) -> None:
        nonlocal found_soc, found_key
        if depth > 8 or found_soc is not None:
            return
        if isinstance(obj, dict):
            for k, v in obj.items():
                kl = str(k).lower()
                if kl in deny or "reserve" in kl or "backup" in kl:
                    walk_soc(v, depth + 1)
                    continue
                if kl in {s.lower() for s in soc_keys} or kl in {
                    "currentcharge",
                    "current_charge",
                }:
                    num = _to_float(v)
                    if num is not None and 0 <= num <= 100:
                        found_soc = num
                        found_key = str(k)
                        return
                walk_soc(v, depth + 1)
        elif isinstance(obj, list):
            for item in obj[:40]:
                walk_soc(item, depth + 1)

    walk_soc(payload)
    out = _scrape_power_only(payload)
    if found_soc is not None:
        out["battery_soc"] = found_soc
        out["soc_key"] = found_key
    return out


def _scrape_power_only(payload: Any) -> JsonDict:
    """Best-effort scrape of power keys only (never SOC)."""
    return {
        "pv_power": _find_number(
            payload,
            keys=("pv_power", "pvPower", "production_power", "solar_power"),
        ),
        "consumption_power": _find_number(
            payload,
            keys=(
                "consumption_power",
                "consumptionPower",
                "load_power",
                "loadPower",
                "home_power",
            ),
        ),
        "battery_power": _find_number(
            payload,
            keys=("battery_power", "batteryPower", "storage_power", "storagePower"),
        ),
        "grid_power": _find_number(
            payload,
            keys=("grid_power", "gridPower", "net_power", "netPower"),
        ),
    }


def _scrape_numbers(payload: Any) -> JsonDict:
    """Deprecated combined scrape — kept for callers; SOC omitted."""
    return _scrape_power_only(payload)


def _find_number(node: Any, keys: tuple[str, ...]) -> float | None:
    """Depth-first search for the first numeric value under known key names."""
    keyset = {k.lower() for k in keys}
    found: list[float] = []

    def walk(obj: Any, depth: int = 0) -> None:
        if depth > 8 or found:
            return
        if isinstance(obj, dict):
            for k, v in obj.items():
                if str(k).lower() in keyset:
                    num = _to_float(v)
                    if num is not None:
                        found.append(num)
                        return
                walk(v, depth + 1)
        elif isinstance(obj, list):
            for item in obj[:25]:
                walk(item, depth + 1)

    walk(node)
    return found[0] if found else None


def _to_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict):
        for key in ("value", "v", "amount", "power"):
            if key in value:
                return _to_float(value[key])
        return None
    if isinstance(value, str):
        text = value.strip().replace("%", "").replace(",", "")
        try:
            return float(text)
        except ValueError:
            return None
    return None


def _serial_from_phase_map(payload: JsonDict) -> str | None:
    primary: str | None = None
    default: str | None = None
    any_serial: str | None = None
    for serial, meta in payload.items():
        if not isinstance(meta, dict):
            continue
        text = _as_str(serial)
        if not text or text in ("items",):
            continue
        any_serial = any_serial or text
        if meta.get("isPrimaryGateway") is True:
            primary = text
        if meta.get("isDefaultGateway") is True:
            default = text
    return primary or default or any_serial


def _serial_from_devices(payload: Any) -> str | None:
    serials = _all_serials(payload)
    return serials[0] if serials else None


def _all_serials(payload: Any) -> list[str]:
    """Collect device serials, preferring gateway / envoy / powerpack types."""
    preferred: list[str] = []
    others: list[str] = []

    def walk(obj: Any, depth: int = 0) -> None:
        if depth > 10:
            return
        if isinstance(obj, dict):
            dtype = str(
                obj.get("device_type")
                or obj.get("type")
                or obj.get("product")
                or obj.get("model")
                or ""
            ).lower()
            serial = _as_str(
                obj.get("serial_num")
                or obj.get("serial_number")
                or obj.get("serialNumber")
                or obj.get("serial")
                or obj.get("sn")
            )
            if serial and len(serial) >= 6:
                if any(
                    token in dtype
                    for token in (
                        "envoy",
                        "gateway",
                        "iq_gateway",
                        "iqgateway",
                        "emu",
                        "powerpack",
                        "power_pack",
                        "pes",
                        "portable",
                    )
                ):
                    if serial not in preferred:
                        preferred.append(serial)
                elif serial not in others and serial not in preferred:
                    others.append(serial)
            for value in obj.values():
                walk(value, depth + 1)
        elif isinstance(obj, list):
            for item in obj[:80]:
                walk(item, depth + 1)

    walk(payload)
    return preferred + others


def _decode_live_status_payload(payload: bytes) -> JsonDict | None:
    """Decode Live Status MQTT frame (PES JSON or gateway DataMsg protobuf)."""
    try:
        text = payload.decode("utf-8")
        if text.lstrip().startswith("{"):
            data = json.loads(text)
            if isinstance(data, dict):
                ojas = _parse_ojas_live(data)
                if ojas:
                    return ojas
                scraped = _scrape_numbers(data)
                if any(v is not None for v in scraped.values()):
                    return scraped
                parsed = _parse_pes_status(data)
                if any(v is not None for v in parsed.values()):
                    return parsed
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        pass

    return _decode_live_status_protobuf(payload)


def _decode_live_status_protobuf(payload: bytes) -> JsonDict | None:
    """Decode DataMsg meters (field 3) into site power + SOC.

    Mapping (Enlighten Live Status / community captures):
      meters.field1.field1 = solar kW*1e6
      meters.field2.field1 = battery kW*1e6
      meters.field3.field1 = grid kW*1e6
      meters.field4.field1 = home kW*1e6
      meters.field6 = battery SOC %
    """
    meters = _protobuf_field(payload, 3, 2)
    if not isinstance(meters, bytes):
        return None

    out: JsonDict = {}
    pv = _power_group_watts(meters, 1)
    batt = _power_group_watts(meters, 2)
    grid = _power_group_watts(meters, 3)
    load = _power_group_watts(meters, 4)
    soc_raw = _protobuf_field(meters, 6, 0)

    if pv is not None:
        out["pv_power"] = abs(pv)  # UI shows production as positive
    if batt is not None:
        out["battery_power"] = batt
    if grid is not None:
        out["grid_power"] = grid
    if load is not None:
        out["consumption_power"] = abs(load)
    if isinstance(soc_raw, int) and 0 <= soc_raw <= 100:
        out["battery_soc"] = float(soc_raw)

    return out or None


def _power_group_watts(meters: bytes, field_number: int) -> float | None:
    group = _protobuf_field(meters, field_number, 2)
    if not isinstance(group, bytes):
        return None
    raw = _protobuf_field(group, 1, 0)
    if not isinstance(raw, int):
        return None
    # kW * 1e6 → W
    return _signed64(raw) * 1000.0 / _LIVE_POWER_SCALE


def _signed64(value: int) -> int:
    if value >= 1 << 63:
        return value - (1 << 64)
    return value


def _protobuf_varint(data: bytes, offset: int) -> tuple[int, int] | None:
    value = 0
    for shift in range(0, 70, 7):
        if offset >= len(data):
            return None
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value, offset
    return None


def _protobuf_field(
    data: bytes,
    field_number: int,
    wire_type: int,
) -> int | bytes | None:
    offset = 0
    while offset < len(data):
        key_result = _protobuf_varint(data, offset)
        if key_result is None:
            return None
        key, offset = key_result
        current_field = key >> 3
        current_wire = key & 0x07
        if current_field == 0:
            return None

        if current_wire == 0:
            value_result = _protobuf_varint(data, offset)
            if value_result is None:
                return None
            field_value: int | bytes
            field_value, offset = value_result
        elif current_wire == 1:
            end = offset + 8
            if end > len(data):
                return None
            field_value = data[offset:end]
            offset = end
        elif current_wire == 2:
            length_result = _protobuf_varint(data, offset)
            if length_result is None:
                return None
            length, offset = length_result
            end = offset + length
            if end > len(data):
                return None
            field_value = data[offset:end]
            offset = end
        elif current_wire == 5:
            end = offset + 4
            if end > len(data):
                return None
            field_value = data[offset:end]
            offset = end
        else:
            return None

        if current_field == field_number and current_wire == wire_type:
            return field_value
    return None


def _mqtt_string(value: str) -> bytes:
    data = value.encode()
    return len(data).to_bytes(2, "big") + data


def _mqtt_remaining_length(length: int) -> bytes:
    encoded = bytearray()
    while True:
        digit = length % 128
        length //= 128
        if length > 0:
            digit |= 0x80
        encoded.append(digit)
        if length == 0:
            return bytes(encoded)


def _mqtt_packet(packet_type: int, payload: bytes) -> bytes:
    return bytes([packet_type]) + _mqtt_remaining_length(len(payload)) + payload


def _mqtt_connect_packet(client_id: str, username: str | None) -> bytes:
    if username:
        connect_flags = b"\x82"  # username + clean session
        variable_header = (
            _mqtt_string("MQTT")
            + b"\x04"  # MQTT 3.1.1
            + connect_flags
            + (30).to_bytes(2, "big")
        )
        payload = _mqtt_string(client_id) + _mqtt_string(username)
    else:
        connect_flags = b"\x02"  # clean session only (signed_url auth)
        variable_header = (
            _mqtt_string("MQTT")
            + b"\x04"
            + connect_flags
            + (30).to_bytes(2, "big")
        )
        payload = _mqtt_string(client_id)
    return _mqtt_packet(0x10, variable_header + payload)


def _mqtt_subscribe_packet(topic: str) -> bytes:
    payload = (1).to_bytes(2, "big") + _mqtt_string(topic) + b"\x00"
    return _mqtt_packet(0x82, payload)


def _mqtt_publish_packet(topic: str, payload: bytes) -> bytes:
    """QoS0 PUBLISH used to nudge some device streams."""
    body = _mqtt_string(topic) + payload
    return _mqtt_packet(0x30, body)


def _validate_mqtt_connack(payload: bytes) -> None:
    if len(payload) < 2:
        raise aiohttp.ClientConnectionError("MQTT CONNACK payload was incomplete")
    return_code = payload[1]
    if return_code:
        raise aiohttp.ClientConnectionError(
            f"MQTT CONNECT was rejected with return code {return_code}"
        )


def _validate_mqtt_suback(payload: bytes) -> None:
    if len(payload) < 3:
        raise aiohttp.ClientConnectionError("MQTT SUBACK payload was incomplete")
    granted_qos = payload[2:]
    if not granted_qos or any(qos == 0x80 for qos in granted_qos):
        raise aiohttp.ClientConnectionError("MQTT subscription was rejected")


def _mqtt_packets(data: bytes) -> Iterable[tuple[int, bytes]]:
    offset = 0
    data_len = len(data)
    while offset + 2 <= data_len:
        packet_type = data[offset]
        offset += 1
        multiplier = 1
        remaining = 0
        while offset < data_len:
            digit = data[offset]
            offset += 1
            remaining += (digit & 127) * multiplier
            if (digit & 128) == 0:
                break
            multiplier *= 128
        end = offset + remaining
        if end > data_len:
            return
        yield packet_type, data[offset:end]
        offset = end


async def _wait_for_mqtt_packet(
    ws: aiohttp.ClientWebSocketResponse,
    packet_prefixes: set[int],
    *,
    deadline: float,
) -> tuple[int, bytes]:
    while True:
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            raise asyncio.TimeoutError("Timed out waiting for MQTT packet")
        msg = await asyncio.wait_for(ws.receive(), timeout=remaining)
        if msg.type == aiohttp.WSMsgType.BINARY:
            for packet_type, payload in _mqtt_packets(msg.data):
                if packet_type & 0xF0 in packet_prefixes:
                    return packet_type, payload
        elif msg.type in (
            aiohttp.WSMsgType.CLOSED,
            aiohttp.WSMsgType.CLOSE,
            aiohttp.WSMsgType.ERROR,
        ):
            raise aiohttp.ClientConnectionError(
                f"MQTT WebSocket closed code={ws.close_code} extra={msg.data!r}"
            )


async def _wait_for_mqtt_publish_with_ping(
    ws: aiohttp.ClientWebSocketResponse,
    *,
    deadline: float,
) -> tuple[int, bytes]:
    """Wait for PUBLISH while sending MQTT PINGREQ so the broker keeps us alive."""
    while True:
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            raise asyncio.TimeoutError("Timed out waiting for MQTT PUBLISH")
        slice_s = min(8.0, remaining)
        try:
            msg = await asyncio.wait_for(ws.receive(), timeout=slice_s)
        except asyncio.TimeoutError:
            # MQTT PINGREQ
            await ws.send_bytes(b"\xc0\x00")
            continue
        if msg.type == aiohttp.WSMsgType.BINARY:
            for packet_type, payload in _mqtt_packets(msg.data):
                ptype = packet_type & 0xF0
                if ptype == 0x30:  # PUBLISH
                    return packet_type, payload
                if ptype == 0xD0:  # PINGRESP
                    continue
        elif msg.type in (
            aiohttp.WSMsgType.CLOSED,
            aiohttp.WSMsgType.CLOSE,
            aiohttp.WSMsgType.ERROR,
        ):
            raise aiohttp.ClientConnectionError(
                f"MQTT WebSocket closed while waiting publish "
                f"code={ws.close_code} extra={msg.data!r}"
            )


def _mqtt_publish_payload(packet_type: int, payload: bytes) -> bytes:
    if len(payload) < 2:
        return b""
    topic_len = int.from_bytes(payload[:2], "big")
    offset = 2 + topic_len
    qos = (packet_type & 0x06) >> 1
    if qos:
        offset += 2
    return payload[offset:]
