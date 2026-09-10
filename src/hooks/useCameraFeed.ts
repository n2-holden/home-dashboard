import { useEffect, useState } from 'react'
import { HaClient } from '../ha/client'
import {
  cameraSnapshotUrlFromState,
  cameraStreamUrlFromState,
} from '../ha/camera'
import { loadBaseUrl, loadToken } from '../ha/storage'

type CameraMode = 'stream' | 'snapshot'

type UseCameraFeedOptions = {
  /** Default `stream`. Use `snapshot` for thumbnails / weather rotate. */
  mode?: CameraMode
  /**
   * Snapshot refresh interval (ms).
   * Use `0` to fetch once when the entity changes (no periodic refresh).
   */
  snapshotRefreshMs?: number
}

/** Live MJPEG or still snapshot URL for one HA camera entity. */
export function useCameraFeed(
  entityId: string | null,
  enabled: boolean,
  options: UseCameraFeedOptions = {},
): {
  url: string | null
  isCurrent: boolean
  mode: CameraMode
} {
  const preferredMode = options.mode ?? 'stream'
  const snapshotRefreshMs = options.snapshotRefreshMs ?? 2_000
  const [url, setUrl] = useState<string | null>(null)
  const [urlForEntityId, setUrlForEntityId] = useState<string | null>(null)
  const [mode, setMode] = useState<CameraMode>(preferredMode)

  useEffect(() => {
    setMode(preferredMode)
  }, [entityId, preferredMode])

  useEffect(() => {
    if (!enabled || !entityId) {
      setUrl(null)
      setUrlForEntityId(null)
      return
    }

    let cancelled = false
    const requestedEntityId = entityId

    async function refresh() {
      const token = loadToken()
      if (!token) {
        if (!cancelled) {
          setUrl(null)
          setUrlForEntityId(null)
        }
        return
      }
      try {
        const client = new HaClient(token, loadBaseUrl())
        const state = await client.getEntityState(requestedEntityId)
        const base = loadBaseUrl()
        const next =
          mode === 'stream'
            ? cameraStreamUrlFromState(state, base)
            : cameraSnapshotUrlFromState(state, base)
        if (!cancelled && next) {
          setUrl(next)
          setUrlForEntityId(requestedEntityId)
        }
      } catch {
        // Keep the last good frame if a refresh fails.
      }
    }

    void refresh()

    if (mode === 'stream') {
      const id = window.setInterval(() => {
        void refresh()
      }, 45_000)
      return () => {
        cancelled = true
        window.clearInterval(id)
      }
    }

    if (snapshotRefreshMs > 0) {
      const id = window.setInterval(() => {
        void refresh()
      }, snapshotRefreshMs)
      return () => {
        cancelled = true
        window.clearInterval(id)
      }
    }

    return () => {
      cancelled = true
    }
  }, [enabled, entityId, mode, snapshotRefreshMs])

  return {
    url,
    isCurrent: urlForEntityId === entityId,
    mode,
  }
}
