/** Instantaneous Grid watts written by the egauge_live HA component. */

export type EgaugeLiveCache = {
  gridWatts?: number | null
  fetchedAt?: string | null
}

export async function fetchEgaugeLiveCache(): Promise<EgaugeLiveCache | null> {
  try {
    const url = new URL('egauge-live.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as EgaugeLiveCache
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
