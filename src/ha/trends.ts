import { CISTERN_WATER_LEVEL_ENTITY } from './cistern'
import { adjustedWaterLevelInches } from './depthFormat'
import { SHED_INVERTER_POWER_ENTITY } from './energy'
import { HOT_TUB_POWER_ENTITY, HOT_TUB_TEMPERATURE_ENTITY } from './hotTub'
import { POND_FILL_VALVE_ENTITY } from './pond'
import type { EnergyEntityMap } from './storage'
import { irrigationZoneName, type IrrigationSnapshot } from './irrigation'
import { PENTAIR_SPA_HEAT_ENTITY, spaHeaterIsOn } from './pool'
import type { HaState } from './positions'

export const WELL_PUMP_POWER_ENTITY = 'sensor.egauge97490_well_pumps_power'

export const TREND_RANGE_DAYS = [2, 4, 7] as const
export type TrendRangeDays = (typeof TREND_RANGE_DAYS)[number]
/** Default chart view: prior-day midnight through end of today. */
export const TREND_DEFAULT_RANGE_DAYS: TrendRangeDays = 2
/** Keep local samples long enough to cover the longest chart range. */
export const TREND_RETENTION_DAYS = 7
/** @deprecated Prefer TREND_DEFAULT_RANGE_DAYS; kept for call sites expecting hours. */
export const TREND_WINDOW_HOURS = TREND_DEFAULT_RANGE_DAYS * 24

export type TrendSeriesId =
  | 'cistern'
  | 'irrigationZone'
  | 'wellPumpPower'
  | 'poolTemp'
  | 'poolHeater'
  | 'poolLevel'
  | 'pondTemp'
  | 'pond'
  | 'pondFill'
  | 'pvArray'
  | 'shedInverter'
  | 'hotTubTemp'
  | 'hotTubPower'

export type TrendUnit = 'percent' | 'watts' | 'zone' | 'temperature' | 'inches'

export type TrendLiveValues = {
  cisternPercent: number | null
  pondPercent: number | null
  shedInverterWatts: number | null
  pvArrayWatts: number | null
  irrigationZone: number | null
  wellPumpWatts: number | null
  poolTempF: number | null
  /** 100 while the heater is firing, 0 otherwise. */
  poolHeaterPercent: number | null
  /** Offset-adjusted pool water level. */
  poolLevelInches: number | null
  pondTempF: number | null
  /** 100 while the fill valve is open, 0 otherwise. */
  pondFillPercent: number | null
  hotTubTempF: number | null
  hotTubWatts: number | null
}

export type TrendPoint = {
  timestamp: string
  /** NaN marks a gap (source unavailable): the chart lifts the pen until the next value. */
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
  {
    id: 'irrigationZone',
    label: 'Irrigation zone',
    color: '#009688',
    unit: 'zone',
    defaultOn: true,
  },
  { id: 'wellPumpPower', label: 'Well pumps', color: '#8D6E63', unit: 'watts', defaultOn: false },
  {
    id: 'poolTemp',
    label: 'Pool temperature',
    color: '#4FC3F7',
    unit: 'temperature',
    defaultOn: true,
  },
  { id: 'poolHeater', label: 'Pool heater', color: '#FF7043', unit: 'percent', defaultOn: true },
  {
    id: 'poolLevel',
    label: 'Pool water level',
    color: '#7E57C2',
    unit: 'inches',
    defaultOn: true,
  },
  { id: 'pondTemp', label: 'Temperature', color: '#66BB6A', unit: 'temperature', defaultOn: true },
  { id: 'pond', label: 'Pond level', color: '#1B9AAA', unit: 'percent', defaultOn: true },
  { id: 'pondFill', label: 'Fill valve', color: '#FFA726', unit: 'percent', defaultOn: true },
  { id: 'pvArray', label: 'PV array', color: '#E53935', unit: 'watts', defaultOn: true },
  {
    id: 'shedInverter',
    label: 'Shed inverter',
    color: '#F5A623',
    unit: 'watts',
    defaultOn: true,
  },
  {
    id: 'hotTubTemp',
    label: 'Water temperature',
    color: '#EC407A',
    unit: 'temperature',
    defaultOn: true,
  },
  { id: 'hotTubPower', label: 'Power', color: '#9B59B6', unit: 'watts', defaultOn: true },
]

