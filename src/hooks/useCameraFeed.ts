import { useEffect, useState } from 'react'
import { HaClient } from '../ha/client'
import {
  cameraSnapshotUrlFromState,
  cameraStreamUrlFromState,
} from '../ha/camera'
import { loadBaseUrl, loadToken } from '../ha/storage'
import { fetchCameraHlsPath } from '../ha/ws'

type CameraMode = 'stream' | 'snapshot' | 'hls'

/** How often to re-call HA `camera/stream` so the HLS provider stays alive. */
export const HLS_KEEPALIVE_MS = 30_000

type UseCameraFeedOptions = {
  /** Default `stream`. Use `hls` for DoorBird live, `snapshot` for thumbs. */
  mode?: CameraMode
  /**
   * Snapshot refresh interval (ms).
   * Use `0` to fetch once when the entity changes (no periodic refresh).
   */
  snapshotRefreshMs?: number
  /** How often to ping `camera/stream` for HLS keep-alive. Default 30s. */
  hlsKeepAliveMs?: number
  /**
   * Bump to force a fresh HLS session (e.g. after playlist 404).
   * Keep-alive alone may reuse the same path; a bump always re-requests.
   */
  hlsRestartToken?: number
}

function withBase(path: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const origin =
    baseUrl.trim() ||
    (typeof location !== 'undefined' ? location.origin : '')
  if (!origin) return path.startsWith('/') ? path : `/${path}`
  try {
    return new URL(path.startsWith('/') ? path : `/${path}`, origin).href
  } catch {
    const base = origin.replace(/\/$/, '')
    return `${base}${path.startsWith('/') ? path : `/${path}`}`
  }
}

/** Live HLS, MJPEG, or still snapshot URL for one HA camera entity. */
export function useCameraFeed(
  entityId: string | null,
  enabled: boolean,
  options: UseCameraFeedOptions = {},
): {
  url: string | null
  isCurrent: boolean
  mode: CameraMode
  error: string | null
} {
  const preferredMode = options.mode ?? 'stream'
  const snapshotRefreshMs = options.snapshotRefreshMs ?? 2_000
  const hlsKeepAliveMs = options.hlsKeepAliveMs ?? HLS_KEEPALIVE_MS
  const hlsRestartToken = options.hlsRestartToken ?? 0
  const [url, setUrl] = useState<string | null>(null)
  const [urlForEntityId, setUrlForEntityId] = useState<string | null>(null)
  const [mode, setMode] = useState<CameraMode>(preferredMode)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMode(preferredMode)
    setError(null)
  }, [entityId, preferredMode])

  useEffect(() => {
    if (!enabled || !entityId) {
      setUrl(null)
      setUrlForEntityId(null)
      setError(null)
      return
    }

    let cancelled = false
    const requestedEntityId = entityId

    async function refreshSnapshotOrStream(active: CameraMode) {
      const token = loadToken()
      if (!token) {
        if (!cancelled) {
          setUrl(null)
          setUrlForEntityId(null)
          setError('Not signed in to Home Assistant')
        }
        return
      }
      try {
        const client = new HaClient(token, loadBaseUrl())
        const state = await client.getEntityState(requestedEntityId)
        const base = loadBaseUrl()
        const next =
          active === 'stream'
            ? cameraStreamUrlFromState(state, base)
            : cameraSnapshotUrlFromState(state, base)
        if (!cancelled && next) {
          setUrl(next)
          setUrlForEntityId(requestedEntityId)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Camera refresh failed')
        }
      }
    }

    async function refreshHls(forceUrlUpdate: boolean) {
      const token = loadToken()
      if (!token) {
        if (!cancelled) {
          setUrl(null)
          setUrlForEntityId(null)
          setError('Not signed in to Home Assistant')
        }
        return
      }
      try {
        const path = await fetchCameraHlsPath(token, loadBaseUrl(), requestedEntityId)
        if (cancelled) return
        const next = withBase(path, loadBaseUrl())
        // Keep-alive often returns the same path; avoid remounting the player unless forced.
        setUrl((prev) => (forceUrlUpdate || prev !== next ? next : prev))
        setUrlForEntityId(requestedEntityId)
        setMode('hls')
        setError(null)
      } catch (err) {
        // Don't permanently drop to snapshot on a single keep-alive failure —
        // leave the current player URL alone so playback can continue.
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Live stream refresh failed (${err.message})`
              : 'Live stream refresh failed',
          )
        }
      }
    }

    if (mode === 'hls') {
      void refreshHls(true)
      const id = window.setInterval(() => {
        void refreshHls(false)
      }, Math.max(10_000, hlsKeepAliveMs))
      return () => {
        cancelled = true
        window.clearInterval(id)
      }
    }

    void refreshSnapshotOrStream(mode)

    if (mode === 'stream') {
      const id = window.setInterval(() => {
        void refreshSnapshotOrStream('stream')
      }, 45_000)
      return () => {
        cancelled = true
        window.clearInterval(id)
      }
    }

    if (snapshotRefreshMs > 0) {
      const id = window.setInterval(() => {
        void refreshSnapshotOrStream('snapshot')
      }, snapshotRefreshMs)
      return () => {
        cancelled = true
        window.clearInterval(id)
      }
    }

    return () => {
      cancelled = true
    }
  }, [enabled, entityId, mode, snapshotRefreshMs, hlsKeepAliveMs, hlsRestartToken])

  return {
    url,
    isCurrent: urlForEntityId === entityId,
    mode,
    error,
  }
}
