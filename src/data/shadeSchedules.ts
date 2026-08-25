import type { Shade } from './types'

export type ShadeScheduleEvent = {
  /** 24-hour time, e.g. "07:00" */
  time: string
  action: string
}

let overrides: Record<string, ShadeScheduleEvent[]> = {}
let haEntitySchedules: Record<string, ShadeScheduleEvent[]> = {}

export function setShadeScheduleOverrides(map: Record<string, ShadeScheduleEvent[]>): void {
  overrides = map
}

export function setHaEntitySchedules(map: Record<string, ShadeScheduleEvent[]>): void {
  haEntitySchedules = map
}

export async function loadShadeScheduleOverrides(): Promise<void> {
  try {
    const url = new URL('shade-schedules.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return
    const parsed = (await res.json()) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    overrides = parsed as Record<string, ShadeScheduleEvent[]>
  } catch {
    /* optional file */
  }
}

export function scheduleForShade(shade: Shade, entityId?: string | null): ShadeScheduleEvent[] {
  if (overrides[shade.id]?.length) return sortEvents(overrides[shade.id])
  if (overrides[shade.group]?.length) return sortEvents(overrides[shade.group])
  if (entityId && haEntitySchedules[entityId]?.length) {
    return sortEvents(haEntitySchedules[entityId])
  }
  return []
}

function sortEvents(events: ShadeScheduleEvent[]): ShadeScheduleEvent[] {
  return [...events].sort((a, b) => a.time.localeCompare(b.time))
}

export function formatScheduleTime(time: string): string {
  return formatScheduleTime24(time)
}

export function formatScheduleTime24(time: string): string {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export type ShadeScheduleInterval = {
  close: string
  open: string
}

/** Pair close/open times in chronological order (matches Homebridge schedule page). */
export function scheduleIntervalsForShade(
  shade: Shade,
  entityId?: string | null,
): ShadeScheduleInterval[] {
  const events = scheduleForShade(shade, entityId)
  const intervals: ShadeScheduleInterval[] = []
  let pendingClose: string | null = null

  for (const event of events) {
    if (isCloseAction(event.action)) {
      if (pendingClose) {
        intervals.push({ close: pendingClose, open: '' })
      }
      pendingClose = event.time
    } else if (isOpenAction(event.action)) {
      if (pendingClose) {
        intervals.push({ close: pendingClose, open: event.time })
        pendingClose = null
      } else {
        intervals.push({ close: '', open: event.time })
      }
    }
  }

  if (pendingClose) {
    intervals.push({ close: pendingClose, open: '' })
  }

  return intervals
}

function isOpenAction(action: string): boolean {
  return action.trim().toLowerCase() === 'open'
}

function isCloseAction(action: string): boolean {
  const normalized = action.trim().toLowerCase()
  return normalized === 'closed' || normalized === 'close'
}

/** Open and close times only — ignores partial positions like "30% closed". */
export function openCloseTimesForShade(
  shade: Shade,
  entityId?: string | null,
): { open: string[]; close: string[] } {
  const events = scheduleForShade(shade, entityId)
  const open: string[] = []
  const close: string[] = []
  for (const event of events) {
    if (isOpenAction(event.action)) open.push(event.time)
    else if (isCloseAction(event.action)) close.push(event.time)
  }
  return { open, close }
}

export function scheduleSummaryLines(shade: Shade, entityId?: string | null): string[] {
  const intervals = scheduleIntervalsForShade(shade, entityId)
  if (intervals.length === 0) return ['No open/close schedule']
  return intervals.map((interval) => {
    if (interval.close && interval.open) {
      return `CLOSE ${formatScheduleTime24(interval.close)} → OPEN ${formatScheduleTime24(interval.open)}`
    }
    if (interval.close) return `CLOSE ${formatScheduleTime24(interval.close)}`
    return `OPEN ${formatScheduleTime24(interval.open)}`
  })
}
