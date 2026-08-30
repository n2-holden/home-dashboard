import { INITIAL_SHADES } from '../data/types'
import type { PoolEntityMap } from './pool'
import { EMPTY_POOL_MAP, mergePoolEntityMaps, parsePoolDepthOffset, poolMapCount } from './pool'
import type { PondEntityMap } from './pond'
import { EMPTY_POND_MAP, mergePondEntityMaps, parsePondDepthOffset, pondMapCount } from './pond'

const TOKEN_KEY = 'home-dashboard.haToken'
const BASE_KEY = 'home-dashboard.haBase'
const MAP_KEY = 'home-dashboard.shadeEntityMap'
const ENERGY_MAP_KEY = 'home-dashboard.energyEntityMap'
const POOL_MAP_KEY = 'home-dashboard.poolEntityMap'
const POND_MAP_KEY = 'home-dashboard.pondEntityMap'
const LIGHTS_MAP_KEY = 'home-dashboard.crestronLightRooms'

/** shadeId → cover entity_id */
export type ShadeEntityMap = Record<string, string>
/** Crestron light entity_id → user-defined room name. */
export type CrestronLightRoomMap = Record<string, string>

export type EnergyEntityMap = {
  /** House PV array (IQ Gateway · micros) production */
  pvOnlyProduction: string | null
  /** House PV array consumption / load */
  pvOnlyLoad: string | null
  /** House PV array grid import/export */
  pvOnlyGrid: string | null
  /** House PV energy produced today (kWh) */
  pvOnlyTodayEnergy: string | null
  /** House PV energy produced this calendar month (kWh) */
  pvOnlyMonthEnergy: string | null
  /** House PV lifetime energy produced (kWh) */
  pvOnlyLifetimeEnergy: string | null
  /** IQ Powerpack / Shed Solar PV production */
  powerpackProduction: string | null
  /** IQ Powerpack battery state of charge */
  powerpackBatterySoc: string | null
  /** IQ Powerpack house/load power */
  powerpackLoad: string | null
  /** IQ Powerpack battery charge/discharge power */
  powerpackBatteryPower: string | null
  /** IQ Powerpack grid import/export power */
  powerpackGrid: string | null
}

type LegacyEnergyEntityMap = Partial<EnergyEntityMap> & {
  pvProduction?: string | null
  batterySoc?: string | null
}

const EMPTY_ENERGY_MAP: EnergyEntityMap = {
  pvOnlyProduction: null,
  pvOnlyLoad: null,
  pvOnlyGrid: null,
  pvOnlyTodayEnergy: null,
  pvOnlyMonthEnergy: null,
  pvOnlyLifetimeEnergy: null,
  powerpackProduction: null,
  powerpackBatterySoc: null,
  powerpackLoad: null,
  powerpackBatteryPower: null,
  powerpackGrid: null,
}

function normalizeEnergyMap(raw: LegacyEnergyEntityMap): EnergyEntityMap {
  return {
    pvOnlyProduction: raw.pvOnlyProduction ?? raw.pvProduction ?? null,
    pvOnlyLoad: raw.pvOnlyLoad ?? null,
    pvOnlyGrid: raw.pvOnlyGrid ?? null,
    pvOnlyTodayEnergy: raw.pvOnlyTodayEnergy ?? null,
    pvOnlyMonthEnergy: raw.pvOnlyMonthEnergy ?? null,
    pvOnlyLifetimeEnergy: raw.pvOnlyLifetimeEnergy ?? null,
    powerpackProduction: raw.powerpackProduction ?? null,
    powerpackBatterySoc: raw.powerpackBatterySoc ?? raw.batterySoc ?? null,
    powerpackLoad: raw.powerpackLoad ?? null,
    powerpackBatteryPower: raw.powerpackBatteryPower ?? null,
    powerpackGrid: raw.powerpackGrid ?? null,
  }
}

/** Old Master Suite East 1/2/3 ids → consolidated East 1-3 */
const SHADE_ID_MIGRATIONS: Record<string, string> = {
  'shade-top-master-suite-east-1': 'shade-top-master-suite-east-1-3',
  'shade-top-master-suite-east-2': 'shade-top-master-suite-east-1-3',
  'shade-top-master-suite-east-3': 'shade-top-master-suite-east-1-3',
}