export type TrendTabId = 'water' | 'pool' | 'pond' | 'solar' | 'hotTub'

export const TREND_TABS: Array<{ id: TrendTabId; label: string; series: TrendSeriesId[] }> = [
  { id: 'water', label: 'Water', series: ['cistern', 'irrigationZone', 'wellPumpPower'] },
  { id: 'pool', label: 'Pool', series: ['poolTemp', 'poolHeater', 'poolLevel'] },
  { id: 'pond', label: 'Pond', series: ['pondTemp', 'pond', 'pondFill'] },
  { id: 'solar', label: 'Solar', series: ['pvArray', 'shedInverter'] },
  { id: 'hotTub', label: 'Hot tub', series: ['hotTubTemp', 'hotTubPower'] },
]

export function trendTabForSeries(id: TrendSeriesId): TrendTabId {
  return TREND_TABS.find((tab) => tab.series.includes(id))?.id ?? 'water'
}

export function parseTrendTab(raw: string | null): TrendTabId | null {
  return TREND_TABS.some((tab) => tab.id === raw) ? (raw as TrendTabId) : null
}

/** Series whose HA history lives in climate attributes, not entity state. */
export const POOL_TREND_SERIES: ReadonlySet<TrendSeriesId> = new Set(['poolTemp', 'poolHeater'])

const LOCAL_HISTORY_KEY = 'trends-history-v1'
const VISIBLE_KEY = 'trends-visible-v2'
/** Keep a little extra so the fixed midnight window is covered. */
const LOCAL_RETENTION_MS = (TREND_RETENTION_DAYS * 24 + 12) * 60 * 60 * 1000
/** eGauge power changes every second; only keep a local sample this often. */
export const POWER_SAMPLE_MS = 30_000
const THROTTLED_SERIES: ReadonlySet<TrendSeriesId> = new Set([
  'hotTubPower',
  'wellPumpPower',
])
/** While a zone is running, keep a heartbeat so OFF gaps are less likely. */
export const IRRIGATION_ACTIVE_SAMPLE_MS = 60_000
/** Unchanged numeric samples older than this get their timestamp bumped. */
const SAME_VALUE_KEEPALIVE_MS = 15 * 60 * 1000
/** Hard cap so a runaway sampler cannot balloon localStorage / Safari memory. */
const MAX_LOCAL_POINTS_PER_SERIES = 12_000

type LocalStore = Partial<Record<TrendSeriesId, TrendPoint[]>>

const TREND_SERIES_IDS = new Set<string>(TREND_SERIES.map((series) => series.id))

const lastThrottledSampleMs = new Map<TrendSeriesId, number>()

type HaHistoryState = {
  entity_id?: string
  state?: string
  attributes?: Record<string, unknown>
  last_changed?: string
  last_updated?: string
}

/** Local midnight windows ending tomorrow 00:00 (end of today). */
export function trendChartWindow(
  days: TrendRangeDays = TREND_DEFAULT_RANGE_DAYS,
  now = new Date(),
): { start: Date; end: Date } {
  const end = new Date(now)
  end.setHours(24, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - days)
  return { start, end }
}

export function trendRangeLabel(days: TrendRangeDays): string {
  if (days === 2) return '2 days'
  if (days === 4) return '4 days'
  return '1 week'
}

