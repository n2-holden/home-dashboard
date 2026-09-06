import type { HaState } from './positions'

/** Smart Water Tank 1 — Water Level (%) from the Smart Water HA integration. */
export const CISTERN_WATER_LEVEL_ENTITY = 'sensor.smartwater_tank_1_water_level'

export const CISTERN_HISTORY_HOURS = 48
export const CISTERN_HISTORY_MS = CISTERN_HISTORY_HOURS * 60 * 60 * 1000

const LOCAL_HISTORY_KEY = 'cistern-history-v1'

export type CisternSnapshot = {
  entityId: string
  /** 0–100, or null when unavailable */
  levelPercent: number | null
  formatted: string
}

export type CisternHistoryPoint = {
  timestamp: string
  value: number
}

export const EMPTY_CISTERN: CisternSnapshot = {
  entityId: CISTERN_WATER_LEVEL_ENTITY,
  levelPercent: null,
  formatted: '—',
}

export function cisternFromStates(states: HaState[]): CisternSnapshot {
  const state = states.find((entry) => entry.entity_id === CISTERN_WATER_LEVEL_ENTITY)
  if (!state || state.state === 'unavailable' || state.state === 'unknown') {
    return EMPTY_CISTERN
  }

  const raw = Number(state.state)
  if (!Number.isFinite(raw)) return EMPTY_CISTERN

  const levelPercent = Math.max(0, Math.min(100, Math.round(raw)))
  return {
    entityId: CISTERN_WATER_LEVEL_ENTITY,
    levelPercent,
    formatted: `${levelPercent}%`,
  }
}

type HaHistoryState = {
  state?: string
  last_changed?: string
  last_updated?: string
}

/** Parse HA `/api/history/period` response for a single numeric sensor. */
export function parseCisternHistory(raw: unknown): CisternHistoryPoint[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  const series = Array.isArray(raw[0]) ? (raw[0] as HaHistoryState[]) : []
  const points: CisternHistoryPoint[] = []

  for (const entry of series) {
    const value = Number(entry.state)
    if (!Number.isFinite(value)) continue
    const timestamp = entry.last_changed ?? entry.last_updated
    if (!timestamp) continue
    points.push({
      timestamp,
      value: Math.max(0, Math.min(100, value)),
    })
  }

  return points.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

function prunePoints(points: CisternHistoryPoint[], nowMs = Date.now()): CisternHistoryPoint[] {
  const cutoff = nowMs - CISTERN_HISTORY_MS
  return points
    .filter((point) => {
      const t = Date.parse(point.timestamp)
      return Number.isFinite(t) && t >= cutoff
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

export function loadLocalCisternHistory(): CisternHistoryPoint[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CisternHistoryPoint[]
    if (!Array.isArray(parsed)) return []
    return prunePoints(
      parsed.filter(
        (point) =>
          point &&
          typeof point.timestamp === 'string' &&
          typeof point.value === 'number' &&
          Number.isFinite(point.value),
      ),
    )
  } catch {
    return []
  }
}

/** Record a sample in the browser so the last 48h stays available even if HA history is sparse. */
export function recordLocalCisternSample(levelPercent: number, at = new Date()): void {
  if (!Number.isFinite(levelPercent)) return
  const nextValue = Math.max(0, Math.min(100, Math.round(levelPercent)))
  const points = loadLocalCisternHistory()
  const last = points[points.length - 1]
  const timestamp = at.toISOString()

  if (last && last.value === nextValue) {
    const ageMs = Date.parse(timestamp) - Date.parse(last.timestamp)
    // Keep a tip update at most every 15 minutes for flat stretches.
    if (Number.isFinite(ageMs) && ageMs < 15 * 60 * 1000) return
    points[points.length - 1] = { timestamp, value: nextValue }
  } else {
    points.push({ timestamp, value: nextValue })
  }

  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(prunePoints(points)))
  } catch {
    /* quota / private mode */
  }
}

export function mergeCisternHistory(
  ...series: CisternHistoryPoint[][]
): CisternHistoryPoint[] {
  const byTs = new Map<number, CisternHistoryPoint>()
  for (const points of series) {
    for (const point of points) {
      const t = Date.parse(point.timestamp)
      if (!Number.isFinite(t)) continue
      byTs.set(t, point)
    }
  }
  return prunePoints([...byTs.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)))
}