export function pruneShadeEntityMap(map: ShadeEntityMap): ShadeEntityMap {
  const knownIds = new Set(INITIAL_SHADES.map((s) => s.id))
  const next: ShadeEntityMap = {}

  for (const [shadeId, entityId] of Object.entries(map)) {
    if (!entityId) continue
    if (knownIds.has(shadeId)) {
      next[shadeId] = entityId
    }
  }

  for (const [fromId, toId] of Object.entries(SHADE_ID_MIGRATIONS)) {
    const entityId = map[fromId]
    if (!entityId || next[toId]) continue
    next[toId] = entityId
  }

  return next
}

export function loadToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function saveToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Empty means same origin (correct when served from HA /local/). */
export function loadBaseUrl(): string {
  return localStorage.getItem(BASE_KEY) ?? ''
}

export function saveBaseUrl(base: string): void {
  const trimmed = base.replace(/\/$/, '')
  if (trimmed) localStorage.setItem(BASE_KEY, trimmed)
  else localStorage.removeItem(BASE_KEY)
}

export function loadShadeEntityMap(): ShadeEntityMap {
  try {
    const raw = localStorage.getItem(MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const pruned = pruneShadeEntityMap(parsed as ShadeEntityMap)
    localStorage.setItem(MAP_KEY, JSON.stringify(pruned))
    return pruned
  } catch {
    return {}
  }
}

export function saveShadeEntityMap(map: ShadeEntityMap): void {
  localStorage.setItem(MAP_KEY, JSON.stringify(pruneShadeEntityMap(map)))
}

export function shadeMapCount(map: ShadeEntityMap): number {
  return Object.values(pruneShadeEntityMap(map)).filter(Boolean).length
}

/**
 * Shared maps live next to the app in /local/home-dashboard/ so local and remote
 * access (different browser origins) can use the same mappings.
 */
export async function fetchSharedShadeEntityMap(): Promise<ShadeEntityMap | null> {
  try {
    const url = new URL('shade-map.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return pruneShadeEntityMap(parsed as ShadeEntityMap)
  } catch {
    return null
  }
}

export function mergeShadeEntityMaps(
  primary: ShadeEntityMap,
  fallback: ShadeEntityMap,
): ShadeEntityMap {
  const next = { ...fallback }
  for (const [shadeId, entityId] of Object.entries(primary)) {
    if (entityId) next[shadeId] = entityId
  }
  return pruneShadeEntityMap(next)
}

export async function hydrateShadeEntityMap(): Promise<ShadeEntityMap> {
  const local = loadShadeEntityMap()
  const shared = await fetchSharedShadeEntityMap()
  // Prefer shared shade-map.json (on HA www) so remote browsers get the same mappings.
  const merged =
    shared && shadeMapCount(shared) > 0
      ? mergeShadeEntityMaps(shared, local)
      : mergeShadeEntityMaps(local, shared ?? {})
  if (shadeMapCount(merged) > 0) {
    saveShadeEntityMap(merged)
  }
  return merged
}

export function loadEnergyEntityMap(): EnergyEntityMap {
  try {
    const raw = localStorage.getItem(ENERGY_MAP_KEY)
    if (!raw) return { ...EMPTY_ENERGY_MAP }
    const parsed = JSON.parse(raw) as LegacyEnergyEntityMap
    return normalizeEnergyMap(parsed)
  } catch {
    return { ...EMPTY_ENERGY_MAP }
  }
}

export function saveEnergyEntityMap(map: EnergyEntityMap): void {
  localStorage.setItem(ENERGY_MAP_KEY, JSON.stringify(normalizeEnergyMap(map)))
}

export function energyMapCount(map: EnergyEntityMap): number {
  const n = normalizeEnergyMap(map)
  return [
    n.pvOnlyProduction,
    n.pvOnlyLoad,
    n.pvOnlyGrid,
    n.pvOnlyTodayEnergy,
    n.pvOnlyMonthEnergy,
    n.pvOnlyLifetimeEnergy,
    n.powerpackProduction,
    n.powerpackBatterySoc,
    n.powerpackLoad,
    n.powerpackBatteryPower,
    n.powerpackGrid,
  ].filter(Boolean).length
}

/** Prefer non-null fields from either side (keeps local mappings across hydrate races). */
export function mergeEnergyEntityMaps(
  primary: EnergyEntityMap,
  fallback: EnergyEntityMap,
): EnergyEntityMap {
  const a = normalizeEnergyMap(primary)
  const b = normalizeEnergyMap(fallback)
  return {
    pvOnlyProduction: a.pvOnlyProduction ?? b.pvOnlyProduction,
    pvOnlyLoad: a.pvOnlyLoad ?? b.pvOnlyLoad,
    pvOnlyGrid: a.pvOnlyGrid ?? b.pvOnlyGrid,
    pvOnlyTodayEnergy: a.pvOnlyTodayEnergy ?? b.pvOnlyTodayEnergy,
    pvOnlyMonthEnergy: a.pvOnlyMonthEnergy ?? b.pvOnlyMonthEnergy,
    pvOnlyLifetimeEnergy: a.pvOnlyLifetimeEnergy ?? b.pvOnlyLifetimeEnergy,
    powerpackProduction: a.powerpackProduction ?? b.powerpackProduction,
    powerpackBatterySoc: a.powerpackBatterySoc ?? b.powerpackBatterySoc,
    powerpackLoad: a.powerpackLoad ?? b.powerpackLoad,
    powerpackBatteryPower: a.powerpackBatteryPower ?? b.powerpackBatteryPower,
    powerpackGrid: a.powerpackGrid ?? b.powerpackGrid,
  }
}

export async function fetchSharedEnergyEntityMap(): Promise<EnergyEntityMap | null> {
  try {
    const url = new URL('energy-map.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as LegacyEnergyEntityMap
    if (!parsed || typeof parsed !== 'object') return null
    return normalizeEnergyMap(parsed)
  } catch {
    return null
  }
}

export async function hydrateEnergyEntityMap(): Promise<EnergyEntityMap> {
  const local = loadEnergyEntityMap()
  const shared = await fetchSharedEnergyEntityMap()
  // Always fill gaps from energy-map.json so remote tablets pick up new fields
  // without wiping mappings already set in this browser.
  let merged = mergeEnergyEntityMaps(local, shared ?? { ...EMPTY_ENERGY_MAP })

  // Prefer shared energy-map.json for both systems whenever defined.
  if (shared?.pvOnlyProduction) {
    merged = { ...merged, pvOnlyProduction: shared.pvOnlyProduction }
  }
  if (shared?.pvOnlyLoad) {
    merged = { ...merged, pvOnlyLoad: shared.pvOnlyLoad }
  }
  if (shared?.pvOnlyGrid) {
    merged = { ...merged, pvOnlyGrid: shared.pvOnlyGrid }
  }
  if (shared?.pvOnlyTodayEnergy) {
    merged = { ...merged, pvOnlyTodayEnergy: shared.pvOnlyTodayEnergy }
  }
  if (shared?.pvOnlyMonthEnergy) {
    merged = { ...merged, pvOnlyMonthEnergy: shared.pvOnlyMonthEnergy }
  }
  if (shared?.pvOnlyLifetimeEnergy) {
    merged = { ...merged, pvOnlyLifetimeEnergy: shared.pvOnlyLifetimeEnergy }
  }
  if (shared?.powerpackBatteryPower) {
    merged = { ...merged, powerpackBatteryPower: shared.powerpackBatteryPower }
  }
  if (shared?.powerpackGrid) {
    merged = { ...merged, powerpackGrid: shared.powerpackGrid }
  }
  if (shared?.powerpackLoad) {
    merged = { ...merged, powerpackLoad: shared.powerpackLoad }
  }
  if (shared?.powerpackBatterySoc) {
    merged = { ...merged, powerpackBatterySoc: shared.powerpackBatterySoc }
  }
  if (shared?.powerpackProduction) {
    merged = { ...merged, powerpackProduction: shared.powerpackProduction }
  }

  if (energyMapCount(merged) > 0) {
    saveEnergyEntityMap(merged)
  }
  return merged
}

function normalizeCrestronLightRoomMap(raw: unknown): CrestronLightRoomMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: CrestronLightRoomMap = {}
  for (const [entityId, room] of Object.entries(raw as Record<string, unknown>)) {
    if (entityId.startsWith('light.') && typeof room === 'string') result[entityId] = room
  }
  return result
}

export function loadCrestronLightRoomMap(): CrestronLightRoomMap {
  try {
    return normalizeCrestronLightRoomMap(JSON.parse(localStorage.getItem(LIGHTS_MAP_KEY) ?? '{}'))
  } catch {
    return {}
  }
}

export function saveCrestronLightRoomMap(map: CrestronLightRoomMap): void {
  localStorage.setItem(LIGHTS_MAP_KEY, JSON.stringify(normalizeCrestronLightRoomMap(map)))
}

export async function fetchSharedCrestronLightRoomMap(): Promise<CrestronLightRoomMap | null> {
  try {
    const url = new URL('lights-map.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return normalizeCrestronLightRoomMap(await res.json())
  } catch {
    return null
  }
}

export async function hydrateCrestronLightRoomMap(): Promise<{
  map: CrestronLightRoomMap
  sharedHasAssignments: boolean
}> {
  const local = loadCrestronLightRoomMap()
  const shared = await fetchSharedCrestronLightRoomMap()
  const merged = { ...local, ...(shared ?? {}) }
  saveCrestronLightRoomMap(merged)
  return {
    map: merged,
    sharedHasAssignments: shared != null && Object.keys(shared).length > 0,
  }
}

export async function syncCrestronLightRoomMapFromShared(
  current: CrestronLightRoomMap,
): Promise<{ map: CrestronLightRoomMap; changed: boolean }> {
  const shared = await fetchSharedCrestronLightRoomMap()
  if (!shared) return { map: current, changed: false }

  const merged = { ...current, ...shared }
  const changed =
    Object.keys(merged).length !== Object.keys(current).length ||
    Object.entries(merged).some(([entityId, room]) => current[entityId] !== room)
  if (changed) saveCrestronLightRoomMap(merged)
  return { map: merged, changed }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type HaConfig = {
  token: string
  baseUrl: string
}

/** Load token/base URL from ha-config.json on the HA box (for remote access). */
export async function fetchSharedHaConfig(): Promise<HaConfig | null> {
  try {
    const url = new URL('ha-config.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as { token?: unknown; baseUrl?: unknown }
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token.trim()) return null
    return {
      token: parsed.token.trim(),
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl.trim() : '',
    }
  } catch {
    return null
  }
}

/** Use shared ha-config.json when served from HA (local + remote). */
export async function hydrateHaConfig(): Promise<boolean> {
  const shared = await fetchSharedHaConfig()
  if (!shared) return false
  const unchanged = loadToken() === shared.token && loadBaseUrl() === shared.baseUrl
  if (unchanged) return false
  saveToken(shared.token)
  saveBaseUrl(shared.baseUrl)
  return true
}

export function exportHaConfigFile(): void {
  downloadJson('ha-config.json', {
    token: loadToken(),
    baseUrl: loadBaseUrl(),
  })
}

export function loadPoolEntityMap(): PoolEntityMap {
  try {
    const raw = localStorage.getItem(POOL_MAP_KEY)
    if (!raw) return { ...EMPTY_POOL_MAP }
    const parsed = JSON.parse(raw) as Partial<PoolEntityMap>
    return {
      temperature: typeof parsed.temperature === 'string' ? parsed.temperature : null,
      pumpRpm: typeof parsed.pumpRpm === 'string' ? parsed.pumpRpm : null,
      depth: typeof parsed.depth === 'string' ? parsed.depth : null,
      depthOffset: parsePoolDepthOffset(parsed.depthOffset, parsed.depthOffsetUnit),
    }
  } catch {
    return { ...EMPTY_POOL_MAP }
  }
}

export function savePoolEntityMap(map: PoolEntityMap): void {
  localStorage.setItem(
    POOL_MAP_KEY,
    JSON.stringify({ ...map, depthOffsetUnit: 'in' as const }),
  )
}

export async function fetchSharedPoolEntityMap(): Promise<PoolEntityMap | null> {
  try {
    const url = new URL('pool-map.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as Partial<PoolEntityMap>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      temperature: typeof parsed.temperature === 'string' ? parsed.temperature : null,
      pumpRpm: typeof parsed.pumpRpm === 'string' ? parsed.pumpRpm : null,
      depth: typeof parsed.depth === 'string' ? parsed.depth : null,
      depthOffset: parsePoolDepthOffset(parsed.depthOffset, parsed.depthOffsetUnit),
    }
  } catch {
    return null
  }
}

export async function hydratePoolEntityMap(): Promise<PoolEntityMap> {
  const local = loadPoolEntityMap()
  const shared = await fetchSharedPoolEntityMap()
  const merged =
    shared && poolMapCount(shared) > 0
      ? mergePoolEntityMaps(shared, local)
      : mergePoolEntityMaps(local, shared ?? EMPTY_POOL_MAP)
  if (poolMapCount(merged) > 0) savePoolEntityMap(merged)
  return merged
}

/** Re-read pool-map.json / pond-map.json from HA www (shared across browser origins). */
export async function syncPoolPondMapsFromShared(
  currentPool: PoolEntityMap,
  currentPond: PondEntityMap,
): Promise<{ pool: PoolEntityMap; pond: PondEntityMap; changed: boolean }> {
  const [sharedPool, sharedPond] = await Promise.all([
    fetchSharedPoolEntityMap(),
    fetchSharedPondEntityMap(),
  ])

  let pool = currentPool
  let pond = currentPond
  let changed = false

  if (sharedPool && poolMapCount(sharedPool) > 0) {
    const merged = mergePoolEntityMaps(sharedPool, currentPool)
    if (poolMapsDiffer(merged, currentPool)) {
      pool = merged
      savePoolEntityMap(merged)
      changed = true
    }
  }

  if (sharedPond && pondMapCount(sharedPond) > 0) {
    const merged = mergePondEntityMaps(sharedPond, currentPond)
    if (pondMapsDiffer(merged, currentPond)) {
      pond = merged
      savePondEntityMap(merged)
      changed = true
    }
  }

  return { pool, pond, changed }
}

function poolMapsDiffer(a: PoolEntityMap, b: PoolEntityMap): boolean {
  return (
    a.temperature !== b.temperature ||
    a.pumpRpm !== b.pumpRpm ||
    a.depth !== b.depth ||
    a.depthOffset !== b.depthOffset
  )
}

function pondMapsDiffer(a: PondEntityMap, b: PondEntityMap): boolean {
  return (
    a.level !== b.level ||
    a.depth !== b.depth ||
    a.depthOffset !== b.depthOffset
  )
}

export function loadPondEntityMap(): PondEntityMap {
  try {
    const raw = localStorage.getItem(POND_MAP_KEY)
    if (!raw) return { ...EMPTY_POND_MAP }
    const parsed = JSON.parse(raw) as Partial<PondEntityMap>
    return {
      level: typeof parsed.level === 'string' ? parsed.level : null,
      depth: typeof parsed.depth === 'string' ? parsed.depth : null,
      depthOffset: parsePondDepthOffset(parsed.depthOffset, parsed.depthOffsetUnit),
    }
  } catch {
    return { ...EMPTY_POND_MAP }
  }
}

export function savePondEntityMap(map: PondEntityMap): void {
  localStorage.setItem(
    POND_MAP_KEY,
    JSON.stringify({ ...map, depthOffsetUnit: 'in' as const }),
  )
}

export async function fetchSharedPondEntityMap(): Promise<PondEntityMap | null> {
  try {
    const url = new URL('pond-map.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as Partial<PondEntityMap>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      level: typeof parsed.level === 'string' ? parsed.level : null,
      depth: typeof parsed.depth === 'string' ? parsed.depth : null,
      depthOffset: parsePondDepthOffset(parsed.depthOffset, parsed.depthOffsetUnit),
    }
  } catch {
    return null
  }
}

export async function hydratePondEntityMap(): Promise<PondEntityMap> {
  const local = loadPondEntityMap()
  const shared = await fetchSharedPondEntityMap()
  const merged =
    shared && pondMapCount(shared) > 0
      ? mergePondEntityMaps(shared, local)
      : mergePondEntityMaps(local, shared ?? EMPTY_POND_MAP)
  if (pondMapCount(merged) > 0) savePondEntityMap(merged)
  return merged
}
