import type { HaState } from './positions'
import {
  adjustedWaterLevelInches,
  formatAdjustedWaterLevelInches,
  parseDepthOffsetInches,
} from './depthFormat'

/** ScreenLogic / Pentair + YoLink entities used by the pool widget. */
export const PENTAIR_SPA_HEAT_ENTITY = 'climate.pentair_f8_07_0a_spa_heat'

export type PoolEntityMap = {
  /** climate.* (current_temperature) or sensor.* */
  temperature: string | null
  /** sensor.* RPM */
  pumpRpm: string | null
  /** YoLink (or other) water depth / distance sensor */
  depth: string | null
  /** Subtracted from sensor reading before display (inches). */
  depthOffset: number
  /** Present in saved JSON; legacy maps used feet when omitted. */
  depthOffsetUnit?: 'in' | 'ft'
}

export type PoolSnapshot = {
  temperatureF: number | null
  temperatureLabel: string
  spaHeaterOn: boolean | null
  pumpRpm: number | null
  pumpRpmLabel: string
  depthFt: number | null
  depthLabel: string
}

export const EMPTY_POOL_MAP: PoolEntityMap = {
  temperature: null,
  pumpRpm: null,
  depth: null,
  depthOffset: 0,
}

export const EMPTY_POOL: PoolSnapshot = {
  temperatureF: null,
  temperatureLabel: '—',
  spaHeaterOn: null,
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

export function formatPoolDepth(
  measured: number | null,
  unit: string | null = 'ft',
  offsetInches = 0,
): string {
  return formatAdjustedWaterLevelInches(measured, unit, offsetInches)
}

export function parsePoolDepthOffset(raw: unknown, unit?: unknown): number {
  return parseDepthOffsetInches(raw, unit)
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
  let spaHeaterOn: boolean | null = null
  let pumpRpm: number | null = null
  let depthFt: number | null = null
  let depthUnit: string | null = 'ft'

  if (map.temperature) {
    const state = byId.get(map.temperature)
    if (state) {
      if (state.entity_id.startsWith('climate.')) {
        temperatureF = numericAttr(state, 'current_temperature')
        if (state.entity_id === PENTAIR_SPA_HEAT_ENTITY) {
          spaHeaterOn = spaHeaterIsOn(state)
        }
      } else {
        temperatureF = numericState(state)
      }
    }
  }

  if (spaHeaterOn == null) {
    const spaHeatState = byId.get(PENTAIR_SPA_HEAT_ENTITY)
    if (spaHeatState) spaHeaterOn = spaHeaterIsOn(spaHeatState)
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

  const depthOffsetIn = map.depthOffset ?? 0
  const adjustedDepthIn = adjustedWaterLevelInches(depthFt, depthUnit, depthOffsetIn)

  return {
    temperatureF,
    temperatureLabel: formatPoolTempF(temperatureF),
    spaHeaterOn,
    pumpRpm,
    pumpRpmLabel: formatPoolRpm(pumpRpm),
    depthFt: adjustedDepthIn,
    depthLabel: formatPoolDepth(depthFt, depthUnit, depthOffsetIn),
  }
}

function spaHeaterIsOn(state: HaState): boolean | null {
  const action = state.attributes.hvac_action
  if (typeof action === 'string') {
    if (action.toLowerCase() === 'heating') return true
    if (action.toLowerCase() === 'idle' || action.toLowerCase() === 'off') return false
  }
  if (state.state === 'heat') return true
  if (state.state === 'off') return false
  return null
}

export function poolMapCount(map: PoolEntityMap): number {
  return [map.temperature, map.pumpRpm, map.depth].filter(Boolean).length
}

/** Prefer ScreenLogic Pentair spa heat (current water temp) + pump RPM + YoLink depth. */
export function suggestPoolEntityMap(states: HaState[]): PoolEntityMap {
  const climates = states.filter((s) => s.entity_id.startsWith('climate.'))
  const sensors = states.filter((s) => s.entity_id.startsWith('sensor.'))

  const temperature =
    climates.find((s) => /pentair|screenlogic/.test(s.entity_id) && /spa_heat/.test(s.entity_id))
      ?.entity_id ??
    climates.find((s) => /pentair|screenlogic/.test(s.entity_id) && /pool_heat|pool/.test(s.entity_id))
      ?.entity_id ??
    climates.find((s) => /spa.*heat|pool.*heat|pool_temp/.test(s.entity_id))?.entity_id ??
    sensors.find(
      (s) =>
        /pentair|screenlogic|pool|spa/.test(s.entity_id) &&
        /water_temp|pool_temp|spa_temp|temperature/.test(s.entity_id) &&
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

  return { temperature, pumpRpm, depth, depthOffset: 0 }
}

export function mergePoolEntityMaps(primary: PoolEntityMap, fallback: PoolEntityMap): PoolEntityMap {
  const depthOffset =
    typeof primary.depthOffset === 'number' && Number.isFinite(primary.depthOffset)
      ? primary.depthOffset
      : typeof fallback.depthOffset === 'number' && Number.isFinite(fallback.depthOffset)
        ? fallback.depthOffset
        : 0
  return {
    temperature: primary.temperature ?? fallback.temperature,
    pumpRpm: primary.pumpRpm ?? fallback.pumpRpm,
    depth: primary.depth ?? fallback.depth,
    depthOffset,
  }
}
