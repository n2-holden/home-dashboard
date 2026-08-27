/** Shade positions written by HA dashboard_sync (shades-cache.json). */

export type ShadeCacheEntry = {
  entityId?: string
  state?: string
  position?: number | null
}

export type ShadesCacheSnapshot = {
  generatedAt?: string
  shadeCount?: number
  shades?: Record<string, ShadeCacheEntry>
}

export async function fetchShadesCache(): Promise<ShadesCacheSnapshot | null> {
  try {
    const url = new URL('shades-cache.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as ShadesCacheSnapshot
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
