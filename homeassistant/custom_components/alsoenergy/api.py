"""AlsoEnergy PowerTrack API client."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import aiohttp

from .const import BASE_URL

_LOGGER = logging.getLogger(__name__)

JsonDict = dict[str, Any]


class AlsoEnergyAuthError(Exception):
    """Raised when PowerTrack authentication fails."""


class AlsoEnergyApiError(Exception):
    """Raised when a PowerTrack API call fails."""


class AlsoEnergyClient:
    """Minimal client for PowerTrack production snapshots."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        username: str,
        password: str,
        site_id: int | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
    ) -> None:
        self._session = session
        self._username = username.strip()
        self._password = password
        self.site_id = site_id
        self._client_id = (client_id or "").strip() or None
        self._client_secret = (client_secret or "").strip() or None
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._token_expires_at: float | None = None

    async def async_login(self) -> int:
        """Authenticate and return the selected site id."""
        await self._request_token(grant_type="password")
        if self.site_id is None:
            self.site_id = await self._discover_site_id()
        if self.site_id is None:
            raise AlsoEnergyAuthError(
                "Login succeeded but no site was found. "
                "Enter your PowerTrack site ID from GET /Sites or the site URL."
            )
        _LOGGER.info("AlsoEnergy login ok for site %s", self.site_id)
        return self.site_id

    async def async_fetch_snapshot(self) -> JsonDict:
        """Fetch current power and month/lifetime energy for the configured site."""
        await self._ensure_token()
        assert self.site_id is not None

        site = await self._json(
            "GET",
            f"{BASE_URL}/Sites/{self.site_id}",
            params={"includeProductionData": "true"},
        )
        production = site.get("productionData") or {}
        now_kw = _to_float(production.get("nowKw"))
        month_kwh = _to_float(production.get("monthKwh"))
        lifetime_kwh = _to_float(production.get("lifetimeKwh"))

        return {
            "site_id": self.site_id,
            "site_name": site.get("siteName") or site.get("name"),
            "power_w": round(now_kw * 1000.0, 0) if now_kw is not None else None,
            "energy_month_kwh": month_kwh,
            "energy_today_kwh": _to_float(production.get("todayKwh")),
            "energy_lifetime_kwh": lifetime_kwh,
            "last_update": production.get("lastUpdate"),
            "time_zone": production.get("timeZone") or site.get("timeZone"),
            "today_kwh": _to_float(production.get("todayKwh")),
            "year_kwh": _to_float(production.get("yearKwh")),
        }

    async def async_list_sites(self) -> list[JsonDict]:
        """Return sites visible to the authenticated user."""
        await self._ensure_token()
        payload = await self._json("GET", f"{BASE_URL}/Sites")
        items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            return []
        return [item for item in items if isinstance(item, dict)]

    async def _discover_site_id(self) -> int | None:
        sites = await self.async_list_sites()
        if not sites:
            return None
        site_id = sites[0].get("siteId")
        return int(site_id) if site_id is not None else None

    async def _ensure_token(self) -> None:
        if self._access_token and self._token_expires_at:
            if time.time() < self._token_expires_at - 60:
                return
        if self._refresh_token:
            try:
                await self._request_token(grant_type="refresh_token")
                return
            except AlsoEnergyAuthError:
                _LOGGER.debug("Refresh token failed; re-authenticating")
        await self._request_token(grant_type="password")

    async def _request_token(self, *, grant_type: str) -> None:
        data: dict[str, str] = {"grant_type": grant_type}
        if grant_type == "password":
            data["username"] = self._username
            data["password"] = self._password
        elif grant_type == "refresh_token":
            if not self._refresh_token:
                raise AlsoEnergyAuthError("No refresh token available")
            data["refresh_token"] = self._refresh_token
        else:
            raise AlsoEnergyAuthError(f"Unsupported grant type: {grant_type}")

        if self._client_id:
            data["client_id"] = self._client_id
        if self._client_secret:
            data["client_secret"] = self._client_secret

        async with self._session.post(
            f"{BASE_URL}/Auth/token",
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            text = await resp.text()
            if resp.status in (401, 403):
                detail = _parse_error(text)
                raise AlsoEnergyAuthError(detail or "Invalid username or password")
            if resp.status >= 400:
                detail = _parse_error(text)
                raise AlsoEnergyAuthError(
                    detail or f"Token request failed with HTTP {resp.status}"
                )
            try:
                payload = json.loads(text)
            except json.JSONDecodeError as err:
                raise AlsoEnergyAuthError("Token response was not JSON") from err

        access_token = payload.get("access_token")
        if not access_token:
            raise AlsoEnergyAuthError("Token response did not include access_token")

        self._access_token = str(access_token)
        refresh = payload.get("refresh_token")
        self._refresh_token = str(refresh) if refresh else self._refresh_token
        expires_in = _to_float(payload.get("expires_in"))
        self._token_expires_at = (
            time.time() + expires_in if expires_in is not None else time.time() + 3600
        )

    async def _json(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, str] | None = None,
        retry_auth: bool = True,
    ) -> JsonDict:
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self._access_token}",
        }
        async with self._session.request(
            method,
            url,
            headers=headers,
            params=params,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            text = await resp.text()
            if resp.status in (401, 403) and retry_auth:
                await self._request_token(grant_type="password")
                return await self._json(method, url, params=params, retry_auth=False)
            if resp.status >= 400:
                detail = _parse_error(text)
                raise AlsoEnergyApiError(
                    detail or f"{method} {url} -> HTTP {resp.status}"
                )
            if not text.strip():
                return {}
            try:
                data = json.loads(text)
            except json.JSONDecodeError as err:
                raise AlsoEnergyApiError(
                    f"{method} {url} -> non-JSON body: {text[:120]!r}"
                ) from err
            if isinstance(data, dict):
                return data
            if isinstance(data, list):
                return {"items": data}
            return {}


def _to_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip().replace(",", "")
        try:
            return float(text)
        except ValueError:
            return None
    return None


def _parse_error(text: str) -> str | None:
    if not text:
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        trimmed = text.strip()
        return trimmed[:240] if trimmed else None
    if isinstance(payload, dict):
        for key in ("error", "message", "title"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None
