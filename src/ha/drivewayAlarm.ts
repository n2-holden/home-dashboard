import type { HaState } from './positions'

/**
 * Shelly Pro 1 UL “Outside Gate I/O” — Input 0 is the driveway alarm contact.
 * Input 1 is the gate closed sensor (`GATE_CLOSED_SENSOR`).
 */
export const DRIVEWAY_ALARM_SENSOR = 'binary_sensor.outside_gate_i_o_input_0'

/** Written by HA automation when the driveway alarm input turns on. */
export const DRIVEWAY_ALARM_LAST_TRIGGER = 'input_datetime.dashboard_driveway_alarm_last'

/** How long the dashboard shows the red driveway-alarm icon after a trigger. */
export const DRIVEWAY_ALARM_ACTIVE_MS = 30 * 60_000

function parseTimestamp(raw: string | undefined | null): number | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (!trimmed || trimmed === 'unknown' || trimmed === 'unavailable' || trimmed === 'none') {
    return null
  }
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : null
}

function sensorLastOnMs(
  states: HaState[],
  sensorEntityId = DRIVEWAY_ALARM_SENSOR,
): number | null {
  const state = states.find((entry) => entry.entity_id === sensorEntityId)
  if (!state) return null
  const raw = String(state.state ?? '').toLowerCase()
  if (raw === 'unavailable' || raw === 'unknown' || raw === '') return null
  if (raw !== 'on') return null
  return parseTimestamp(state.last_changed) ?? parseTimestamp(state.last_updated)
}

/** Latest driveway-alarm trigger time from helper and/or live sensor-on. */
export function drivewayAlarmLastTriggerMs(
  states: HaState[],
  sensorEntityId = DRIVEWAY_ALARM_SENSOR,
  datetimeEntityId = DRIVEWAY_ALARM_LAST_TRIGGER,
): number | null {
  const fromSensor = sensorLastOnMs(states, sensorEntityId)
  const datetimeState = states.find((entry) => entry.entity_id === datetimeEntityId)
  const fromDatetime = parseTimestamp(datetimeState?.state)

  if (fromSensor == null) return fromDatetime
  if (fromDatetime == null) return fromSensor
  return Math.max(fromSensor, fromDatetime)
}

/** Milliseconds until the alarm indicator should clear, or null if inactive. */
export function drivewayAlarmActiveUntilMs(
  states: HaState[],
  activeMs: number = DRIVEWAY_ALARM_ACTIVE_MS,
  sensorEntityId = DRIVEWAY_ALARM_SENSOR,
  datetimeEntityId = DRIVEWAY_ALARM_LAST_TRIGGER,
): number | null {
  const triggeredAt = drivewayAlarmLastTriggerMs(states, sensorEntityId, datetimeEntityId)
  if (triggeredAt == null) return null
  const duration =
    Number.isFinite(activeMs) && activeMs > 0 ? activeMs : DRIVEWAY_ALARM_ACTIVE_MS
  return triggeredAt + duration
}

export function drivewayAlarmIsActive(
  states: HaState[],
  now = Date.now(),
  activeMs: number = DRIVEWAY_ALARM_ACTIVE_MS,
  sensorEntityId = DRIVEWAY_ALARM_SENSOR,
  datetimeEntityId = DRIVEWAY_ALARM_LAST_TRIGGER,
): boolean {
  const until = drivewayAlarmActiveUntilMs(states, activeMs, sensorEntityId, datetimeEntityId)
  return until != null && now < until
}