export function formatTrendValue(
  unit: TrendUnit,
  value: number | null,
  zoneNames?: Record<number, string>,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (unit === 'percent') return `${Math.round(value)}%`
  if (unit === 'temperature') return `${value.toFixed(1)}°F`
  if (unit === 'inches') return `${value.toFixed(1)} in`
  if (unit === 'zone') {
    if (value <= 0) return 'Idle'
    const zoneNum = Math.round(value)
    const name = zoneNames?.[zoneNum] ?? irrigationZoneName(zoneNum)
    return `${zoneNum}: ${name}`
  }
  const abs = Math.abs(value)
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 1 : 2)} kW`
  return `${Math.round(value)} W`
}

/** Zone name only (no number prefix) — used for CSV name column. */
export function formatIrrigationZoneName(
  value: number | null,
  zoneNames?: Record<number, string>,
): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return 'Idle'
  const zoneNum = Math.round(value)
  return zoneNames?.[zoneNum] ?? irrigationZoneName(zoneNum)
}

export function activeIrrigationZone(irrigation: IrrigationSnapshot): number {
  const active = irrigation.zones.filter((zone) => zone.active === true)
  if (active.length === 0) return 0
  return active[0].zoneNum
}

export type TrendEntitySources = {
  energyMap: EnergyEntityMap
  irrigation: IrrigationSnapshot
  pondLevelEntity?: string | null
  poolTemperatureEntity?: string | null
  poolDepthEntity?: string | null
}

/** HA entities behind a series; pondTemp comes from the Zynect cloud, not HA. */
export function resolveTrendEntityIds(id: TrendSeriesId, sources: TrendEntitySources): string[] {
  switch (id) {
    case 'cistern':
      return [CISTERN_WATER_LEVEL_ENTITY]
    case 'pond':
      return sources.pondLevelEntity ? [sources.pondLevelEntity] : []
    case 'pondFill':
      return [POND_FILL_VALVE_ENTITY]
    case 'shedInverter':
      return [SHED_INVERTER_POWER_ENTITY]
    case 'pvArray':
      return sources.energyMap.pvOnlyProduction ? [sources.energyMap.pvOnlyProduction] : []
    case 'irrigationZone':
      return sources.irrigation.zones.map((zone) => zone.entityId)
    case 'wellPumpPower':
      return [WELL_PUMP_POWER_ENTITY]
    case 'poolTemp':
      return sources.poolTemperatureEntity ? [sources.poolTemperatureEntity] : []
    case 'poolHeater':
      return [PENTAIR_SPA_HEAT_ENTITY]
    case 'poolLevel':
      return sources.poolDepthEntity ? [sources.poolDepthEntity] : []
    case 'hotTubTemp':
      return [HOT_TUB_TEMPERATURE_ENTITY]
    case 'hotTubPower':
      return [HOT_TUB_POWER_ENTITY]
    default:
      return []
  }
}

export function currentTrendValue(id: TrendSeriesId, values: TrendLiveValues): number | null {
  switch (id) {
    case 'cistern':
      return values.cisternPercent
    case 'pond':
      return values.pondPercent
    case 'shedInverter':
      return values.shedInverterWatts
    case 'pvArray':
      return values.pvArrayWatts
    case 'irrigationZone':
      return values.irrigationZone
    case 'wellPumpPower':
      return values.wellPumpWatts
    case 'poolTemp':
      return values.poolTempF
    case 'poolHeater':
      return values.poolHeaterPercent
    case 'poolLevel':
      return values.poolLevelInches
    case 'pondTemp':
      return values.pondTempF
    case 'pondFill':
      return values.pondFillPercent
    case 'hotTubTemp':
      return values.hotTubTempF
    case 'hotTubPower':
      return values.hotTubWatts
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
  if (THROTTLED_SERIES.has(id)) {
    const last = lastThrottledSampleMs.get(id) ?? 0
    if (last > 0 && atMs - last < POWER_SAMPLE_MS) return
    lastThrottledSampleMs.set(id, atMs)
  }

  const timestamp = at.toISOString()
  const store = readLocalStore()
  for (const key of Object.keys(store)) {
    if (!TREND_SERIES_IDS.has(key)) delete store[key as TrendSeriesId]
  }
  const points = loadLocalTrendHistory(id)
  const last = points[points.length - 1]
  const rounded =
    id === 'irrigationZone' || id === 'cistern' || id === 'pond' || id === 'pondFill'
      ? Math.round(value)
      : value

  if (last && last.value === rounded) {
    const ageMs = atMs - Date.parse(last.timestamp)
    // While a zone is active, append a heartbeat so long runs stay visible locally
    // even if HA history later drops an OFF transition.
    if (id === 'irrigationZone' && rounded > 0) {
      if (!Number.isFinite(ageMs) || ageMs < IRRIGATION_ACTIVE_SAMPLE_MS) return
      points.push({ timestamp, value: rounded })
    } else if (Number.isFinite(ageMs) && ageMs < SAME_VALUE_KEEPALIVE_MS) {
      return
    } else {
      points[points.length - 1] = { timestamp, value: rounded }
    }
  } else {
    points.push({ timestamp, value: rounded })
  }

  store[id] = prunePoints(points, Date.now() - LOCAL_RETENTION_MS)
  writeLocalStore(store)
}

export function recordAllTrendSamples(values: TrendLiveValues): void {
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

export function parseNumericHistory(
  raw: unknown,
  entityId?: string,
  options: { unavailableAsGap?: boolean } = {},
): TrendPoint[] {
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

  const entries = series.filter(
    (entry) => !(entityId && entry.entity_id && entry.entity_id !== entityId),
  )
  const points: TrendPoint[] = []
  for (const entry of entries) {
    const timestamp = entry.last_changed ?? entry.last_updated
    if (!timestamp) continue
    const offline = entry.state === 'unavailable' || entry.state === 'unknown'
    if (offline && options.unavailableAsGap) {
      points.push({ timestamp, value: Number.NaN })
      continue
    }
    const value = Number(entry.state)
    if (!Number.isFinite(value)) continue
    points.push({ timestamp, value })
  }
  return points.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

/** Time-weighted mean of a step-held series over [start, end]; NaN gaps are excluded. */
export function stepSeriesAverage(points: TrendPoint[], start: Date, end: Date): number | null {
  const startMs = start.getTime()
  const endMs = end.getTime()
  let weighted = 0
  let covered = 0
  for (let i = 0; i < points.length; i++) {
    const value = points[i].value
    if (!Number.isFinite(value)) continue
    const from = Math.max(startMs, Date.parse(points[i].timestamp))
    const nextMs = i + 1 < points.length ? Date.parse(points[i + 1].timestamp) : endMs
    const to = Math.min(endMs, nextMs)
    if (!(to > from)) continue
    weighted += value * (to - from)
    covered += to - from
  }
  return covered > 0 ? weighted / covered : null
}

export function poolHeaterPercent(spaHeaterOn: boolean | null): number | null {
  if (spaHeaterOn == null) return null
  return spaHeaterOn ? 100 : 0
}

/**
 * Pool temperature (climate current_temperature or a plain sensor state) or heater
 * on/off (0/100 from hvac_action). Needs full-attribute, all-changes history.
 */
export function parsePoolHistory(
  raw: unknown,
  entityId: string,
  kind: 'temperature' | 'heater',
): TrendPoint[] {
  if (!Array.isArray(raw)) return []
  const bucket =
    (raw.filter(Array.isArray) as HaHistoryState[][]).find(
      (rows) => rows[0]?.entity_id === entityId,
    ) ?? []
  const points: TrendPoint[] = []
  let last: number | null = null
  for (const entry of bucket) {
    const timestamp = entry.last_updated ?? entry.last_changed
    if (!timestamp) continue
    const offline = entry.state === 'unavailable' || entry.state === 'unknown'
    let value: number
    if (offline) {
      value = Number.NaN
    } else if (kind === 'heater') {
      const on = spaHeaterIsOn({ state: entry.state ?? '', attributes: entry.attributes ?? {} })
      if (on == null) continue
      value = on ? 100 : 0
    } else {
      const attr = entityId.startsWith('climate.')
        ? entry.attributes?.current_temperature
        : entry.state
      value = typeof attr === 'number' ? attr : Number(attr)
      if (!Number.isFinite(value)) continue
    }
    if (kind === 'heater' && last != null && Object.is(last, value)) continue
    last = value
    points.push({ timestamp, value })
  }
  return points
}

function historyRowsFor(raw: unknown, entityId: string): HaHistoryState[] {
  if (!Array.isArray(raw)) return []
  return (
    (raw.filter(Array.isArray) as HaHistoryState[][]).find(
      (rows) => rows[0]?.entity_id === entityId,
    ) ?? []
  )
}

/** Depth sensor history → offset-adjusted inches. Needs full-attribute history for units. */
export function parseDepthHistory(
  raw: unknown,
  entityId: string,
  offsetInches: number,
): TrendPoint[] {
  const points: TrendPoint[] = []
  for (const entry of historyRowsFor(raw, entityId)) {
    const timestamp = entry.last_changed ?? entry.last_updated
    if (!timestamp) continue
    if (entry.state === 'unavailable' || entry.state === 'unknown') {
      points.push({ timestamp, value: Number.NaN })
      continue
    }
    const unit = entry.attributes?.unit_of_measurement
    const inches = adjustedWaterLevelInches(
      Number(entry.state),
      typeof unit === 'string' ? unit : null,
      offsetInches,
    )
    if (inches != null) points.push({ timestamp, value: inches })
  }
  return points
}

/** Valve / switch history → 100 while open or on, 0 otherwise. */
export function parseOpenHistory(raw: unknown, entityId: string): TrendPoint[] {
  const points: TrendPoint[] = []
  let last: number | null = null
  for (const entry of historyRowsFor(raw, entityId)) {
    const timestamp = entry.last_changed ?? entry.last_updated
    if (!timestamp) continue
    const state = String(entry.state ?? '').toLowerCase()
    let value: number
    if (state === 'unavailable' || state === 'unknown') value = Number.NaN
    else value = state === 'open' || state === 'opening' || state === 'on' ? 100 : 0
    if (last != null && Object.is(last, value)) continue
    last = value
    points.push({ timestamp, value })
  }
  return points
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
    // minimal_response omits entity_id after the first row in each bucket.
    const bucketEntityId = bucket[0]?.entity_id
    for (const entry of bucket) {
      const entityId = entry.entity_id ?? bucketEntityId
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

/** Cap chart density so eGauge-style second samples don't freeze the UI. */
export const TREND_CHART_MAX_POINTS = 2_500

export function downsampleTrendPoints(
  points: TrendPoint[],
  maxPoints = TREND_CHART_MAX_POINTS,
): TrendPoint[] {
  if (points.length <= maxPoints) return points
  const last = points.length - 1
  const out: TrendPoint[] = []
  let prevIdx = -1
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = i === maxPoints - 1 ? last : Math.round((i * last) / (maxPoints - 1))
    if (idx === prevIdx) continue
    // Keep gap markers that fall between samples so outages stay visible.
    for (let j = prevIdx + 1; j < idx; j += 1) {
      if (!Number.isFinite(points[j].value)) {
        out.push(points[j])
        break
      }
    }
    out.push(points[idx])
    prevIdx = idx
  }
  return out
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

/** Rising / falling %/hour from cistern samples in the chart window. */
export type CisternPercentRates = {
  risingPercentPerHour: number | null
  fallingPercentPerHour: number | null
  /** Direction of the most recent active segment in the window. */
  direction: 'rising' | 'falling' | 'flat'
}

/** Grid used to evaluate the step-held cistern series. */
const CISTERN_RATE_SAMPLE_MS = 5 * 60 * 1000
/** Ignore tiny recorder noise. */
const CISTERN_RATE_EPS = 0.05
/**
 * Flats shorter than this stay part of an active rise/fall (staircase holds).
 * Longer flats are peak/trough plateaus and are excluded from both rates.
 */
const CISTERN_SHORT_FLAT_MAX_MS = 40 * 60 * 1000

/**
 * Rising / falling % per hour over the window.
 *
 * HA cistern history is step-held. Pairing raw points attributes peak plateaus to
 * the next drop; charging only change buckets ignores staircase holds and makes
 * both rates look like per-jump spikes. Instead: resample the held series, keep
 * short flats inside an active rise/fall, and drop long plateaus.
 */
export function cisternPercentRates(
  points: TrendPoint[],
  window?: { start: Date; end: Date },
): CisternPercentRates {
  const sorted = [...points]
    .map((point) => ({ t: Date.parse(point.timestamp), v: point.value }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t)
  if (sorted.length === 0) {
    return { risingPercentPerHour: null, fallingPercentPerHour: null, direction: 'flat' }
  }

  const startMs = window?.start.getTime() ?? sorted[0].t
  // Don't sample past the last observation — the chart window often extends to
  // end-of-day, and a held level there falsely flips direction to flat.
  const lastDataMs = sorted[sorted.length - 1].t
  const windowEndMs = window?.end.getTime() ?? lastDataMs
  const endMs = Math.min(windowEndMs, lastDataMs)
  if (!(endMs > startMs)) {
    return { risingPercentPerHour: null, fallingPercentPerHour: null, direction: 'flat' }
  }

  const valueAtOrBefore = (timeMs: number): number | null => {
    let best: number | null = null
    for (const point of sorted) {
      if (point.t > timeMs) break
      best = point.v
    }
    return best
  }

  const sampleHours = CISTERN_RATE_SAMPLE_MS / 3_600_000
  const shortFlatMaxHours = CISTERN_SHORT_FLAT_MAX_MS / 3_600_000

  let risePct = 0
  let riseHours = 0
  let fallPct = 0
  let fallHours = 0
  let mode: 'idle' | 'rise' | 'fall' = 'idle'
  let pendingFlatHours = 0
  let prev = valueAtOrBefore(startMs)

  for (let t = startMs + CISTERN_RATE_SAMPLE_MS; t <= endMs; t += CISTERN_RATE_SAMPLE_MS) {
    const next = valueAtOrBefore(t)
    if (prev == null || next == null) {
      prev = next ?? prev
      continue
    }
    const deltaPct = next - prev
    prev = next

    if (deltaPct > CISTERN_RATE_EPS) {
      if (mode === 'rise' && pendingFlatHours > 0 && pendingFlatHours <= shortFlatMaxHours) {
        riseHours += pendingFlatHours
      }
      pendingFlatHours = 0
      mode = 'rise'
      risePct += deltaPct
      riseHours += sampleHours
      continue
    }

    if (deltaPct < -CISTERN_RATE_EPS) {
      if (mode === 'fall' && pendingFlatHours > 0 && pendingFlatHours <= shortFlatMaxHours) {
        fallHours += pendingFlatHours
      }
      pendingFlatHours = 0
      mode = 'fall'
      fallPct += deltaPct
      fallHours += sampleHours
      continue
    }

    // Flat: may be a staircase hold (short) or a peak/trough plateau (long).
    if (mode === 'idle') continue
    pendingFlatHours += sampleHours
    if (pendingFlatHours > shortFlatMaxHours) {
      pendingFlatHours = 0
      mode = 'idle'
    }
  }

  const direction: CisternPercentRates['direction'] =
    mode === 'rise' ? 'rising' : mode === 'fall' ? 'falling' : 'flat'

  return {
    risingPercentPerHour: riseHours > 0 ? risePct / riseHours : null,
    fallingPercentPerHour: fallHours > 0 ? fallPct / fallHours : null,
    direction,
  }
}

export function formatPercentPerHour(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 100) / 100
  if (Math.abs(rounded) < 0.005) return '0%/hr'
  const abs = Math.abs(rounded)
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace(/\.?0+$/, '')
  const signed = rounded > 0 ? `+${text}` : `-${text}`
  return `${signed}%/hr`
}

/**
 * ETA for the cistern to reach 100%, using the window rising rate and current level.
 * Only meaningful while the series is actively rising and below full.
 */
export function cisternFullEta(
  levelPercent: number | null,
  rates: CisternPercentRates | null,
  now = new Date(),
): Date | null {
  if (!rates || rates.direction !== 'rising') return null
  const rate = rates.risingPercentPerHour
  if (levelPercent == null || rate == null || !(rate > CISTERN_RATE_EPS)) return null
  if (levelPercent >= 100 - CISTERN_RATE_EPS) return null
  const hours = (100 - levelPercent) / rate
  if (!Number.isFinite(hours) || hours < 0) return null
  return new Date(now.getTime() + hours * 3_600_000)
}

/** e.g. "3:45 PM" today, or "Sun 10:30 AM" / "Sep 14, 10:30 AM" farther out. */
export function formatCisternFullEta(when: Date | null, now = new Date()): string | null {
  if (!when || Number.isNaN(when.getTime())) return null
  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(when)
  const sameDay =
    when.getFullYear() === now.getFullYear() &&
    when.getMonth() === now.getMonth() &&
    when.getDate() === now.getDate()
  if (sameDay) return time

  const daysOut = Math.round((startOfLocalDay(when) - startOfLocalDay(now)) / 86_400_000)
  if (daysOut > 0 && daysOut < 7) {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(when)
    return `${weekday} ${time}`
  }
  const date = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(when)
  return `${date}, ${time}`
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Wide CSV: timestamp + one column per visible series (Excel-friendly). */
export function downloadTrendsCsv(
  series: TrendSeriesData[],
  days: TrendRangeDays,
  zoneNames?: Record<number, string>,
): void {
  const active = series.filter((s) => s.points.length > 0)
  if (active.length === 0) return

  const stampSet = new Set<string>()
  for (const s of active) {
    for (const point of s.points) stampSet.add(point.timestamp)
  }
  const stamps = [...stampSet].sort()
  const maps = active.map(
    (s) => new Map(s.points.map((point) => [point.timestamp, point.value] as const)),
  )
  const lastBySeries: Array<number | null> = active.map(() => null)

  const header: string[] = ['timestamp']
  for (const s of active) {
    if (s.unit === 'zone') {
      header.push('Irrigation zone #', 'Irrigation zone name')
    } else {
      header.push(s.label)
    }
  }

  const lines = [header.map(csvCell).join(',')]
  for (const stamp of stamps) {
    const cells = [csvCell(stamp)]
    for (let i = 0; i < active.length; i += 1) {
      const value = maps[i].get(stamp)
      if (value != null) {
        lastBySeries[i] = Number.isFinite(value) ? value : null
      }
      const held = lastBySeries[i]
      if (held == null || !Number.isFinite(held)) {
        if (active[i].unit === 'zone') {
          cells.push('', '')
        } else {
          cells.push('')
        }
        continue
      }
      if (active[i].unit === 'zone') {
        const zoneNum = Math.round(held)
        if (zoneNum <= 0) {
          cells.push('0', csvCell('Idle'))
        } else {
          cells.push(String(zoneNum), csvCell(formatIrrigationZoneName(held, zoneNames)))
        }
      } else {
        cells.push(String(held))
      }
    }
    lines.push(cells.join(','))
  }

  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trends-${days}d-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
