/** Shed Solar snapshot written by the Enphase PowerPack HA integration (shed-cache.json). */

export type ShedCacheSnapshot = {
  siteId?: number | string | null
  pvPowerW?: number | null
  loadPowerW?: number | null
  batteryPowerW?: number | null
  gridPowerW?: number | null
  batterySoc?: number | null
  energyMonthKwh?: number | null
  energyLifetimeKwh?: number | null
  fetchedAt?: string | null
}

export async function fetchShedCache(): Promise<ShedCacheSnapshot | null> {
  try {
    const url = new URL('shed-cache.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as ShedCacheSnapshot
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
