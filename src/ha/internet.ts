import type { HaState } from './positions'

/** WAN reachability binary sensor from packages/internet-monitor.yaml */
export const INTERNET_SENSOR_ENTITY = 'binary_sensor.internet'

export const INTERNET_OUTAGE_EMAIL_ENABLED_ENTITY =
  'input_boolean.internet_outage_email_enabled'

export const INTERNET_OUTAGE_MINUTES_ENTITY = 'input_number.internet_outage_minutes'

export const DEFAULT_INTERNET_OUTAGE_MINUTES = 2

/** Ignore single failed checks; the sensor polls every 30 s. */
const OFFLINE_GRACE_MS = 60_000

/** true = online, false = offline, null = unknown / missing sensor */
export function internetOnlineFromStates(states: HaState[], now = Date.now()): boolean | null {
  const state = states.find((entry) => entry.entity_id === INTERNET_SENSOR_ENTITY)
  if (!state) return null
  const raw = state.state.toLowerCase()
  if (raw === 'on') return true
  if (raw === 'off') {
    const since = state.last_changed ? Date.parse(state.last_changed) : NaN
    if (Number.isFinite(since) && now - since < OFFLINE_GRACE_MS) return true
    return false
  }
  return null
}
