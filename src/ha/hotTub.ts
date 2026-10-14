import type { HaState } from './positions'

/** DS18B20 probe on the Shelly EM Gen3 (temperature:100). */
export const HOT_TUB_TEMPERATURE_ENTITY = 'sensor.shellyemg3_dcb4d9d15c90_temperature_2'
/** eGauge "Hot tub" register. */
export const HOT_TUB_POWER_ENTITY = 'sensor.egauge97490_hot_tub_power'

/** The Shelly's Wi-Fi drops for a few minutes at a time; keep showing the last reading this long. */
export const HOT_TUB_HOLD_MS = 30 * 60 * 1000

export type HotTubSnapshot = {
  temperatureF: number | null
  /** False when the sensor is missing, unavailable, or unknown. */
  available: boolean
  /** When temperatureF was last reported live. */
  readingAtMs: number | null
}

export const EMPTY_HOT_TUB: HotTubSnapshot = {
  temperatureF: null,
  available: false,
  readingAtMs: null,
}

export function hotTubFromStates(states: HaState[]): HotTubSnapshot {
  const state = states.find((entry) => entry.entity_id === HOT_TUB_TEMPERATURE_ENTITY)
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return EMPTY_HOT_TUB
  const raw = Number(state.state)
  if (!Number.isFinite(raw)) return EMPTY_HOT_TUB
  const unit = String(state.attributes?.unit_of_measurement ?? '°F').toUpperCase()
  const temperatureF = unit.includes('C') ? raw * 1.8 + 32 : raw
  const updated = Date.parse(state.last_updated ?? state.last_changed ?? '')
  return {
    temperatureF,
    available: true,
    readingAtMs: Number.isFinite(updated) ? updated : Date.now(),
  }
}

/** While the sensor is unavailable, carry the previous live reading forward. */
export function holdHotTubReading(prev: HotTubSnapshot, next: HotTubSnapshot): HotTubSnapshot {
  const merged =
    next.available || prev.temperatureF == null ? next : { ...prev, available: false }
  return merged.available === prev.available &&
    merged.temperatureF === prev.temperatureF &&
    merged.readingAtMs === prev.readingAtMs
    ? prev
    : merged
}

/** Reading to display: live, or held for up to HOT_TUB_HOLD_MS after the sensor drops. */
export function hotTubDisplayReading(
  snap: HotTubSnapshot,
  now = Date.now(),
): { temperatureF: number | null; stale: boolean; ageMs: number | null } {
  if (snap.temperatureF == null) return { temperatureF: null, stale: false, ageMs: null }
  if (snap.available) return { temperatureF: snap.temperatureF, stale: false, ageMs: null }
  const ageMs = snap.readingAtMs == null ? null : now - snap.readingAtMs
  if (ageMs == null || ageMs > HOT_TUB_HOLD_MS) {
    return { temperatureF: null, stale: false, ageMs: null }
  }
  return { temperatureF: snap.temperatureF, stale: true, ageMs }
}
