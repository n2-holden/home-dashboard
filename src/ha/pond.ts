import type { HaState } from './positions'
import {
  adjustedWaterLevelInches,
  formatAdjustedWaterLevelInches,
  parseDepthOffsetInches,
} from './depthFormat'

/** Tuya pond level sensor mapping. */
export type PondEntityMap = {
  /** sensor.* liquid level percent */
  level: string | null
  /** sensor.* depth (optional) */
  depth: string | null
  /** Subtracted from sensor reading before display (inches). */
  depthOffset: number
  depthOffsetUnit?: 'in' | 'ft'
}

export const POND_FILL_AUTO_ENABLED_ENTITY = 'input_boolean.pond_fill_auto_enabled'
export const POND_FILL_LOW_INCHES_ENTITY = 'input_number.pond_fill_low_inches'
export const POND_FILL_FULL_INCHES_ENTITY = 'input_number.pond_fill_full_inches'
export const DEFAULT_POND_FILL_LOW_INCHES = -1.5
export const DEFAULT_POND_FILL_FULL_INCHES = 0

export type PondSnapshot = {
  levelPercent: number | null
  levelLabel: string
  depthFt: number | null
  depthLabel: string
  /** Tuya “Pond fill” valve/switch; null when missing / unavailable */
  fillOn: boolean | null
}

export const EMPTY_POND_MAP: PondEntityMap = {
  level: null,
  depth: null,
  depthOffset: 0,
}

export const EMPTY_POND: PondSnapshot = {
  levelPercent: null,
  levelLabel: '—',
  depthFt: null,
  depthLabel: '—',
  fillOn: null,
}

export function formatPondLevel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

export function formatPondDepth(
  measured: number | null,
  unit: string | null = 'ft',
  offsetInches = 0,
): string {
  return formatAdjustedWaterLevelInches(measured, unit, offsetInches)
}

export function parsePondDepthOffset(raw: unknown, unit?: unknown): number {
  return parseDepthOffsetInches(raw, unit)
}

function numericState(state: HaState): number | null {
  const n = Number(state.state)
  return Number.isFinite(n) ? n : null
}

function unitOf(state: HaState): string | null {
  const raw = state.attributes.unit_of_measurement
  return typeof raw === 'string' ? raw : null
}

export function pondSnapshotFromStates(
  map: PondEntityMap,
  states: HaState[],
): PondSnapshot {
  const byId = new Map(states.map((s) => [s.entity_id, s]))
  let levelPercent: number | null = null
  let depthFt: number | null = null
  let depthUnit: string | null = 'ft'

  if (map.level) {
    const state = byId.get(map.level)
    if (state) levelPercent = numericState(state)
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
  const fillEntityId = discoverPondFillEntityId(states)
  const fillOn = fillEntityId ? pondFillIsOn(states, fillEntityId) : null

  return {
    levelPercent,
    levelLabel: formatPondLevel(levelPercent),
    depthFt: adjustedDepthIn,
    depthLabel: formatPondDepth(depthFt, depthUnit, depthOffsetIn),
    fillOn,
  }
}

/** Prefer Tuya valve named “Pond fill”; accept switch.* with the same name. */
export function discoverPondFillEntityId(states: HaState[]): string | null {
  const matches = states.filter((state) => {
    if (
      !state.entity_id.startsWith('valve.') &&
      !state.entity_id.startsWith('switch.')
    ) {
      return false
    }
    const name = String(state.attributes.friendly_name ?? '')
    return /pond[_\s-]*fill/i.test(name) || /pond[_\s-]*fill/i.test(state.entity_id)
  })
  const valve = matches.find((state) => state.entity_id.startsWith('valve.'))
  return (valve ?? matches[0])?.entity_id ?? null
}

export function pondFillIsOn(states: HaState[], entityId: string): boolean | null {
  const state = states.find((entry) => entry.entity_id === entityId)
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return null
  if (state.state === 'on' || state.state === 'open') return true
  if (state.state === 'off' || state.state === 'closed') return false
  return null
}

export function pondMapCount(map: PondEntityMap): number {
  return [map.level, map.depth].filter(Boolean).length
}

export function suggestPondEntityMap(states: HaState[]): PondEntityMap {
  const sensors = states.filter((s) => s.entity_id.startsWith('sensor.'))
  const level =
    sensors.find((s) => /pond.*liquid_level|pond_level_liquid_level/.test(s.entity_id))
      ?.entity_id ??
    sensors.find((s) => /pond/.test(s.entity_id) && /liquid_level|level/.test(s.entity_id))
      ?.entity_id ??
    null
  const depth =
    sensors.find((s) => /pond_level_depth|pond.*depth/.test(s.entity_id))?.entity_id ?? null
  return { level, depth, depthOffset: 0 }
}

export function mergePondEntityMaps(primary: PondEntityMap, fallback: PondEntityMap): PondEntityMap {
  const depthOffset =
    typeof primary.depthOffset === 'number' && Number.isFinite(primary.depthOffset)
      ? primary.depthOffset
      : typeof fallback.depthOffset === 'number' && Number.isFinite(fallback.depthOffset)
        ? fallback.depthOffset
        : 0
  return {
    level: primary.level ?? fallback.level,
    depth: primary.depth ?? fallback.depth,
    depthOffset,
  }
}
