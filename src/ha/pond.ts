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

export type PondSnapshot = {
  levelPercent: number | null
  levelLabel: string
  depthFt: number | null
  depthLabel: string
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

  return {
    levelPercent,
    levelLabel: formatPondLevel(levelPercent),
    depthFt: adjustedDepthIn,
    depthLabel: formatPondDepth(depthFt, depthUnit, depthOffsetIn),
  }
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
