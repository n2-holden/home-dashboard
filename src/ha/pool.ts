import type { HaState } from './positions'

/** ScreenLogic / Pentair + YoLink entities used by the pool widget. */
export type PoolEntityMap = {
  /** climate.* (current_temperature) or sensor.* */
  temperature: string | null
  /** sensor.* RPM */
  pumpRpm: string | null
  /** YoLink (or other) water depth / distance sensor */
  depth: string | null
}

export type PoolSnapshot = {
  temperatureF: number | null
  temperatureLabel: string
  pumpRpm: number | null
  pumpRpmLabel: string
  depthFt: number | null
  depthLabel: string
}

export const EMPTY_POOL_MAP: PoolEntityMap = {
  temperature: null,
  pumpRpm: null,
  depth: null,
}

export const EMPTY_POOL: PoolSnapshot = {
  temperatureF: null,
  temperatureLabel: '—',
  pumpRpm: null,
  pumpRpmLabel: '—',
  depthFt: null,
  depthLabel: '—',
}

export function formatPoolTempF(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}°F`
}

export function formatPoolRpm(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value).toLocaleString()} RPM`
}

export function formatPoolDepth(value: number | null, unit: string | null = 'ft'): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const u = (unit ?? 'ft').trim() || 'ft'
  const abs = Math.abs(value)
  const text = abs >= 10 ? value.toFixed(1) : value.toFixed(2)
  return `${text} ${u}`
}

function numericAttr(state: HaState, key: string): number | null {
  const raw = state.attributes[key]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function numericState(state: HaState): number | null {
  const n = Number(state.state)
  return Number.isFinite(n) ? n : null
}

function unitOf(state: HaState): string | null {
  const raw = state.attributes.unit_of_measurement
  return typeof raw === 'string' ? raw : null
}

export function poolSnapshotFromStates(
  map: PoolEntityMap,
  states: HaState[],
): PoolSnapshot {
  const byId = new Map(states.map((s) => [s.entity_id, s]))
  let temperatureF: number | null = null
  let pumpRpm: number | null = null
  let depthFt: number | null = null
  let depthUnit: string | null = 'ft'

  if (map.temperature) {
    const state = byId.get(map.temperature)
    if (state) {
      if (state.entity_id.startsWith('climate.')) {
        temperatureF = numericAttr(state, 'current_temperature')
      } else {
        temperatureF = numericState(state)
      }
    }
  }

  if (map.pumpRpm) {
    const state = byId.get(map.pumpRpm)
    if (state) pumpRpm = numericState(state)
  }

  if (map.depth) {
    const state = byId.get(map.depth)
    if (state) {
      depthFt = numericState(state)
      depthUnit = unitOf(state) ?? 'ft'
    }
  }

  return {
    temperatureF,
    temperatureLabel: formatPoolTempF(temperatureF),
    pumpRpm,
    pumpRpmLabel: formatPoolRpm(pumpRpm),
    depthFt,
    depthLabel: formatPoolDepth(depthFt, depthUnit),
  }
}

export function poolMapCount(map: PoolEntityMap): number {
  return [map.temperature, map.pumpRpm, map.depth].filter(Boolean).length
}

/** Prefer ScreenLogic Pentair pool heat + pump RPM + YoLink water depth. */
export function suggestPoolEntityMap(states: HaState[]): PoolEntityMap {
  const climates = states.filter((s) => s.entity_id.startsWith('climate.'))
  const sensors = states.filter((s) => s.entity_id.startsWith('sensor.'))

  const temperature =
    climates.find((s) => /pentair|screenlogic/.test(s.entity_id) && /pool_heat|pool/.test(s.entity_id))
      ?.entity_id ??
    climates.find((s) => /pool.*heat|pool_temp/.test(s.entity_id))?.entity_id ??
    sensors.find(
      (s) =>
        /pentair|screenlogic|pool/.test(s.entity_id) &&
        /water_temp|pool_temp|temperature/.test(s.entity_id) &&
        !/air/.test(s.entity_id),
    )?.entity_id ??
    null

  const pumpRpm =
    sensors.find((s) => /pentair|screenlogic/.test(s.entity_id) && /rpm/.test(s.entity_id))
      ?.entity_id ??
    sensors.find((s) => /pool.*pump.*rpm|pump.*rpm/.test(s.entity_id))?.entity_id ??
    null

  const depth =
    sensors.find((s) => /water_depth_sensor_distance|yolink.*distance|water_depth.*distance/.test(s.entity_id))
      ?.entity_id ??
    sensors.find(
      (s) =>
        /water_depth|pool.*depth|depth.*sensor/.test(s.entity_id) &&
        /distance|depth/.test(s.entity_id),
    )?.entity_id ??
    null

  return { temperature, pumpRpm, depth }
}

export function mergePoolEntityMaps(primary: PoolEntityMap, fallback: PoolEntityMap): PoolEntityMap {
  return {
    temperature: primary.temperature ?? fallback.temperature,
    pumpRpm: primary.pumpRpm ?? fallback.pumpRpm,
    depth: primary.depth ?? fallback.depth,
  }
}
