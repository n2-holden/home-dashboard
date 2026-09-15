import type { HaState } from './positions'

export const REMINDER_COUNT = 2 as const

export type DashboardReminder = {
  id: 1 | 2
  enabled: boolean
  /** Local reset time as HH:MM:SS */
  resetTime: string
  message: string
  /** When true, the calendar button is shown (lit). */
  active: boolean
}

export type ReminderEntities = {
  enabled: string
  reset: string
  message: string
  active: string
}

export const REMINDER_ENTITIES: Record<1 | 2, ReminderEntities> = {
  1: {
    enabled: 'input_boolean.dashboard_reminder_1_enabled',
    reset: 'input_datetime.dashboard_reminder_1_reset',
    message: 'input_text.dashboard_reminder_1_message',
    active: 'input_boolean.dashboard_reminder_1_active',
  },
  2: {
    enabled: 'input_boolean.dashboard_reminder_2_enabled',
    reset: 'input_datetime.dashboard_reminder_2_reset',
    message: 'input_text.dashboard_reminder_2_message',
    active: 'input_boolean.dashboard_reminder_2_active',
  },
}

export const DEFAULT_REMINDERS: DashboardReminder[] = [
  {
    id: 1,
    enabled: true,
    resetTime: '03:00:00',
    message: 'Reminder',
    active: false,
  },
  {
    id: 2,
    enabled: false,
    resetTime: '03:00:00',
    message: 'Reminder 2',
    active: false,
  },
]

export function normalizeReminders(raw: unknown): DashboardReminder[] {
  const list = Array.isArray(raw) ? raw : []
  return DEFAULT_REMINDERS.map((fallback, index) => {
    const row = list[index]
    if (!row || typeof row !== 'object') return { ...fallback }
    const item = row as Record<string, unknown>
    return {
      id: fallback.id,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : fallback.enabled,
      resetTime: normalizeTime(item.resetTime, fallback.resetTime),
      message:
        typeof item.message === 'string' && item.message.trim()
          ? item.message.trim().slice(0, 64)
          : fallback.message,
      active: typeof item.active === 'boolean' ? item.active : fallback.active,
    }
  })
}

export function remindersFromHaStates(
  states: HaState[],
  base: DashboardReminder[] = DEFAULT_REMINDERS,
): DashboardReminder[] {
  return base.map((fallback) => {
    const entities = REMINDER_ENTITIES[fallback.id]
    const enabled = stateBool(states, entities.enabled)
    const active = stateBool(states, entities.active)
    const message = stateText(states, entities.message)
    const resetTime = stateTime(states, entities.reset)
    return {
      id: fallback.id,
      enabled: enabled ?? fallback.enabled,
      active: active ?? fallback.active,
      message: message?.trim() ? message.trim().slice(0, 64) : fallback.message,
      resetTime: resetTime ?? fallback.resetTime,
    }
  })
}

/** Reminders that should render as lit buttons on the calendar. */
export function visibleCalendarReminders(reminders: DashboardReminder[]): DashboardReminder[] {
  return reminders.filter((reminder) => reminder.enabled && reminder.active)
}

/**
 * Keep reminder config from `config`, but take live `active` from HA.
 * Automations re-arm Active; dashboard JSON must not overwrite that.
 */
export function mergeRemindersHaActive(
  config: DashboardReminder[],
  fromHa: DashboardReminder[],
): DashboardReminder[] {
  const byId = new Map(fromHa.map((reminder) => [reminder.id, reminder]))
  return normalizeReminders(
    config.map((reminder) => {
      const ha = byId.get(reminder.id)
      return ha ? { ...reminder, active: ha.active } : reminder
    }),
  )
}

export function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (!match) return fallback
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = match[3] != null ? Number(match[3]) : 0
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return fallback
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

/** Value for <input type="time"> (HH:MM). */
export function timeInputValue(resetTime: string): string {
  const normalized = normalizeTime(resetTime, '03:00:00')
  return normalized.slice(0, 5)
}

export function timeFromInputValue(value: string): string {
  return normalizeTime(value.length === 5 ? `${value}:00` : value, '03:00:00')
}

function stateBool(states: HaState[], entityId: string): boolean | null {
  const state = states.find((entry) => entry.entity_id === entityId)?.state
  if (state === 'on') return true
  if (state === 'off') return false
  return null
}

function stateText(states: HaState[], entityId: string): string | null {
  const state = states.find((entry) => entry.entity_id === entityId)?.state
  if (state == null || state === 'unknown' || state === 'unavailable') return null
  return state
}

function stateTime(states: HaState[], entityId: string): string | null {
  const entry = states.find((row) => row.entity_id === entityId)
  if (!entry || entry.state === 'unknown' || entry.state === 'unavailable') return null
  const attrTime = entry.attributes.time
  if (typeof attrTime === 'string' && attrTime.trim()) {
    return normalizeTime(attrTime, entry.state)
  }
  return normalizeTime(entry.state, '03:00:00')
}
