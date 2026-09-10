import { useEffect, useState } from 'react'
import { HaClient } from '../ha/client'
import {
  cameraSnapshotUrlFromState,
  cameraStreamUrlFromState,
} from '../ha/camera'
import { loadBaseUrl, loadToken } from '../ha/storage'

type CameraMode = 'stream' | 'snapshot'

/** Live MJPEG (or snapshot fallback) URL for one HA camera entity. */
export function useCameraFeed(
  entityId: string | null,
  enabled: boolean,
): {
  /** Latest successfully fetched URL (may briefly be for the previous entity while loading). */
  url: string | null
  /** True when `url` belongs to the current `entityId`. */
  isCurrent: boolean
  mode: CameraMode
  fallbackToSnapshot: () => void
} {
  const [url, setUrl] = useState<string | null>(null)
  const [urlForEntityId, setUrlForEntityId] = useState<string | null>(null)
  const [mode, setMode] = useState<CameraMode>('stream')

  useEffect(() => {
    setMode('stream')
  }, [entityId])

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
        if (!cancelled) {
          setUrl(next)
          setUrlForEntityId(requestedEntityId)
        }
      } catch {
        if (!cancelled) {
          // Keep the last good frame if a refresh fails mid-rotate.
        }
      }
    }

    void refresh()
    const intervalMs = mode === 'stream' ? 45_000 : 2_500
    const id = window.setInterval(() => {
      void refresh()
    }, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled, entityId, mode])

  return {
    url,
    isCurrent: urlForEntityId === entityId,
    mode,
    fallbackToSnapshot: () => setMode('snapshot'),
  }
}
