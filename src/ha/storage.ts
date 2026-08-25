import { INITIAL_SHADES } from '../data/types'

const TOKEN_KEY = 'home-dashboard.haToken'
const BASE_KEY = 'home-dashboard.haBase'
const MAP_KEY = 'home-dashboard.shadeEntityMap'
const ENERGY_MAP_KEY = 'home-dashboard.energyEntityMap'

/** shadeId → cover entity_id */
export type ShadeEntityMap = Record<string, string>

export type EnergyEntityMap = {
  /** House PV array (IQ Gateway · micros) production */
  pvOnlyProduction: string | null
  /** House PV array consumption / load */
  pvOnlyLoad: string | null
  /** House PV array grid import/export */
  pvOnlyGrid: string | null
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

export async function hydrateShadeEntityMap(): Promise<ShadeEntityMap> {
  const local = loadShadeEntityMap()
  if (shadeMapCount(local) > 0) return local

  const shared = await fetchSharedShadeEntityMap()
  if (shared && shadeMapCount(shared) > 0) {
    saveShadeEntityMap(shared)
    return shared
  }
  return local
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

/** Use shared ha-config.json when this browser has no saved token (e.g. Nabu Casa). */
export async function hydrateHaConfig(): Promise<boolean> {
  if (loadToken()) return false
  const shared = await fetchSharedHaConfig()
  if (!shared) return false
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
