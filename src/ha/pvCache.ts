/** PV production snapshot written by the AlsoEnergy HA integration (pv-cache.json). */

export type PvCacheSnapshot = {
  siteId?: number | null
  siteName?: string | null
  powerW?: number | null
  energyMonthKwh?: number | null
  energyLifetimeKwh?: number | null
  todayKwh?: number | null
  yearKwh?: number | null
  lastUpdate?: string | null
  timeZone?: string | null
  fetchedAt?: string | null
  pollingPaused?: boolean
}

export async function fetchPvCache(): Promise<PvCacheSnapshot | null> {
  try {
    const url = new URL('pv-cache.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as PvCacheSnapshot
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
