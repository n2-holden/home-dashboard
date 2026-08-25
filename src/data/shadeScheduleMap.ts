import type { ShadeScheduleEvent } from './shadeSchedules'

export type ScheduleEntityRef = {
  entity: string
  attribute?: string
}

export type ShadeScheduleMapEntry = {
  open?: ScheduleEntityRef
  close?: ScheduleEntityRef
}

export type ShadeScheduleMap = Record<string, ShadeScheduleMapEntry>

type EntityState = {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
}

const DEFAULT_SUN_MAP: ShadeScheduleMap = {}

let scheduleMap: ShadeScheduleMap = {}

export function getShadeScheduleMap(): ShadeScheduleMap {
  return scheduleMap
}

export function setShadeScheduleMap(map: ShadeScheduleMap): void {
  scheduleMap = map
}

export async function loadShadeScheduleMap(): Promise<void> {
  try {
    const url = new URL('shade-schedule-map.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      scheduleMap = {}
      return
    }
    const parsed = (await res.json()) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      scheduleMap = {}
      return
    }
    scheduleMap = normalizeScheduleMap(parsed as Record<string, unknown>)
  } catch {
    scheduleMap = {}
  }
}

function normalizeScheduleMap(raw: Record<string, unknown>): ShadeScheduleMap {
  const result: ShadeScheduleMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    const normalized: ShadeScheduleMapEntry = {}
    const open = normalizeRef(entry.open)
    const close = normalizeRef(entry.close)
    if (open) normalized.open = open
    if (close) normalized.close = close
    if (open || close) result[key] = normalized
  }
  if (!result.default) result.default = DEFAULT_SUN_MAP.default
  return result
}

function normalizeRef(value: unknown): ScheduleEntityRef | undefined {
  if (typeof value === 'string') {
    const [entity, attribute] = value.split('@')
    if (!entity) return undefined
    return attribute ? { entity, attribute } : { entity }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const obj = value as Record<string, unknown>
  if (typeof obj.entity !== 'string') return undefined
  return {
    entity: obj.entity,
    attribute: typeof obj.attribute === 'string' ? obj.attribute : undefined,
  }
}

/** Resolve shade-schedule-map.json entries to cover entity schedules. */
export function schedulesFromScheduleMap(
  map: ShadeScheduleMap,
  states: EntityState[],
  shadeToCoverEntity: Record<string, string>,
): Record<string, ShadeScheduleEvent[]> {
  const statesById = new Map(states.map((state) => [state.entity_id, state]))
  const byCover = new Map<string, ShadeScheduleEvent[]>()
  const defaultEntry = map.default

  for (const [shadeId, coverEntityId] of Object.entries(shadeToCoverEntity)) {
    if (!coverEntityId) continue
    const entry = map[shadeId] ?? defaultEntry
    if (!entry) continue

    if (entry.open) {
      const time = resolveRefTime(entry.open, statesById)
      if (time) appendEvent(byCover, coverEntityId, { time, action: 'Open' })
    }
    if (entry.close) {
      const time = resolveRefTime(entry.close, statesById)
      if (time) appendEvent(byCover, coverEntityId, { time, action: 'Closed' })
    }
  }

  const result: Record<string, ShadeScheduleEvent[]> = {}
  for (const [entityId, events] of byCover) {
    result[entityId] = events.sort((a, b) => a.time.localeCompare(b.time))
  }
  return result
}

function resolveRefTime(
  ref: ScheduleEntityRef,
  statesById: Map<string, EntityState>,
): string | null {
  const state = statesById.get(ref.entity)
  if (!state) return null

  if (ref.attribute) {
    if (ref.entity === 'sun.sun') {
      const attr = state.attributes[ref.attribute]
      if (ref.attribute.includes('rising')) {
        return pickTodayTime(attr, state.attributes.previous_rising)
      }
      if (ref.attribute.includes('setting')) {
        return pickTodayTime(attr, state.attributes.previous_setting)
      }
      return timeFromValue(attr)
    }
    return timeFromValue(state.attributes[ref.attribute]) ?? timeFromValue(state.state)
  }

  return timeFromEntityState(state)
}

function pickTodayTime(nextValue: unknown, previousValue: unknown): string | null {
  const next = timeFromValue(nextValue)
  if (next && isToday(nextValue)) return next
  const previous = timeFromValue(previousValue)
  if (previous && isToday(previousValue)) return previous
  return next ?? previous
}

function isToday(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function timeFromEntityState(state: EntityState): string | null {
  return timeFromValue(state.state) ?? timeFromValue(state.attributes.timestamp)
}

function timeFromValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000
    const date = new Date(ms)
    if (Number.isNaN(date.getTime())) return null
    return formatLocalTime(date)
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (clock) {
    const hours = Number(clock[1])
    const minutes = Number(clock[2])
    if (hours <= 23 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }
  }
  const date = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return null
  return formatLocalTime(date)
}

function formatLocalTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function appendEvent(
  map: Map<string, ShadeScheduleEvent[]>,
  entityId: string,
  event: ShadeScheduleEvent,
): void {
  const list = map.get(entityId) ?? []
  list.push(event)
  map.set(entityId, list)
}

export function usesSunDefault(map: ShadeScheduleMap): boolean {
  const entry = map.default
  return Boolean(
    entry?.open?.entity === 'sun.sun' || entry?.close?.entity === 'sun.sun',
  )
}
