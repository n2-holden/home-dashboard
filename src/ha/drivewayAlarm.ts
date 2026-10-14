import type { HaState } from './positions'

/**
 * Shelly Pro 1 UL “Outside Gate I/O” — Input 0 is the driveway alarm contact.
 * Input 1 is the gate closed sensor (`GATE_CLOSED_SENSOR`).
 */
export const DRIVEWAY_ALARM_SENSOR = 'binary_sensor.outside_gate_i_o_input_0'

/** Written by HA automation when the driveway alarm input matches the trigger setting. */
export const DRIVEWAY_ALARM_LAST_TRIGGER = 'input_datetime.dashboard_driveway_alarm_last'

/** Which binary_sensor state counts as a driveway-alarm trigger. */
export const DRIVEWAY_ALARM_TRIGGER_ENTITY = 'input_select.dashboard_driveway_alarm_trigger'

/** How long the red driveway-alarm icon stays after a trigger (seconds). */
export const DRIVEWAY_ALARM_RESET_SECONDS_ENTITY =
  'input_number.dashboard_driveway_alarm_reset_seconds'

/** When on, driveway-alarm triggers also send email/phone (channel masters still apply). */
export const DRIVEWAY_ALARM_EMAIL_ENABLED_ENTITY =
  'input_boolean.driveway_alarm_email_enabled'

/** Master enable for the driveway alarm automation (sensor + icon click). */
export const DRIVEWAY_ALARM_ENABLED_ENTITY = 'input_boolean.driveway_alarm_enabled'

export type DrivewayAlarmTriggerState = 'on' | 'off'

/** Default: trigger when Input 0 turns on (matches original automation). */
export const DEFAULT_DRIVEWAY_ALARM_TRIGGER: DrivewayAlarmTriggerState = 'on'

/** Default icon duration: 30 minutes (same as the original hard-coded value). */
export const DEFAULT_DRIVEWAY_ALARM_RESET_SECONDS = 30 * 60

/** @deprecated Prefer `DEFAULT_DRIVEWAY_ALARM_RESET_SECONDS * 1000`. */
export const DRIVEWAY_ALARM_ACTIVE_MS = DEFAULT_DRIVEWAY_ALARM_RESET_SECONDS * 1000

export const DRIVEWAY_ALARM_TRIGGER_OPTIONS: Array<{
  value: DrivewayAlarmTriggerState
  label: string
}> = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

export function normalizeDrivewayAlarmTrigger(value: unknown): DrivewayAlarmTriggerState {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  return raw === 'off' ? 'off' : 'on'
}

export function clampDrivewayAlarmResetSeconds(value: unknown, fallback = DEFAULT_DRIVEWAY_ALARM_RESET_SECONDS): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(86_400, Math.round(n)))
}

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

function sensorLastTriggerMs(
  states: HaState[],
  triggerState: DrivewayAlarmTriggerState,
  sensorEntityId = DRIVEWAY_ALARM_SENSOR,
): number | null {
  const state = states.find((entry) => entry.entity_id === sensorEntityId)
  if (!state) return null
  const raw = String(state.state ?? '').toLowerCase()
  if (raw === 'unavailable' || raw === 'unknown' || raw === '') return null
  if (raw !== triggerState) return null
  return parseTimestamp(state.last_changed) ?? parseTimestamp(state.last_updated)
}

export function drivewayAlarmTriggerFromStates(
  states: HaState[],
  fallback: DrivewayAlarmTriggerState = DEFAULT_DRIVEWAY_ALARM_TRIGGER,
): DrivewayAlarmTriggerState {
  const state = states.find((entry) => entry.entity_id === DRIVEWAY_ALARM_TRIGGER_ENTITY)
  if (!state || state.state === 'unknown' || state.state === 'unavailable') return fallback
  return normalizeDrivewayAlarmTrigger(state.state)
}

export function drivewayAlarmResetSecondsFromStates(
  states: HaState[],
  fallback = DEFAULT_DRIVEWAY_ALARM_RESET_SECONDS,
): number {
  const state = states.find((entry) => entry.entity_id === DRIVEWAY_ALARM_RESET_SECONDS_ENTITY)
  if (!state || state.state === 'unknown' || state.state === 'unavailable') return fallback
  return clampDrivewayAlarmResetSeconds(state.state, fallback)
}

/** Latest driveway-alarm trigger time from helper and/or live matching sensor state. */
export function drivewayAlarmLastTriggerMs(
  states: HaState[],
  triggerState: DrivewayAlarmTriggerState = DEFAULT_DRIVEWAY_ALARM_TRIGGER,
  sensorEntityId = DRIVEWAY_ALARM_SENSOR,
  datetimeEntityId = DRIVEWAY_ALARM_LAST_TRIGGER,
): number | null {
  const fromSensor = sensorLastTriggerMs(states, triggerState, sensorEntityId)
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
  triggerState: DrivewayAlarmTriggerState = DEFAULT_DRIVEWAY_ALARM_TRIGGER,
  sensorEntityId = DRIVEWAY_ALARM_SENSOR,
  datetimeEntityId = DRIVEWAY_ALARM_LAST_TRIGGER,
): number | null {
  const triggeredAt = drivewayAlarmLastTriggerMs(
    states,
    triggerState,
    sensorEntityId,
    datetimeEntityId,
  )
  if (triggeredAt == null) return null
  const duration =
    Number.isFinite(activeMs) && activeMs > 0 ? activeMs : DRIVEWAY_ALARM_ACTIVE_MS
  return triggeredAt + duration
}

export function drivewayAlarmIsActive(
  states: HaState[],
  now = Date.now(),
  activeMs: number = DRIVEWAY_ALARM_ACTIVE_MS,
  triggerState: DrivewayAlarmTriggerState = DEFAULT_DRIVEWAY_ALARM_TRIGGER,
  sensorEntityId = DRIVEWAY_ALARM_SENSOR,
  datetimeEntityId = DRIVEWAY_ALARM_LAST_TRIGGER,
): boolean {
  const until = drivewayAlarmActiveUntilMs(
    states,
    activeMs,
    triggerState,
    sensorEntityId,
    datetimeEntityId,
  )
  return until != null && now < until
}
