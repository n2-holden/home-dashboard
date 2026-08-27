import type { HaState } from './positions'

/** Tuya pond level sensor mapping. */
export type PondEntityMap = {
  /** sensor.* liquid level percent */
  level: string | null
  /** sensor.* depth (optional) */
  depth: string | null
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

export function formatPondDepth(value: number | null, unit: string | null = 'ft'): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const u = (unit ?? 'ft').trim() || 'ft'
  const abs = Math.abs(value)
  const text = abs >= 10 ? value.toFixed(1) : value.toFixed(2)
  return `${text} ${u}`
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

  return {
    levelPercent,
    levelLabel: formatPondLevel(levelPercent),
    depthFt,
    depthLabel: formatPondDepth(depthFt, depthUnit),
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
  return { level, depth }
}

export function mergePondEntityMaps(primary: PondEntityMap, fallback: PondEntityMap): PondEntityMap {
  return {
    level: primary.level ?? fallback.level,
    depth: primary.depth ?? fallback.depth,
  }
}
