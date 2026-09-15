"""Proxy DoorBird LAN audio (listen/talk) for the home dashboard.

Credentials come from the official DoorBird integration config entry so the
browser never sees the DoorBird password. Endpoints require HA auth.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta
from http import HTTPStatus
from typing import Any

import aiohttp
from aiohttp import ClientTimeout, WSMsgType, web
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import (
    async_aiohttp_proxy_web,
    async_get_clientsession,
)

_LOGGER = logging.getLogger(__name__)

DOMAIN = "doorbird_intercom"
DOORBIRD_DOMAIN = "doorbird"
# DoorBird docs recommend a large fixed Content-Length instead of chunked upload.
TRANSMIT_CONTENT_LENGTH = "9999999"
TALK_SESSION_TTL = timedelta(minutes=15)


def _doorbird_credentials(hass: HomeAssistant) -> dict[str, str] | None:
    """Return host/username/password from the first enabled DoorBird entry."""
    for entry in hass.config_entries.async_entries(DOORBIRD_DOMAIN):
        if entry.disabled_by is not None:
            continue
        host = entry.data.get("host")
        username = entry.data.get("username")
        password = entry.data.get("password")
        if host and username and password:
            return {
                "host": str(host),
                "username": str(username),
                "password": str(password),
            }
    return None


async def async_setup(hass: HomeAssistant, _config: dict[str, Any]) -> bool:
    """Register authenticated HTTP/WS views."""
    hass.http.register_view(DoorBirdStatusView)
    hass.http.register_view(DoorBirdListenView)
    hass.http.register_view(DoorBirdTalkView)
    hass.http.register_view(DoorBirdTalkSessionView)
    hass.http.register_view(DoorBirdTalkWsView)
    _LOGGER.info("DoorBird intercom proxy registered")
    return True


class DoorBirdStatusView(HomeAssistantView):
    """Report whether DoorBird credentials are available."""

    url = "/api/doorbird_intercom/status"
    name = "api:doorbird_intercom:status"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        creds = _doorbird_credentials(hass)
        if not creds:
            return self.json({"ok": False, "reason": "no_doorbird"}, HTTPStatus.NOT_FOUND)
        return self.json({"ok": True, "host": creds["host"]})


class DoorBirdListenView(HomeAssistantView):
    """Stream G.711 µ-law audio from DoorBird audio-receive.cgi."""

    url = "/api/doorbird_intercom/listen"
    name = "api:doorbird_intercom:listen"
    requires_auth = True

    async def get(self, request: web.Request) -> web.StreamResponse:
        hass: HomeAssistant = request.app["hass"]
        creds = _doorbird_credentials(hass)
        if not creds:
            return web.Response(status=HTTPStatus.NOT_FOUND, text="No DoorBird configured")

        session = async_get_clientsession(hass)
        url = f"http://{creds['host']}/bha-api/audio-receive.cgi"
        auth = aiohttp.BasicAuth(creds["username"], creds["password"])
        timeout = ClientTimeout(total=None, sock_connect=15, sock_read=60)

        try:
            proxied = await async_aiohttp_proxy_web(
                hass,
                request,
                session.get(url, auth=auth, timeout=timeout),
                buffer_size=1024,
                timeout=60,
            )
            if proxied is None:
                return web.Response(status=HTTPStatus.BAD_GATEWAY, text="Listen cancelled")
            if not proxied.content_type:
                proxied.content_type = "audio/basic"
            return proxied
        except Exception as err:  # noqa: BLE001 — surface to client
            _LOGGER.warning("DoorBird listen proxy failed: %s", err)
            return web.Response(status=HTTPStatus.BAD_GATEWAY, text=str(err))


class DoorBirdTalkView(HomeAssistantView):
    """HTTP POST body → DoorBird audio-transmit.cgi (G.711 µ-law)."""

    url = "/api/doorbird_intercom/talk"
    name = "api:doorbird_intercom:talk"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        creds = _doorbird_credentials(hass)
        if not creds:
            return web.Response(status=HTTPStatus.NOT_FOUND, text="No DoorBird configured")

        session = async_get_clientsession(hass)
        url = f"http://{creds['host']}/bha-api/audio-transmit.cgi"
        auth = aiohttp.BasicAuth(creds["username"], creds["password"])
        timeout = ClientTimeout(total=None, sock_connect=15, sock_read=None)
        headers = {
            "Content-Type": "audio/basic",
            "Content-Length": TRANSMIT_CONTENT_LENGTH,
            "Connection": "Keep-Alive",
            "Cache-Control": "no-cache",
        }

        try:
            async with session.post(
                url,
                auth=auth,
                data=request.content,
                headers=headers,
                timeout=timeout,
            ) as resp:
                body = await resp.read()
                return web.Response(
                    status=resp.status,
                    body=body,
                    content_type=resp.content_type or "text/plain",
                )
        except (asyncio.CancelledError, aiohttp.ClientConnectionError) as err:
            _LOGGER.debug("DoorBird talk ended: %s", err)
            return web.Response(status=HTTPStatus.OK, text="ended")
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("DoorBird talk proxy failed: %s", err)
            return web.Response(status=HTTPStatus.BAD_GATEWAY, text=str(err))


class DoorBirdTalkSessionView(HomeAssistantView):
    """Issue a short-lived signed WebSocket path for talk.

    Browser WebSockets cannot send Authorization headers, and this HA rejects
    long-lived tokens in `?access_token=`. Signed paths fix that.
    """

    url = "/api/doorbird_intercom/talk_session"
    name = "api:doorbird_intercom:talk_session"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        if not _doorbird_credentials(hass):
            return self.json({"ok": False, "reason": "no_doorbird"}, HTTPStatus.NOT_FOUND)
        path = async_sign_path(hass, "/api/doorbird_intercom/talk_ws", TALK_SESSION_TTL)
        return self.json({"ok": True, "path": path})


class DoorBirdTalkWsView(HomeAssistantView):
    """WebSocket binary µ-law frames → DoorBird audio-transmit.cgi.

    Authenticate via a signed path from talk_session (or Bearer on non-WS clients).
    """

    url = "/api/doorbird_intercom/talk_ws"
    name = "api:doorbird_intercom:talk_ws"
    requires_auth = True

    async def get(self, request: web.Request) -> web.WebSocketResponse:
        hass: HomeAssistant = request.app["hass"]
        creds = _doorbird_credentials(hass)
        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)

        if not creds:
            await ws.close(code=aiohttp.WSCloseCode.UNSUPPORTED_DATA, message=b"no_doorbird")
            return ws

        session = async_get_clientsession(hass)
        url = f"http://{creds['host']}/bha-api/audio-transmit.cgi"
        auth = aiohttp.BasicAuth(creds["username"], creds["password"])
        timeout = ClientTimeout(total=None, sock_connect=15, sock_read=None)
        queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=64)

        async def read_ws() -> None:
            try:
                async for msg in ws:
                    if msg.type == WSMsgType.BINARY:
                        try:
                            queue.put_nowait(msg.data)
                        except asyncio.QueueFull:
                            _LOGGER.debug("DoorBird talk queue full; dropping chunk")
                    elif msg.type in (WSMsgType.CLOSE, WSMsgType.CLOSING, WSMsgType.ERROR):
                        break
            finally:
                await queue.put(None)

        async def body_gen():
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk

        reader = asyncio.create_task(read_ws())
        try:
            async with session.post(
                url,
                auth=auth,
                data=body_gen(),
                headers={
                    "Content-Type": "audio/basic",
                    "Content-Length": TRANSMIT_CONTENT_LENGTH,
                    "Connection": "Keep-Alive",
                    "Cache-Control": "no-cache",
                },
                timeout=timeout,
            ) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    _LOGGER.warning("DoorBird talk HTTP %s: %s", resp.status, text[:200])
                await reader
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("DoorBird talk WS proxy failed: %s", err)
            if not reader.done():
                reader.cancel()
        finally:
            if not ws.closed:
                await ws.close()

        return ws
