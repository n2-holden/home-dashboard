import { CISTERN_WATER_LEVEL_ENTITY } from './cistern'
import { EGAUGE_LIVE_GRID_ENTITY } from './egauge'
import type { EnergyEntityMap } from './storage'
import { irrigationZoneName, type IrrigationSnapshot } from './irrigation'
import type { HaState } from './positions'

export const TREND_WINDOW_HOURS = 48

export type TrendSeriesId =
  | 'cistern'
  | 'batterySoc'
  | 'powerpackPv'
  | 'pvArray'
  | 'housePower'
  | 'irrigationZone'

export type TrendUnit = 'percent' | 'watts' | 'zone'

export type TrendPoint = {
  timestamp: string
  value: number
}

export type TrendSeriesDef = {
  id: TrendSeriesId
  label: string
  color: string
  unit: TrendUnit
  defaultOn: boolean
}

export type TrendSeriesData = TrendSeriesDef & {
  points: TrendPoint[]
  current: number | null
}

export const TREND_SERIES: TrendSeriesDef[] = [
  { id: 'cistern', label: 'Cistern', color: '#2E86AB', unit: 'percent', defaultOn: true },
  { id: 'batterySoc', label: 'Battery SOC', color: '#4CAF50', unit: 'percent', defaultOn: true },
  {
    id: 'powerpackPv',
    label: 'Battery PV',
    color: '#F5A623',
    unit: 'watts',
    defaultOn: false,
  },
  { id: 'pvArray', label: 'PV array', color: '#E53935', unit: 'watts', defaultOn: false },
  { id: 'housePower', label: 'House power', color: '#9B59B6', unit: 'watts', defaultOn: false },
  {
    id: 'irrigationZone',
    label: 'Irrigation zone',
    color: '#009688',
    unit: 'zone',
    defaultOn: false,
  },
]

const LOCAL_HISTORY_KEY = 'trends-history-v1'
const VISIBLE_KEY = 'trends-visible-v1'
/** Keep a little extra so the fixed midnight window is covered. */
const LOCAL_RETENTION_MS = (TREND_WINDOW_HOURS + 12) * 60 * 60 * 1000
/** House power changes every second; only keep a sample every 30s. */
export const HOUSE_POWER_SAMPLE_MS = 30_000
/** Hard cap so a runaway sampler cannot balloon localStorage / Safari memory. */
const MAX_LOCAL_POINTS_PER_SERIES = 4_000

type LocalStore = Partial<Record<TrendSeriesId, TrendPoint[]>>

let lastHousePowerSampleMs = 0

type HaHistoryState = {
  entity_id?: string
  state?: string
  last_changed?: string
  last_updated?: string
}

/** Yesterday 00:00 local → tomorrow 00:00 local (end of today). */
export function trendChartWindow(now = new Date()): { start: Date; end: Date } {
  const end = new Date(now)
  end.setHours(24, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - 2)
  return { start, end }
}

