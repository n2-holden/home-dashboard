import type { HaState } from './positions'

export type DashboardCamera = {
  id: string
  label: string
  /** Fluent (lower-bandwidth) main lens entity. */
  entityId: string
}

/** Reolink cameras shown on the dashboard (weather rotate + Cameras page). */
export const DASHBOARD_CAMERAS: DashboardCamera[] = [
  { id: 'shed', label: 'Shed', entityId: 'camera.shed_fluent_lens_0' },
  { id: 'courtyard', label: 'Courtyard', entityId: 'camera.courtyard_fluent_lens_0' },
  { id: 'pond', label: 'Pond', entityId: 'camera.pond_fluent_lens_0' },
]

/** @deprecated use DASHBOARD_CAMERAS */
export const SHED_CAMERA_ENTITY_ID = DASHBOARD_CAMERAS[0].entityId

function accessToken(state: HaState): string | null {
  const raw = state.attributes.access_token
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function withBase(path: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}${path}`
}

/** MJPEG live stream URL (works in `<img src>`). */
export function cameraStreamUrlFromState(state: HaState, baseUrl = ''): string | null {
  if (state.state === 'unavailable' || state.state === 'unknown') return null
  const token = accessToken(state)
  if (!token) return null
  const path = `/api/camera_proxy_stream/${encodeURIComponent(state.entity_id)}?token=${encodeURIComponent(token)}`
  return withBase(path, baseUrl)
}

/** Still-frame snapshot URL (fallback if stream fails). */
export function cameraSnapshotUrlFromState(
  state: HaState,
  baseUrl = '',
  bust = Date.now(),
): string | null {
  if (state.state === 'unavailable' || state.state === 'unknown') return null
  const picture = state.attributes.entity_picture
  if (typeof picture === 'string' && picture.startsWith('/')) {
    const sep = picture.includes('?') ? '&' : '?'
    return withBase(`${picture}${sep}_=${bust}`, baseUrl)
  }
  const token = accessToken(state)
  if (!token) return null
  const path = `/api/camera_proxy/${encodeURIComponent(state.entity_id)}?token=${encodeURIComponent(token)}&_=${bust}`
  return withBase(path, baseUrl)
}
