import type { HaState } from './positions'

/** DoorBird doorstation call-button event (state = ISO timestamp of last ring). */
export const DOORBELL_EVENT = 'event.doorstation_1ccae375bf98_doorbell'

/** Written by HA automation when the doorbell event fires (fallback signal). */
export const DOORBELL_LAST_RING_DATETIME = 'input_datetime.dashboard_doorbell_last_ring'

export const DOORBELL_EMAIL_ENABLED_ENTITY = 'input_boolean.doorbell_email_enabled'

export const DOORBELL_ICON_MINUTES_ENTITY = 'input_number.doorbell_icon_minutes'

export const DEFAULT_DOORBELL_ICON_MINUTES = 5

/** How long the dashboard shows the doorbell indicator after a press (fallback). */
export const DOORBELL_ACTIVE_MS = DEFAULT_DOORBELL_ICON_MINUTES * 60_000

function parseTimestamp(raw: string | undefined | null): number | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (!trimmed || trimmed === 'unknown' || trimmed === 'unavailable' || trimmed === 'none') {
    return null
  }
  // input_datetime may be "YYYY-MM-DD HH:MM:SS"
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : null
}

/** Latest doorbell press time from event entity and/or input_datetime helper. */
export function doorbellLastRingMs(
  states: HaState[],
  eventEntityId = DOORBELL_EVENT,
  datetimeEntityId = DOORBELL_LAST_RING_DATETIME,
): number | null {
  const eventState = states.find((entry) => entry.entity_id === eventEntityId)
  const fromEvent = parseTimestamp(eventState?.state)

  const datetimeState = states.find((entry) => entry.entity_id === datetimeEntityId)
  const fromDatetime = parseTimestamp(datetimeState?.state)

  if (fromEvent == null) return fromDatetime
  if (fromDatetime == null) return fromEvent
  return Math.max(fromEvent, fromDatetime)
}

/** Milliseconds until the ring indicator should clear, or null if inactive. */
export function doorbellActiveUntilMs(
  states: HaState[],
  activeMs: number = DOORBELL_ACTIVE_MS,
  eventEntityId = DOORBELL_EVENT,
  datetimeEntityId = DOORBELL_LAST_RING_DATETIME,
): number | null {
  const ringAt = doorbellLastRingMs(states, eventEntityId, datetimeEntityId)
  if (ringAt == null) return null
  const duration = Number.isFinite(activeMs) && activeMs > 0 ? activeMs : DOORBELL_ACTIVE_MS
  return ringAt + duration
}

export function doorbellIsRinging(
  states: HaState[],
  now = Date.now(),
  activeMs: number = DOORBELL_ACTIVE_MS,
  eventEntityId = DOORBELL_EVENT,
  datetimeEntityId = DOORBELL_LAST_RING_DATETIME,
): boolean {
  const until = doorbellActiveUntilMs(states, activeMs, eventEntityId, datetimeEntityId)
  return until != null && now < until
}
