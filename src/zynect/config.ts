import { DEFAULT_ZYNECT_CONFIG, type ZynectConfig } from './types'

const STORAGE_KEY = 'home-dashboard.zynectConfig'

export function getDefaultZynectConfig(): ZynectConfig {
  return { ...DEFAULT_ZYNECT_CONFIG }
}

export function saveZynectConfigLocal(config: ZynectConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(config)))
}

export function loadZynectConfigLocal(): ZynectConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalize(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export async function fetchSharedZynectConfig(): Promise<ZynectConfig | null> {
  try {
    const url = new URL('zynect-config.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return normalize(await res.json())
  } catch {
    return null
  }
}

export async function hydrateZynectConfig(): Promise<ZynectConfig> {
  const shared = await fetchSharedZynectConfig()
  if (shared?.authHeaderValue) return shared
  const local = loadZynectConfigLocal()
  if (local?.authHeaderValue) return local
  return shared ?? local ?? getDefaultZynectConfig()
}

export function configHasCredentials(config: ZynectConfig): boolean {
  return Boolean(config.authHeaderValue?.trim())
}

export function downloadZynectConfig(config: ZynectConfig): void {
  const blob = new Blob([JSON.stringify(normalize(config), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'zynect-config.json'
  a.click()
  URL.revokeObjectURL(url)
}

function normalize(raw: unknown): ZynectConfig {
  const base = getDefaultZynectConfig()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const obj = raw as Record<string, unknown>
  return {
    baseUrl: typeof obj.baseUrl === 'string' ? obj.baseUrl : base.baseUrl,
    authHeaderName:
      typeof obj.authHeaderName === 'string' ? obj.authHeaderName : base.authHeaderName,
    authHeaderValue:
      typeof obj.authHeaderValue === 'string'
        ? obj.authHeaderValue.trim()
        : base.authHeaderValue,
    product: typeof obj.product === 'string' ? obj.product : base.product,
    refreshIntervalSeconds:
      typeof obj.refreshIntervalSeconds === 'number' && obj.refreshIntervalSeconds > 0
        ? obj.refreshIntervalSeconds
        : base.refreshIntervalSeconds,
    siteLatitude:
      typeof obj.siteLatitude === 'number' ? obj.siteLatitude : base.siteLatitude,
    siteLongitude:
      typeof obj.siteLongitude === 'number' ? obj.siteLongitude : base.siteLongitude,
  }
}