export function formatTrendValue(
  unit: TrendUnit,
  value: number | null,
  zoneNames?: Record<number, string>,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (unit === 'percent') return `${Math.round(value)}%`
  if (unit === 'zone') {
    if (value <= 0) return 'Idle'
    const zoneNum = Math.round(value)
    return zoneNames?.[zoneNum] ?? irrigationZoneName(zoneNum)
  }
  const abs = Math.abs(value)
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 1 : 2)} kW`
  return `${Math.round(value)} W`
}

export function activeIrrigationZone(irrigation: IrrigationSnapshot): number {
  const active = irrigation.zones.filter((zone) => zone.active === true)
  if (active.length === 0) return 0
  return active[0].zoneNum
}

export function resolveTrendEntityIds(
  id: TrendSeriesId,
  energyMap: EnergyEntityMap,
  irrigation: IrrigationSnapshot,
): string[] {
  switch (id) {
    case 'cistern':
      return [CISTERN_WATER_LEVEL_ENTITY]
    case 'batterySoc':
      return energyMap.powerpackBatterySoc ? [energyMap.powerpackBatterySoc] : []
    case 'powerpackPv':
      return energyMap.powerpackProduction ? [energyMap.powerpackProduction] : []
    case 'pvArray':
      return energyMap.pvOnlyProduction ? [energyMap.pvOnlyProduction] : []
    case 'housePower':
      return [EGAUGE_LIVE_GRID_ENTITY]
    case 'irrigationZone':
      return irrigation.zones.map((zone) => zone.entityId)
    default:
      return []
  }
}

export function currentTrendValue(
  id: TrendSeriesId,
  values: {
    cisternPercent: number | null
    batterySoc: number | null
    powerpackPvWatts: number | null
    pvArrayWatts: number | null
    housePowerWatts: number | null
    irrigationZone: number | null
  },
): number | null {
  switch (id) {
    case 'cistern':
      return values.cisternPercent
    case 'batterySoc':
      return values.batterySoc
    case 'powerpackPv':
      return values.powerpackPvWatts
    case 'pvArray':
      return values.pvArrayWatts
    case 'housePower':
      return values.housePowerWatts
    case 'irrigationZone':
      return values.irrigationZone
    default:
      return null
  }
}

function prunePoints(points: TrendPoint[], cutoffMs: number): TrendPoint[] {
  const pruned = points
    .filter((point) => {
      const t = Date.parse(point.timestamp)
      return Number.isFinite(t) && t >= cutoffMs
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  if (pruned.length <= MAX_LOCAL_POINTS_PER_SERIES) return pruned
  return pruned.slice(pruned.length - MAX_LOCAL_POINTS_PER_SERIES)
}

function readLocalStore(): LocalStore {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalStore(store: LocalStore): void {
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(store))
  } catch {
    /* quota / private mode */
  }
}

export function loadLocalTrendHistory(id: TrendSeriesId): TrendPoint[] {
  const cutoff = Date.now() - LOCAL_RETENTION_MS
  const points = readLocalStore()[id]
  if (!Array.isArray(points)) return []
  return prunePoints(
    points.filter(
      (point) =>
        point &&
        typeof point.timestamp === 'string' &&
        typeof point.value === 'number' &&
        Number.isFinite(point.value),
    ),
    cutoff,
  )
}

export function recordLocalTrendSample(id: TrendSeriesId, value: number, at = new Date()): void {
  if (!Number.isFinite(value)) return
  const atMs = at.getTime()
  if (id === 'housePower') {
    if (lastHousePowerSampleMs > 0 && atMs - lastHousePowerSampleMs < HOUSE_POWER_SAMPLE_MS) {
      return
    }
    lastHousePowerSampleMs = atMs
  }

  const timestamp = at.toISOString()
  const store = readLocalStore()
  const points = loadLocalTrendHistory(id)
  const last = points[points.length - 1]
  const rounded =
    id === 'irrigationZone' || id === 'cistern' || id === 'batterySoc'
      ? Math.round(value)
      : value

  if (last && last.value === rounded) {
    const ageMs = atMs - Date.parse(last.timestamp)
    if (Number.isFinite(ageMs) && ageMs < 15 * 60 * 1000) {
      return
    }
    points[points.length - 1] = { timestamp, value: rounded }
  } else {
    points.push({ timestamp, value: rounded })
  }

  store[id] = prunePoints(points, Date.now() - LOCAL_RETENTION_MS)
  writeLocalStore(store)
}

export function recordAllTrendSamples(values: {
  cisternPercent: number | null
  batterySoc: number | null
  powerpackPvWatts: number | null
  pvArrayWatts: number | null
  housePowerWatts: number | null
  irrigationZone: number | null
}): void {
  for (const series of TREND_SERIES) {
    const value = currentTrendValue(series.id, values)
    if (value != null) recordLocalTrendSample(series.id, value)
  }
}

export function loadVisibleTrendSeries(): Record<TrendSeriesId, boolean> {
  const defaults = Object.fromEntries(
    TREND_SERIES.map((series) => [series.id, series.defaultOn]),
  ) as Record<TrendSeriesId, boolean>
  try {
    const raw = localStorage.getItem(VISIBLE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Record<TrendSeriesId, boolean>>
    return { ...defaults, ...parsed }
  } catch {
    return defaults
  }
}

export function saveVisibleTrendSeries(visible: Record<TrendSeriesId, boolean>): void {
  try {
    localStorage.setItem(VISIBLE_KEY, JSON.stringify(visible))
  } catch {
    /* ignore */
  }
}

export function parseNumericHistory(raw: unknown, entityId?: string): TrendPoint[] {
  if (!Array.isArray(raw)) return []
  const buckets = raw.filter(Array.isArray) as HaHistoryState[][]
  const series =
    entityId != null
      ? buckets.find((bucket) => bucket[0]?.entity_id === entityId) ??
        buckets.find((bucket) =>
          bucket.some((entry) => entry.entity_id === entityId),
        ) ??
        []
      : buckets[0] ?? []

  const points: TrendPoint[] = []
  for (const entry of series) {
    if (entityId && entry.entity_id && entry.entity_id !== entityId) continue
    const value = Number(entry.state)
    if (!Number.isFinite(value)) continue
    const timestamp = entry.last_changed ?? entry.last_updated
    if (!timestamp) continue
    points.push({ timestamp, value })
  }
  return points.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

/** Build zone-number timeline from Rain Bird switch histories (0 = idle). */
export function synthesizeIrrigationZoneHistory(
  raw: unknown,
  zones: Array<{ entityId: string; zoneNum: number }>,
): TrendPoint[] {
  if (!Array.isArray(raw) || zones.length === 0) return []
  const zoneByEntity = new Map(zones.map((zone) => [zone.entityId, zone.zoneNum]))
  const events: Array<{ t: number; zoneNum: number; on: boolean }> = []

  for (const bucket of raw as HaHistoryState[][]) {
    if (!Array.isArray(bucket) || bucket.length === 0) continue
    for (const entry of bucket) {
      const entityId = entry.entity_id
      if (!entityId) continue
      const zoneNum = zoneByEntity.get(entityId)
      if (zoneNum == null) continue
      const timestamp = entry.last_changed ?? entry.last_updated
      if (!timestamp) continue
      const t = Date.parse(timestamp)
      if (!Number.isFinite(t)) continue
      const on = entry.state === 'on'
      events.push({ t, zoneNum, on })
    }
  }

  events.sort((a, b) => a.t - b.t)
  const active = new Set<number>()
  const points: TrendPoint[] = []
  let lastValue: number | null = null

  const emit = (t: number) => {
    const value = active.size === 0 ? 0 : Math.min(...active)
    if (lastValue === value) return
    lastValue = value
    points.push({ timestamp: new Date(t).toISOString(), value })
  }

  for (const event of events) {
    if (event.on) active.add(event.zoneNum)
    else active.delete(event.zoneNum)
    emit(event.t)
  }

  return points
}

export function mergeTrendPoints(...series: TrendPoint[][]): TrendPoint[] {
  const byTs = new Map<number, TrendPoint>()
  for (const points of series) {
    for (const point of points) {
      const t = Date.parse(point.timestamp)
      if (!Number.isFinite(t)) continue
      byTs.set(t, point)
    }
  }
  return [...byTs.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

export function clipTrendPoints(
  points: TrendPoint[],
  start: Date,
  end: Date,
): TrendPoint[] {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const sorted = [...points].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  const clipped = sorted.filter((point) => {
    const t = Date.parse(point.timestamp)
    return Number.isFinite(t) && t >= startMs && t <= endMs
  })

  // Carry forward the last known value before the window so step series don't start blank.
  const before = [...sorted].reverse().find((point) => Date.parse(point.timestamp) < startMs)
  if (before && (clipped.length === 0 || Date.parse(clipped[0].timestamp) > startMs)) {
    clipped.unshift({ timestamp: start.toISOString(), value: before.value })
  }
  return clipped
}

/** Step-extend the last point to `end` so lines reach "now"/window end. */
export function extendTrendToEnd(points: TrendPoint[], end: Date): TrendPoint[] {
  if (points.length === 0) return points
  const last = points[points.length - 1]
  const endIso = end.toISOString()
  if (last.timestamp === endIso) return points
  const endMs = end.getTime()
  const lastMs = Date.parse(last.timestamp)
  if (!Number.isFinite(lastMs) || lastMs >= endMs) return points
  return [...points, { timestamp: endIso, value: last.value }]
}

export function numericFromState(states: HaState[], entityId: string | null | undefined): number | null {
  if (!entityId) return null
  const state = states.find((entry) => entry.entity_id === entityId)
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return null
  const value = Number(state.state)
  return Number.isFinite(value) ? value : null
}

export type IrrigationZonePeriodStats = {
  zoneNum: number
  runCount: number
  totalRunMs: number
  /** Sum of (cistern% at start − cistern% at end) across runs with both samples. */
  waterUsedPercent: number | null
}

function trendValueAtOrBefore(points: TrendPoint[], timeMs: number): number | null {
  let best: number | null = null
  for (const point of points) {
    const t = Date.parse(point.timestamp)
    if (!Number.isFinite(t) || t > timeMs) break
    best = point.value
  }
  return best
}

/** Parse irrigation zone step timeline into per-zone run totals for a window. */
export function computeIrrigationZonePeriodStats(
  irrigationPoints: TrendPoint[],
  cisternPoints: TrendPoint[],
  start: Date,
  end: Date,
  now = new Date(),
): Map<number, IrrigationZonePeriodStats> {
  const startMs = start.getTime()
  const endMs = Math.min(end.getTime(), now.getTime())
  const zonePoints = clipTrendPoints(irrigationPoints, start, new Date(endMs))
  const tankPoints = [...cisternPoints].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  )
  const byZone = new Map<number, IrrigationZonePeriodStats>()

  const ensure = (zoneNum: number): IrrigationZonePeriodStats => {
    let row = byZone.get(zoneNum)
    if (!row) {
      row = { zoneNum, runCount: 0, totalRunMs: 0, waterUsedPercent: null }
      byZone.set(zoneNum, row)
    }
    return row
  }

  const addRun = (zoneNum: number, runStartMs: number, runEndMs: number) => {
    if (!(zoneNum > 0) || !(runEndMs > runStartMs)) return
    const clippedStart = Math.max(runStartMs, startMs)
    const clippedEnd = Math.min(runEndMs, endMs)
    if (!(clippedEnd > clippedStart)) return

    const row = ensure(zoneNum)
    row.runCount += 1
    row.totalRunMs += clippedEnd - clippedStart

    const startLevel = trendValueAtOrBefore(tankPoints, clippedStart)
    const endLevel = trendValueAtOrBefore(tankPoints, clippedEnd)
    if (startLevel == null || endLevel == null) return
    const used = startLevel - endLevel
    row.waterUsedPercent = (row.waterUsedPercent ?? 0) + used
  }

  for (let i = 0; i < zonePoints.length; i += 1) {
    const point = zonePoints[i]
    const zoneNum = Math.round(point.value)
    if (zoneNum <= 0) continue
    const runStartMs = Date.parse(point.timestamp)
    if (!Number.isFinite(runStartMs)) continue
    const next = zonePoints[i + 1]
    const runEndMs = next ? Date.parse(next.timestamp) : endMs
    if (!Number.isFinite(runEndMs)) continue
    addRun(zoneNum, runStartMs, runEndMs)
  }

  return byZone
}

export function formatDurationMs(ms: number): string {
  if (!(ms > 0) || !Number.isFinite(ms)) return '—'
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return s >= 30 && m < 10 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

export function formatCisternUsedPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  if (Math.abs(rounded) < 0.05) return '0%'
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text}%`
}

