/** DoorBird captures from driveway alarm triggers (index written by driveway_events.py on HA). */

export const DRIVEWAY_EVENTS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export type DrivewayEvent = {
  id: string
  timeMs: number
  snapshots: string[]
  video: string | null
}

function eventsBaseUrl(): URL {
  return new URL('../driveway-events/', new URL('./', location.href))
}

export function drivewayEventFileUrl(name: string): string {
  return new URL(name, eventsBaseUrl()).toString()
}

export async function fetchDrivewayEvents(): Promise<DrivewayEvent[]> {
  try {
    const url = new URL('index.json', eventsBaseUrl())
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const parsed = (await res.json()) as { events?: unknown }
    if (!Array.isArray(parsed?.events)) return []
    const cutoff = Date.now() - DRIVEWAY_EVENTS_RETENTION_MS
    return parsed.events
      .filter(
        (e): e is DrivewayEvent =>
          e != null &&
          typeof e === 'object' &&
          typeof (e as DrivewayEvent).id === 'string' &&
          typeof (e as DrivewayEvent).timeMs === 'number' &&
          Array.isArray((e as DrivewayEvent).snapshots),
      )
      .filter((e) => e.timeMs >= cutoff)
      .sort((a, b) => b.timeMs - a.timeMs)
  } catch {
    return []
  }
}
