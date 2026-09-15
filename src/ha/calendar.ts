import type { HaState } from './positions'

export type HaCalendarEvent = {
  summary: string
  description: string | null
  location: string | null
  start: Date
  end: Date
  allDay: boolean
}

export type HaCalendarEntity = {
  entityId: string
  name: string
  state: string
}

export type CalendarEventRow = {
  key: string
  summary: string
  timeLabel: string
  locationLabel: string | null
  dayGroup: 'today' | 'tomorrow'
  ongoing: boolean
  past: boolean
}

export type CalendarDaySection = {
  key: string
  label: string
  dateLabel: string
  events: Array<{
    key: string
    summary: string
    timeLabel: string
    locationLabel: string | null
    ongoing: boolean
    past: boolean
  }>
}

export type CalendarSnapshot = {
  entityId: string
  name: string
  dayLabel: string
  events: CalendarEventRow[]
  statusLabel: string
}

/** Shared across all dashboard instances; on = Reminder button hidden. @deprecated Prefer dashboard_reminder_*_active. */
export const CALENDAR_REMINDER_DISMISSED_ENTITY =
  'input_boolean.dashboard_calendar_reminder_dismissed'

/** Skip irrigation and other non-personal calendars when auto-picking. */
function isPreferredPersonalCalendar(entity: HaCalendarEntity): boolean {
  const id = entity.entityId.toLowerCase()
  const name = entity.name.toLowerCase()
  if (/rain.?bird|irrigation|sprinkler/.test(id) || /rain.?bird|irrigation|sprinkler/.test(name)) {
    return false
  }
  return true
}

function isLikelyOutlookCalendar(entity: HaCalendarEntity): boolean {
  const hay = `${entity.entityId} ${entity.name}`.toLowerCase()
  return /ms365|outlook|office|microsoft|o365|calendar\.calendar/.test(hay)
}

export function calendarsFromStates(states: HaState[]): HaCalendarEntity[] {
  return states
    .filter((state) => state.entity_id.startsWith('calendar.'))
    .map((state) => ({
      entityId: state.entity_id,
      name:
        typeof state.attributes.friendly_name === 'string'
          ? state.attributes.friendly_name
          : state.entity_id.replace(/^calendar\./, '').replace(/_/g, ' '),
      state: state.state,
    }))
}

export function pickCalendarEntity(entities: HaCalendarEntity[]): HaCalendarEntity | null {
  const personal = entities.filter(isPreferredPersonalCalendar)
  const outlook = personal.find(isLikelyOutlookCalendar)
  if (outlook) return outlook
  if (personal[0]) return personal[0]
  return entities[0] ?? null
}

export function parseCalendarEvents(raw: unknown): HaCalendarEvent[] {
  if (!Array.isArray(raw)) return []
  const events: HaCalendarEvent[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const parsedStart = parseCalendarInstant(row.start)
    const parsedEnd = parseCalendarInstant(row.end)
    if (!parsedStart || !parsedEnd) continue
    const summary =
      typeof row.summary === 'string' && row.summary.trim()
        ? row.summary.trim()
        : typeof row.title === 'string' && row.title.trim()
          ? row.title.trim()
          : 'Busy'
    events.push({
      summary,
      description: typeof row.description === 'string' ? row.description : null,
      location: typeof row.location === 'string' && row.location.trim() ? row.location.trim() : null,
      start: parsedStart.value,
      end: parsedEnd.value,
      allDay: parsedStart.allDay || parsedEnd.allDay,
    })
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function localDayBounds(when = new Date()): { start: Date; end: Date } {
  const start = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 0, 0, 0, 0)
  const end = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1, 0, 0, 0, 0)
  return { start, end }
}

/** Local midnight today through local midnight after tomorrow. */
export function localTwoDayBounds(when = new Date()): { start: Date; end: Date } {
  const start = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 0, 0, 0, 0)
  const end = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 2, 0, 0, 0, 0)
  return { start, end }
}

/** Local midnight today through local midnight 7 days later. */
export function localWeekBounds(when = new Date()): { start: Date; end: Date } {
  const start = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 0, 0, 0, 0)
  const end = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 7, 0, 0, 0, 0)
  return { start, end }
}

/** Group events into today and the next six days. */
export function groupEventsByWeek(
  events: HaCalendarEvent[],
  now = new Date(),
): CalendarDaySection[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sections: CalendarDaySection[] = []

  for (let offset = 0; offset < 7; offset += 1) {
    const dayStart = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      todayStart.getDate() + offset,
    )
    const dayEnd = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      todayStart.getDate() + offset + 1,
    )
    const dayStartMs = dayStart.getTime()
    const dayEndMs = dayEnd.getTime()
    const label =
      offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekdayLabel(dayStart)
    const dateLabel = shortDateLabel(dayStart)
    const dayEvents = events
      .filter((event) => event.start.getTime() < dayEndMs && event.end.getTime() > dayStartMs)
      .map((event, index) => {
        const ongoing = event.start.getTime() <= now.getTime() && event.end.getTime() > now.getTime()
        const past = event.end.getTime() <= now.getTime()
        return {
          key: `${dayStart.toISOString()}-${event.start.toISOString()}-${index}`,
          summary: event.summary,
          timeLabel: formatEventTime(event),
          locationLabel: event.location,
          ongoing,
          past,
        }
      })

    sections.push({
      key: dayStart.toISOString(),
      label,
      dateLabel,
      events: dayEvents,
    })
  }

  return sections
}

function weekdayLabel(when: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(when)
}

function shortDateLabel(when: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(when)
}

export function calendarSnapshot(
  entity: HaCalendarEntity | null,
  events: HaCalendarEvent[],
  now = new Date(),
): CalendarSnapshot | null {
  if (!entity) return null
  const dayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(now)

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const tomorrowStart = todayStart + 86_400_000

  const rows: CalendarEventRow[] = events.map((event, index) => {
    const ongoing = event.start.getTime() <= now.getTime() && event.end.getTime() > now.getTime()
    const past = event.end.getTime() <= now.getTime()
    const dayGroup: 'today' | 'tomorrow' =
      event.start.getTime() >= tomorrowStart ? 'tomorrow' : 'today'
    return {
      key: `${event.start.toISOString()}-${index}`,
      summary: event.summary,
      timeLabel: formatEventTime(event),
      locationLabel: event.location,
      dayGroup,
      ongoing,
      past,
    }
  })

  const todayCount = rows.filter((row) => row.dayGroup === 'today').length
  const tomorrowCount = rows.filter((row) => row.dayGroup === 'tomorrow').length
  let statusLabel = 'No events today or tomorrow'
  if (rows.length > 0) {
    statusLabel = `${todayCount} today · ${tomorrowCount} tomorrow`
  }

  return {
    entityId: entity.entityId,
    name: entity.name,
    dayLabel,
    events: rows,
    statusLabel,
  }
}

function parseCalendarInstant(
  value: unknown,
): { value: Date; allDay: boolean } | null {
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : { value: date, allDay: !value.includes('T') }
  }
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.dateTime === 'string') {
    const date = new Date(row.dateTime)
    return Number.isNaN(date.getTime()) ? null : { value: date, allDay: false }
  }
  if (typeof row.date === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date)
    if (!match) return null
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return Number.isNaN(date.getTime()) ? null : { value: date, allDay: true }
  }
  return null
}

function formatEventTime(event: HaCalendarEvent): string {
  if (event.allDay) return 'All day'
  const start = formatClock(event.start)
  const end = formatClock(event.end)
  return `${start} – ${end}`
}

function formatClock(when: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(when)
}
