/** Shared automation + notification preferences (HA helpers + dashboard-settings.json). */

import {
  CISTERN_LOW_WATER_EMAIL_ENABLED_ENTITY,
  CISTERN_LOW_WATER_PERCENT_ENTITY,
  COMMAND_FAILED_EMAIL_ENABLED_ENTITY,
  DASHBOARD_NOTIFY_EMAIL_ENABLED_ENTITY,
  DASHBOARD_NOTIFY_EMAIL_ENTITY,
  DASHBOARD_NOTIFY_PHONE_ENABLED_ENTITY,
  DASHBOARD_NOTIFY_PHONE_ENTITY,
  DEFAULT_CISTERN_LOW_WATER_PERCENT,
  DEFAULT_DEVICE_COMM_FAILURE_MINUTES,
  DEFAULT_INTERNET_OUTAGE_MINUTES,
  DEFAULT_PHONE_NOTIFY_ENTITY,
  DEFAULT_POND_LOW_WATER_INCHES,
  DEFAULT_POOL_LOW_WATER_INCHES,
  DEVICE_COMM_FAILURE_EMAIL_ENABLED_ENTITY,
  DEVICE_COMM_FAILURE_MINUTES_ENTITY,
  DOORBELL_EMAIL_ENABLED_ENTITY,
  DOORBELL_ICON_MINUTES_ENTITY,
  DEFAULT_DOORBELL_ICON_MINUTES,
  INTERNET_OUTAGE_EMAIL_ENABLED_ENTITY,
  INTERNET_OUTAGE_MINUTES_ENTITY,
  POND_LOW_WATER_EMAIL_ENABLED_ENTITY,
  POND_LOW_WATER_INCHES_ENTITY,
  POOL_LOW_WATER_EMAIL_ENABLED_ENTITY,
  POOL_LOW_WATER_INCHES_ENTITY,
  POOL_PUMP_OFF_EMAIL_ENABLED_ENTITY,
} from './notifications'
import {
  DEFAULT_POOL_PUMP_AUTO_ON_MINUTES,
  POOL_PUMP_AUTO_ON_ENABLED_ENTITY,
  POOL_PUMP_AUTO_ON_MINUTES_ENTITY,
} from './pool'
import {
  BATHROOM_FAN_AUTO_OFF_ENABLED_ENTITY,
  BATHROOM_FAN_AUTO_OFF_MINUTES_ENTITY,
  DEFAULT_BATHROOM_FAN_AUTO_OFF_MINUTES,
  EMPTY_BATHROOM_FAN_SLOTS,
  normalizeBathroomFanSlots,
  type BathroomFanSlots,
} from './bathroomFans'
import {
  DEFAULT_POND_FILL_FULL_INCHES,
  DEFAULT_POND_FILL_LOW_INCHES,
  POND_FILL_AUTO_ENABLED_ENTITY,
  POND_FILL_FULL_INCHES_ENTITY,
  POND_FILL_LOW_INCHES_ENTITY,
} from './pond'
import {
  DEFAULT_REMINDERS,
  REMINDER_ENTITIES,
  normalizeReminders,
  remindersFromHaStates,
  type DashboardReminder,
} from './reminders'
import {
  DEFAULT_DRIVEWAY_ALARM_RESET_SECONDS,
  DEFAULT_DRIVEWAY_ALARM_TRIGGER,
  DRIVEWAY_ALARM_EMAIL_ENABLED_ENTITY,
  DRIVEWAY_ALARM_ENABLED_ENTITY,
  DRIVEWAY_ALARM_RESET_SECONDS_ENTITY,
  DRIVEWAY_ALARM_TRIGGER_ENTITY,
  clampDrivewayAlarmResetSeconds,
  drivewayAlarmResetSecondsFromStates,
  drivewayAlarmTriggerFromStates,
  normalizeDrivewayAlarmTrigger,
  type DrivewayAlarmTriggerState,
} from './drivewayAlarm'
import {
  normalizeDashboardActionList,
  type DashboardActionSelection,
} from './dashboardActions'
import {
  normalizeOutsideCustomButtons,
  type OutsideCustomButton,
} from './outsideButtons'
import {
  normalizeDrivewayAlarmConditionRows,
  type DrivewayAlarmConditionRow,
} from './dashboardConditions'
import {
  DEFAULT_DASHBOARD_SOUND,
  normalizeDashboardSoundId,
  type DashboardSoundId,
} from './dashboardSounds'
import type { HaState } from './positions'

export const DASHBOARD_SETTINGS_URL = 'dashboard-settings.json'

export type DashboardSettings = {
  poolPumpOffEmailEnabled: boolean
  deviceCommFailureEmailEnabled: boolean
  deviceCommFailureMinutes: number
  /**
   * Per-device notify switches for communication failures.
   * Missing keys default to enabled (true). Explicit `false` mutes that device.
   */
  deviceCommNotifyEnabled: Record<string, boolean>
  commandFailedEmailEnabled: boolean
  internetOutageEmailEnabled: boolean
  internetOutageMinutes: number
  notifyEmailEnabled: boolean
  notifyPhoneEnabled: boolean
  notifyEmailOverride: string
  notifyPhoneTarget: string
  poolLowWaterEmailEnabled: boolean
  poolLowWaterInches: number
  pondLowWaterEmailEnabled: boolean
  pondLowWaterInches: number
  cisternLowWaterEmailEnabled: boolean
  cisternLowWaterPercent: number
  poolPumpAutoOnEnabled: boolean
  poolPumpAutoOnMinutes: number
  bathroomFanAutoOffEnabled: boolean
  bathroomFanAutoOffMinutes: number
  bathroomFanSlots: BathroomFanSlots
  pondFillAutoEnabled: boolean
  pondFillLowInches: number
  pondFillFullInches: number
  doorbellEmailEnabled: boolean
  doorbellIconMinutes: number
  /** Play a dashboard (browser) sound when the gate doorbell rings. */
  doorbellAudioEnabled: boolean
  /** Built-in dashboard sound id for the gate doorbell. */
  doorbellAudio: DashboardSoundId
  /** Master enable for driveway alarm automation. */
  drivewayAlarmEnabled: boolean
  drivewayAlarmTrigger: DrivewayAlarmTriggerState
  drivewayAlarmResetSeconds: number
  /** Conditions that must pass (And/Or) before trigger actions run. */
  drivewayAlarmConditions: DrivewayAlarmConditionRow[]
  /** Actions when the alarm triggers (sensor or manual icon click). */
  drivewayAlarmActions: DashboardActionSelection[]
  /**
   * When true, icon-reset restores entities affected by trigger actions to their
   * pre-trigger state (including dimmable light levels).
   */
  drivewayAlarmRestore: boolean
  /** Actions when the icon reset timer elapses (or manual reset click). */
  drivewayAlarmResetActions: DashboardActionSelection[]
  drivewayAlarmEmailEnabled: boolean
  /** Play a dashboard (browser) sound on every matching sensor edge. */
  drivewayAlarmAudioEnabled: boolean
  /** Built-in dashboard sound id to play when audio is enabled. */
  drivewayAlarmAudio: DashboardSoundId
  /** Custom buttons on the Outside widget (name + action list). */
  outsideButtons: OutsideCustomButton[]
  reminders: DashboardReminder[]
  /** Ticker symbols for the home-page Stocks strip (Yahoo Finance format). */
  stockSymbols: string[]
  /** Calculated ticker values shown after the stocks, e.g. `9*TECL + 3*IBIT`. */
  stockFormulas: StockFormula[]
}

export type StockFormula = { title: string; formula: string }

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  poolPumpOffEmailEnabled: true,
  deviceCommFailureEmailEnabled: false,
  deviceCommFailureMinutes: DEFAULT_DEVICE_COMM_FAILURE_MINUTES,
  deviceCommNotifyEnabled: {},
  commandFailedEmailEnabled: false,
  internetOutageEmailEnabled: true,
  internetOutageMinutes: DEFAULT_INTERNET_OUTAGE_MINUTES,
  notifyEmailEnabled: true,
  notifyPhoneEnabled: false,
  notifyEmailOverride: '',
  notifyPhoneTarget: DEFAULT_PHONE_NOTIFY_ENTITY,
  poolLowWaterEmailEnabled: false,
  poolLowWaterInches: DEFAULT_POOL_LOW_WATER_INCHES,
  pondLowWaterEmailEnabled: false,
  pondLowWaterInches: DEFAULT_POND_LOW_WATER_INCHES,
  cisternLowWaterEmailEnabled: false,
  cisternLowWaterPercent: DEFAULT_CISTERN_LOW_WATER_PERCENT,
  poolPumpAutoOnEnabled: false,
  poolPumpAutoOnMinutes: DEFAULT_POOL_PUMP_AUTO_ON_MINUTES,
  bathroomFanAutoOffEnabled: false,
  bathroomFanAutoOffMinutes: DEFAULT_BATHROOM_FAN_AUTO_OFF_MINUTES,
  bathroomFanSlots: [...EMPTY_BATHROOM_FAN_SLOTS],
  pondFillAutoEnabled: false,
  pondFillLowInches: DEFAULT_POND_FILL_LOW_INCHES,
  pondFillFullInches: DEFAULT_POND_FILL_FULL_INCHES,
  doorbellEmailEnabled: false,
  doorbellIconMinutes: DEFAULT_DOORBELL_ICON_MINUTES,
  doorbellAudioEnabled: false,
  doorbellAudio: DEFAULT_DASHBOARD_SOUND,
  drivewayAlarmEnabled: true,
  drivewayAlarmTrigger: DEFAULT_DRIVEWAY_ALARM_TRIGGER,
  drivewayAlarmResetSeconds: DEFAULT_DRIVEWAY_ALARM_RESET_SECONDS,
  drivewayAlarmConditions: [],
  drivewayAlarmActions: [],
  drivewayAlarmRestore: false,
  drivewayAlarmResetActions: [],
  drivewayAlarmEmailEnabled: false,
  drivewayAlarmAudioEnabled: false,
  drivewayAlarmAudio: DEFAULT_DASHBOARD_SOUND,
  outsideButtons: [],
  reminders: DEFAULT_REMINDERS.map((reminder) => ({ ...reminder })),
  stockSymbols: [],
  stockFormulas: [],
}

export const MAX_STOCK_FORMULAS = 10

export function normalizeStockFormulas(value: unknown): StockFormula[] {
  if (!Array.isArray(value)) return []
  const out: StockFormula[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const title = String((item as { title?: unknown }).title ?? '').trim().slice(0, 24)
    const formula = String((item as { formula?: unknown }).formula ?? '').trim().slice(0, 300)
    if (!title || !formula) continue
    out.push({ title, formula })
    if (out.length >= MAX_STOCK_FORMULAS) break
  }
  return out
}

export const MAX_STOCK_SYMBOLS = 20

export function normalizeStockSymbols(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[\s,;]+/)
  const out: string[] = []
  for (const item of raw) {
    const symbol = String(item ?? '')
      .trim()
      .toUpperCase()
    if (!symbol || !/^[A-Z0-9.^=-]{1,15}$/.test(symbol) || out.includes(symbol)) continue
    out.push(symbol)
    if (out.length >= MAX_STOCK_SYMBOLS) break
  }
  return out
}

export type DashboardSettingsPatch = Partial<DashboardSettings>

function clampMinutes(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(1440, Math.round(n)))
}

function clampPercent(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

function clampInches(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(-50, Math.min(50, Math.round(n * 10) / 10))
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'on' || value === 'true' || value === 1 || value === '1') return true
  if (value === 'off' || value === 'false' || value === 0 || value === '0') return false
  return fallback
}

function normalizePhoneTarget(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return DEFAULT_PHONE_NOTIFY_ENTITY
  if (raw.startsWith('notify.')) return raw
  return `notify.${raw.replace(/^notify\./, '')}`
}

function normalizeDeviceCommNotifyEnabled(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, boolean> = {}
  for (const [key, enabled] of Object.entries(value as Record<string, unknown>)) {
    const id = String(key ?? '').trim()
    if (!id) continue
    if (typeof enabled === 'boolean') out[id] = enabled
  }
  return out
}

export function isDeviceCommNotifyEnabled(
  map: Record<string, boolean> | null | undefined,
  key: string,
): boolean {
  if (!map) return true
  return map[key] !== false
}

export function normalizeDashboardSettings(
  raw: Partial<DashboardSettings> | null | undefined,
): DashboardSettings {
  const base = { ...DEFAULT_DASHBOARD_SETTINGS, ...(raw ?? {}) }
  return {
    poolPumpOffEmailEnabled: asBool(
      base.poolPumpOffEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.poolPumpOffEmailEnabled,
    ),
    deviceCommFailureEmailEnabled: asBool(
      base.deviceCommFailureEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.deviceCommFailureEmailEnabled,
    ),
    deviceCommFailureMinutes: clampMinutes(
      base.deviceCommFailureMinutes,
      DEFAULT_DASHBOARD_SETTINGS.deviceCommFailureMinutes,
    ),
    deviceCommNotifyEnabled: normalizeDeviceCommNotifyEnabled(base.deviceCommNotifyEnabled),
    commandFailedEmailEnabled: asBool(
      base.commandFailedEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.commandFailedEmailEnabled,
    ),
    internetOutageEmailEnabled: asBool(
      base.internetOutageEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.internetOutageEmailEnabled,
    ),
    internetOutageMinutes: clampMinutes(
      base.internetOutageMinutes,
      DEFAULT_DASHBOARD_SETTINGS.internetOutageMinutes,
    ),
    notifyEmailEnabled: asBool(
      base.notifyEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.notifyEmailEnabled,
    ),
    notifyPhoneEnabled: asBool(
      base.notifyPhoneEnabled,
      DEFAULT_DASHBOARD_SETTINGS.notifyPhoneEnabled,
    ),
    notifyEmailOverride: String(base.notifyEmailOverride ?? '').trim(),
    notifyPhoneTarget: normalizePhoneTarget(base.notifyPhoneTarget),
    poolLowWaterEmailEnabled: asBool(
      base.poolLowWaterEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.poolLowWaterEmailEnabled,
    ),
    poolLowWaterInches: clampInches(
      base.poolLowWaterInches,
      DEFAULT_DASHBOARD_SETTINGS.poolLowWaterInches,
    ),
    pondLowWaterEmailEnabled: asBool(
      base.pondLowWaterEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.pondLowWaterEmailEnabled,
    ),
    pondLowWaterInches: clampInches(
      base.pondLowWaterInches,
      DEFAULT_DASHBOARD_SETTINGS.pondLowWaterInches,
    ),
    cisternLowWaterEmailEnabled: asBool(
      base.cisternLowWaterEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.cisternLowWaterEmailEnabled,
    ),
    cisternLowWaterPercent: clampPercent(
      base.cisternLowWaterPercent,
      DEFAULT_DASHBOARD_SETTINGS.cisternLowWaterPercent,
    ),
    poolPumpAutoOnEnabled: asBool(
      base.poolPumpAutoOnEnabled,
      DEFAULT_DASHBOARD_SETTINGS.poolPumpAutoOnEnabled,
    ),
    poolPumpAutoOnMinutes: clampMinutes(
      base.poolPumpAutoOnMinutes,
      DEFAULT_DASHBOARD_SETTINGS.poolPumpAutoOnMinutes,
    ),
    bathroomFanAutoOffEnabled: asBool(
      base.bathroomFanAutoOffEnabled,
      DEFAULT_DASHBOARD_SETTINGS.bathroomFanAutoOffEnabled,
    ),
    bathroomFanAutoOffMinutes: clampMinutes(
      base.bathroomFanAutoOffMinutes,
      DEFAULT_DASHBOARD_SETTINGS.bathroomFanAutoOffMinutes,
    ),
    bathroomFanSlots: normalizeBathroomFanSlots(base.bathroomFanSlots),
    pondFillAutoEnabled: asBool(
      base.pondFillAutoEnabled,
      DEFAULT_DASHBOARD_SETTINGS.pondFillAutoEnabled,
    ),
    pondFillLowInches: clampInches(
      base.pondFillLowInches,
      DEFAULT_DASHBOARD_SETTINGS.pondFillLowInches,
    ),
    pondFillFullInches: clampInches(
      base.pondFillFullInches,
      DEFAULT_DASHBOARD_SETTINGS.pondFillFullInches,
    ),
    doorbellEmailEnabled: asBool(
      base.doorbellEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.doorbellEmailEnabled,
    ),
    doorbellIconMinutes: clampMinutes(
      base.doorbellIconMinutes,
      DEFAULT_DASHBOARD_SETTINGS.doorbellIconMinutes,
    ),
    doorbellAudioEnabled: asBool(
      base.doorbellAudioEnabled,
      DEFAULT_DASHBOARD_SETTINGS.doorbellAudioEnabled,
    ),
    doorbellAudio: normalizeDashboardSoundId(base.doorbellAudio),
    drivewayAlarmEnabled: asBool(
      base.drivewayAlarmEnabled,
      DEFAULT_DASHBOARD_SETTINGS.drivewayAlarmEnabled,
    ),
    drivewayAlarmTrigger: normalizeDrivewayAlarmTrigger(base.drivewayAlarmTrigger),
    drivewayAlarmResetSeconds: clampDrivewayAlarmResetSeconds(
      base.drivewayAlarmResetSeconds,
      DEFAULT_DASHBOARD_SETTINGS.drivewayAlarmResetSeconds,
    ),
    drivewayAlarmConditions: normalizeDrivewayAlarmConditionRows(base.drivewayAlarmConditions),
    drivewayAlarmActions: normalizeDashboardActionList(
      base.drivewayAlarmActions ??
        (base as { drivewayAlarmAction?: unknown }).drivewayAlarmAction,
    ),
    drivewayAlarmRestore: asBool(
      base.drivewayAlarmRestore,
      DEFAULT_DASHBOARD_SETTINGS.drivewayAlarmRestore,
    ),
    drivewayAlarmResetActions: normalizeDashboardActionList(base.drivewayAlarmResetActions),
    drivewayAlarmEmailEnabled: asBool(
      base.drivewayAlarmEmailEnabled,
      DEFAULT_DASHBOARD_SETTINGS.drivewayAlarmEmailEnabled,
    ),
    drivewayAlarmAudioEnabled: asBool(
      base.drivewayAlarmAudioEnabled,
      DEFAULT_DASHBOARD_SETTINGS.drivewayAlarmAudioEnabled,
    ),
    drivewayAlarmAudio: normalizeDashboardSoundId(base.drivewayAlarmAudio),
    outsideButtons: normalizeOutsideCustomButtons(base.outsideButtons),
    reminders: normalizeReminders(base.reminders),
    stockSymbols: normalizeStockSymbols(base.stockSymbols),
    stockFormulas: normalizeStockFormulas(base.stockFormulas),
  }
}

function stateBool(states: HaState[], entityId: string): boolean | null {
  const state = states.find((s) => s.entity_id === entityId)
  if (!state || state.state === 'unknown' || state.state === 'unavailable') return null
  return state.state === 'on'
}

function stateNumber(states: HaState[], entityId: string): number | null {
  const state = states.find((s) => s.entity_id === entityId)
  if (!state || state.state === 'unknown' || state.state === 'unavailable') return null
  const value = Number(state.state)
  return Number.isFinite(value) ? value : null
}

function stateText(states: HaState[], entityId: string): string | null {
  const state = states.find((s) => s.entity_id === entityId)
  if (!state || state.state === 'unknown' || state.state === 'unavailable') return null
  return state.state
}

/** Merge HA helper entities over a JSON baseline (helpers win when present). */
export function dashboardSettingsFromHaStates(
  states: HaState[],
  baseline: DashboardSettings = DEFAULT_DASHBOARD_SETTINGS,
): DashboardSettings {
  const next = { ...baseline }

  const poolEmail = stateBool(states, POOL_PUMP_OFF_EMAIL_ENABLED_ENTITY)
  if (poolEmail != null) next.poolPumpOffEmailEnabled = poolEmail

  const deviceComm = stateBool(states, DEVICE_COMM_FAILURE_EMAIL_ENABLED_ENTITY)
  if (deviceComm != null) next.deviceCommFailureEmailEnabled = deviceComm

  const deviceMinutes = stateNumber(states, DEVICE_COMM_FAILURE_MINUTES_ENTITY)
  if (deviceMinutes != null) next.deviceCommFailureMinutes = clampMinutes(deviceMinutes, next.deviceCommFailureMinutes)

  const commandFailed = stateBool(states, COMMAND_FAILED_EMAIL_ENABLED_ENTITY)
  if (commandFailed != null) next.commandFailedEmailEnabled = commandFailed

  const internetOutage = stateBool(states, INTERNET_OUTAGE_EMAIL_ENABLED_ENTITY)
  if (internetOutage != null) next.internetOutageEmailEnabled = internetOutage
  const internetMinutes = stateNumber(states, INTERNET_OUTAGE_MINUTES_ENTITY)
  if (internetMinutes != null) {
    next.internetOutageMinutes = clampMinutes(internetMinutes, next.internetOutageMinutes)
  }

  const emailChannel = stateBool(states, DASHBOARD_NOTIFY_EMAIL_ENABLED_ENTITY)
  if (emailChannel != null) next.notifyEmailEnabled = emailChannel
  const phoneChannel = stateBool(states, DASHBOARD_NOTIFY_PHONE_ENABLED_ENTITY)
  if (phoneChannel != null) next.notifyPhoneEnabled = phoneChannel

  const email = stateText(states, DASHBOARD_NOTIFY_EMAIL_ENTITY)
  if (email != null) next.notifyEmailOverride = email.trim()
  const phone = stateText(states, DASHBOARD_NOTIFY_PHONE_ENTITY)
  if (phone != null) next.notifyPhoneTarget = phone.trim()

  const poolLowEn = stateBool(states, POOL_LOW_WATER_EMAIL_ENABLED_ENTITY)
  if (poolLowEn != null) next.poolLowWaterEmailEnabled = poolLowEn
  const poolLowIn = stateNumber(states, POOL_LOW_WATER_INCHES_ENTITY)
  if (poolLowIn != null) next.poolLowWaterInches = clampInches(poolLowIn, next.poolLowWaterInches)

  const pondLowEn = stateBool(states, POND_LOW_WATER_EMAIL_ENABLED_ENTITY)
  if (pondLowEn != null) next.pondLowWaterEmailEnabled = pondLowEn
  const pondLowIn = stateNumber(states, POND_LOW_WATER_INCHES_ENTITY)
  if (pondLowIn != null) next.pondLowWaterInches = clampInches(pondLowIn, next.pondLowWaterInches)

  const cisternLowEn = stateBool(states, CISTERN_LOW_WATER_EMAIL_ENABLED_ENTITY)
  if (cisternLowEn != null) next.cisternLowWaterEmailEnabled = cisternLowEn
  const cisternLowPct = stateNumber(states, CISTERN_LOW_WATER_PERCENT_ENTITY)
  if (cisternLowPct != null) {
    next.cisternLowWaterPercent = clampPercent(cisternLowPct, next.cisternLowWaterPercent)
  }

  const poolAuto = stateBool(states, POOL_PUMP_AUTO_ON_ENABLED_ENTITY)
  if (poolAuto != null) next.poolPumpAutoOnEnabled = poolAuto

  const poolMinutes = stateNumber(states, POOL_PUMP_AUTO_ON_MINUTES_ENTITY)
  if (poolMinutes != null) next.poolPumpAutoOnMinutes = clampMinutes(poolMinutes, next.poolPumpAutoOnMinutes)

  const bathFanEn = stateBool(states, BATHROOM_FAN_AUTO_OFF_ENABLED_ENTITY)
  if (bathFanEn != null) next.bathroomFanAutoOffEnabled = bathFanEn

  const bathFanMin = stateNumber(states, BATHROOM_FAN_AUTO_OFF_MINUTES_ENTITY)
  if (bathFanMin != null) {
    next.bathroomFanAutoOffMinutes = clampMinutes(bathFanMin, next.bathroomFanAutoOffMinutes)
  }

  const pondFillEn = stateBool(states, POND_FILL_AUTO_ENABLED_ENTITY)
  if (pondFillEn != null) next.pondFillAutoEnabled = pondFillEn
  const pondFillLow = stateNumber(states, POND_FILL_LOW_INCHES_ENTITY)
  if (pondFillLow != null) next.pondFillLowInches = clampInches(pondFillLow, next.pondFillLowInches)
  const pondFillFull = stateNumber(states, POND_FILL_FULL_INCHES_ENTITY)
  if (pondFillFull != null) {
    next.pondFillFullInches = clampInches(pondFillFull, next.pondFillFullInches)
  }

  const doorbellEmail = stateBool(states, DOORBELL_EMAIL_ENABLED_ENTITY)
  if (doorbellEmail != null) next.doorbellEmailEnabled = doorbellEmail
  const doorbellMinutes = stateNumber(states, DOORBELL_ICON_MINUTES_ENTITY)
  if (doorbellMinutes != null) {
    next.doorbellIconMinutes = clampMinutes(doorbellMinutes, next.doorbellIconMinutes)
  }

  next.drivewayAlarmTrigger = drivewayAlarmTriggerFromStates(states, next.drivewayAlarmTrigger)
  next.drivewayAlarmResetSeconds = drivewayAlarmResetSecondsFromStates(
    states,
    next.drivewayAlarmResetSeconds,
  )
  const drivewayAlarmEnabled = stateBool(states, DRIVEWAY_ALARM_ENABLED_ENTITY)
  if (drivewayAlarmEnabled != null) next.drivewayAlarmEnabled = drivewayAlarmEnabled
  const drivewayAlarmEmail = stateBool(states, DRIVEWAY_ALARM_EMAIL_ENABLED_ENTITY)
  if (drivewayAlarmEmail != null) next.drivewayAlarmEmailEnabled = drivewayAlarmEmail

  next.reminders = remindersFromHaStates(states, next.reminders)

  return normalizeDashboardSettings(next)
}

export function missingDashboardSettingHelpers(states: HaState[]): string[] {
  const required = [
    POOL_PUMP_OFF_EMAIL_ENABLED_ENTITY,
    DEVICE_COMM_FAILURE_EMAIL_ENABLED_ENTITY,
    DEVICE_COMM_FAILURE_MINUTES_ENTITY,
    COMMAND_FAILED_EMAIL_ENABLED_ENTITY,
    INTERNET_OUTAGE_EMAIL_ENABLED_ENTITY,
    INTERNET_OUTAGE_MINUTES_ENTITY,
    DASHBOARD_NOTIFY_EMAIL_ENABLED_ENTITY,
    DASHBOARD_NOTIFY_PHONE_ENABLED_ENTITY,
    DASHBOARD_NOTIFY_EMAIL_ENTITY,
    DASHBOARD_NOTIFY_PHONE_ENTITY,
    POOL_LOW_WATER_EMAIL_ENABLED_ENTITY,
    POOL_LOW_WATER_INCHES_ENTITY,
    POND_LOW_WATER_EMAIL_ENABLED_ENTITY,
    POND_LOW_WATER_INCHES_ENTITY,
    CISTERN_LOW_WATER_EMAIL_ENABLED_ENTITY,
    CISTERN_LOW_WATER_PERCENT_ENTITY,
    POOL_PUMP_AUTO_ON_ENABLED_ENTITY,
    POOL_PUMP_AUTO_ON_MINUTES_ENTITY,
    BATHROOM_FAN_AUTO_OFF_ENABLED_ENTITY,
    BATHROOM_FAN_AUTO_OFF_MINUTES_ENTITY,
    POND_FILL_AUTO_ENABLED_ENTITY,
    POND_FILL_LOW_INCHES_ENTITY,
    POND_FILL_FULL_INCHES_ENTITY,
    DOORBELL_EMAIL_ENABLED_ENTITY,
    DOORBELL_ICON_MINUTES_ENTITY,
    DRIVEWAY_ALARM_TRIGGER_ENTITY,
    DRIVEWAY_ALARM_RESET_SECONDS_ENTITY,
    DRIVEWAY_ALARM_ENABLED_ENTITY,
    DRIVEWAY_ALARM_EMAIL_ENABLED_ENTITY,
    REMINDER_ENTITIES[1].enabled,
    REMINDER_ENTITIES[1].reset,
    REMINDER_ENTITIES[1].message,
    REMINDER_ENTITIES[1].active,
    REMINDER_ENTITIES[2].enabled,
    REMINDER_ENTITIES[2].reset,
    REMINDER_ENTITIES[2].message,
    REMINDER_ENTITIES[2].active,
  ]
  return required.filter((entityId) => {
    const state = states.find((s) => s.entity_id === entityId)
    return !state || state.state === 'unavailable'
  })
}

export async function fetchDashboardSettings(): Promise<DashboardSettings | null> {
  const attempt = async (): Promise<DashboardSettings | null> => {
    try {
      const res = await fetch(`${DASHBOARD_SETTINGS_URL}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return null
      const parsed = (await res.json()) as Partial<DashboardSettings>
      return normalizeDashboardSettings(parsed)
    } catch {
      return null
    }
  }
  // After HA restart, www can lag briefly — retry before treating as missing.
  const first = await attempt()
  if (first) return first
  await new Promise((resolve) => setTimeout(resolve, 400))
  return attempt()
}

export function encodeDashboardSettingsPatch(patch: DashboardSettingsPatch): string {
  const json = JSON.stringify(patch)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Compare prefs ignoring reminder `active` (runtime state owned by HA automations). */
export function dashboardSettingsConfigEqual(
  a: DashboardSettings,
  b: DashboardSettings,
): boolean {
  const strip = (settings: DashboardSettings) => ({
    ...settings,
    reminders: settings.reminders.map(({ id, enabled, resetTime, message }) => ({
      id,
      enabled,
      resetTime,
      message,
    })),
  })
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
}

function bathroomFanSlotsAreEmpty(slots: BathroomFanSlots): boolean {
  return slots.every((slot) => !String(slot ?? '').trim())
}

/**
 * Fields that live only in dashboard-settings.json (not HA helpers).
 * Sync must never let helper-only merges wipe these.
 */
export function takeJsonOnlyDashboardSettings(
  from: DashboardSettings,
): Pick<
  DashboardSettings,
  | 'deviceCommNotifyEnabled'
  | 'bathroomFanSlots'
  | 'drivewayAlarmConditions'
  | 'drivewayAlarmActions'
  | 'drivewayAlarmRestore'
  | 'drivewayAlarmResetActions'
  | 'drivewayAlarmAudioEnabled'
  | 'drivewayAlarmAudio'
  | 'doorbellAudioEnabled'
  | 'doorbellAudio'
  | 'outsideButtons'
  | 'stockSymbols'
  | 'stockFormulas'
> {
  return {
    deviceCommNotifyEnabled: from.deviceCommNotifyEnabled,
    bathroomFanSlots: from.bathroomFanSlots,
    drivewayAlarmConditions: from.drivewayAlarmConditions,
    drivewayAlarmActions: from.drivewayAlarmActions,
    drivewayAlarmRestore: from.drivewayAlarmRestore,
    drivewayAlarmResetActions: from.drivewayAlarmResetActions,
    drivewayAlarmAudioEnabled: from.drivewayAlarmAudioEnabled,
    drivewayAlarmAudio: from.drivewayAlarmAudio,
    doorbellAudioEnabled: from.doorbellAudioEnabled,
    doorbellAudio: from.doorbellAudio,
    outsideButtons: from.outsideButtons,
    stockSymbols: from.stockSymbols,
    stockFormulas: from.stockFormulas,
  }
}

/** Prefer durable JSON-only values when a sync-produced object would clear them. */
export function preserveJsonOnlyDashboardSettings(
  next: DashboardSettings,
  durable: DashboardSettings | null | undefined,
): DashboardSettings {
  if (!durable) return next
  return normalizeDashboardSettings({
    ...next,
    deviceCommNotifyEnabled:
      Object.keys(next.deviceCommNotifyEnabled).length === 0 &&
      Object.keys(durable.deviceCommNotifyEnabled).length > 0
        ? durable.deviceCommNotifyEnabled
        : next.deviceCommNotifyEnabled,
    bathroomFanSlots:
      bathroomFanSlotsAreEmpty(next.bathroomFanSlots) &&
      !bathroomFanSlotsAreEmpty(durable.bathroomFanSlots)
        ? durable.bathroomFanSlots
        : next.bathroomFanSlots,
    drivewayAlarmConditions:
      next.drivewayAlarmConditions.length === 0 && durable.drivewayAlarmConditions.length > 0
        ? durable.drivewayAlarmConditions
        : next.drivewayAlarmConditions,
    drivewayAlarmActions:
      next.drivewayAlarmActions.length === 0 && durable.drivewayAlarmActions.length > 0
        ? durable.drivewayAlarmActions
        : next.drivewayAlarmActions,
    drivewayAlarmRestore: next.drivewayAlarmRestore,
    drivewayAlarmResetActions:
      next.drivewayAlarmResetActions.length === 0 && durable.drivewayAlarmResetActions.length > 0
        ? durable.drivewayAlarmResetActions
        : next.drivewayAlarmResetActions,
    drivewayAlarmAudioEnabled: next.drivewayAlarmAudioEnabled,
    drivewayAlarmAudio: next.drivewayAlarmAudio || durable.drivewayAlarmAudio,
    doorbellAudioEnabled: next.doorbellAudioEnabled,
    doorbellAudio: next.doorbellAudio || durable.doorbellAudio,
    outsideButtons:
      next.outsideButtons.length === 0 && durable.outsideButtons.length > 0
        ? durable.outsideButtons
        : next.outsideButtons,
  })
}

/**
 * When a helper still holds its YAML/`initial` default but durable JSON has a
 * custom value, restore that field from JSON (common after helper recreate/restart).
 */
export function helperFieldsToRestoreFromJson(
  file: DashboardSettings,
  ha: DashboardSettings,
): DashboardSettingsPatch {
  const patch: DashboardSettingsPatch = {}
  const d = DEFAULT_DASHBOARD_SETTINGS

  const maybe = <K extends keyof DashboardSettings>(
    key: K,
    stock: DashboardSettings[K],
  ) => {
    if (ha[key] === stock && file[key] !== stock) {
      ;(patch as Record<string, unknown>)[key as string] = file[key]
    }
  }

  maybe('poolPumpOffEmailEnabled', d.poolPumpOffEmailEnabled)
  maybe('deviceCommFailureEmailEnabled', d.deviceCommFailureEmailEnabled)
  maybe('deviceCommFailureMinutes', d.deviceCommFailureMinutes)
  maybe('commandFailedEmailEnabled', d.commandFailedEmailEnabled)
  maybe('internetOutageEmailEnabled', d.internetOutageEmailEnabled)
  maybe('internetOutageMinutes', d.internetOutageMinutes)
  maybe('notifyEmailEnabled', d.notifyEmailEnabled)
  maybe('notifyPhoneEnabled', d.notifyPhoneEnabled)
  maybe('notifyEmailOverride', d.notifyEmailOverride)
  maybe('notifyPhoneTarget', d.notifyPhoneTarget)
  maybe('poolLowWaterEmailEnabled', d.poolLowWaterEmailEnabled)
  maybe('poolLowWaterInches', d.poolLowWaterInches)
  maybe('pondLowWaterEmailEnabled', d.pondLowWaterEmailEnabled)
  maybe('pondLowWaterInches', d.pondLowWaterInches)
  maybe('cisternLowWaterEmailEnabled', d.cisternLowWaterEmailEnabled)
  maybe('cisternLowWaterPercent', d.cisternLowWaterPercent)
  maybe('poolPumpAutoOnEnabled', d.poolPumpAutoOnEnabled)
  maybe('poolPumpAutoOnMinutes', d.poolPumpAutoOnMinutes)
  maybe('bathroomFanAutoOffEnabled', d.bathroomFanAutoOffEnabled)
  maybe('bathroomFanAutoOffMinutes', d.bathroomFanAutoOffMinutes)
  maybe('pondFillAutoEnabled', d.pondFillAutoEnabled)
  maybe('pondFillLowInches', d.pondFillLowInches)
  maybe('pondFillFullInches', d.pondFillFullInches)
  maybe('doorbellEmailEnabled', d.doorbellEmailEnabled)
  maybe('doorbellIconMinutes', d.doorbellIconMinutes)
  maybe('drivewayAlarmEnabled', d.drivewayAlarmEnabled)
  maybe('drivewayAlarmTrigger', d.drivewayAlarmTrigger)
  maybe('drivewayAlarmResetSeconds', d.drivewayAlarmResetSeconds)
  maybe('drivewayAlarmEmailEnabled', d.drivewayAlarmEmailEnabled)

  return patch
}

/** Write settings to dashboard-settings.json only — never touch HA helpers. */
export async function persistDashboardSettingsJsonOnly(
  client: Pick<DashboardSettingsWriter, 'persistDashboardSettings'>,
  settings: DashboardSettings,
): Promise<void> {
  await client.persistDashboardSettings(
    encodeDashboardSettingsPatch(normalizeDashboardSettings(settings)),
  )
}

export type DashboardSettingsWriter = {
  setInputBoolean: (entityId: string, on: boolean) => Promise<void>
  setNumber: (entityId: string, value: number) => Promise<void>
  setInputText: (entityId: string, value: string) => Promise<void>
  setInputDatetimeTime: (entityId: string, time: string) => Promise<void>
  setSelect: (entityId: string, option: string) => Promise<void>
  persistDashboardSettings: (patchB64: string) => Promise<void>
}

/** Write prefs to HA helpers (best-effort) and always to dashboard-settings.json. */
export async function persistDashboardSettingsPatch(
  client: DashboardSettingsWriter,
  patch: DashboardSettingsPatch,
): Promise<void> {
  const normalized = normalizeDashboardSettings({
    ...DEFAULT_DASHBOARD_SETTINGS,
    ...patch,
  })
  const writes: Promise<void>[] = []

  if (patch.poolPumpOffEmailEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(POOL_PUMP_OFF_EMAIL_ENABLED_ENTITY, normalized.poolPumpOffEmailEnabled),
    )
  }
  if (patch.deviceCommFailureEmailEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(
        DEVICE_COMM_FAILURE_EMAIL_ENABLED_ENTITY,
        normalized.deviceCommFailureEmailEnabled,
      ),
    )
  }
  if (patch.deviceCommFailureMinutes !== undefined) {
    writes.push(
      client.setNumber(DEVICE_COMM_FAILURE_MINUTES_ENTITY, normalized.deviceCommFailureMinutes),
    )
  }
  if (patch.commandFailedEmailEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(COMMAND_FAILED_EMAIL_ENABLED_ENTITY, normalized.commandFailedEmailEnabled),
    )
  }
  if (patch.internetOutageEmailEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(
        INTERNET_OUTAGE_EMAIL_ENABLED_ENTITY,
        normalized.internetOutageEmailEnabled,
      ),
    )
  }
  if (patch.internetOutageMinutes !== undefined) {
    writes.push(
      client.setNumber(INTERNET_OUTAGE_MINUTES_ENTITY, normalized.internetOutageMinutes),
    )
  }
  if (patch.notifyEmailEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(DASHBOARD_NOTIFY_EMAIL_ENABLED_ENTITY, normalized.notifyEmailEnabled),
    )
  }
  if (patch.notifyPhoneEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(DASHBOARD_NOTIFY_PHONE_ENABLED_ENTITY, normalized.notifyPhoneEnabled),
    )
  }
  if (patch.notifyEmailOverride !== undefined) {
    writes.push(client.setInputText(DASHBOARD_NOTIFY_EMAIL_ENTITY, normalized.notifyEmailOverride))
  }
  if (patch.notifyPhoneTarget !== undefined) {
    writes.push(client.setInputText(DASHBOARD_NOTIFY_PHONE_ENTITY, normalized.notifyPhoneTarget))
  }
  if (patch.poolLowWaterEmailEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(POOL_LOW_WATER_EMAIL_ENABLED_ENTITY, normalized.poolLowWaterEmailEnabled),
    )
  }
  if (patch.poolLowWaterInches !== undefined) {
    writes.push(client.setNumber(POOL_LOW_WATER_INCHES_ENTITY, normalized.poolLowWaterInches))
  }
  if (patch.pondLowWaterEmailEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(POND_LOW_WATER_EMAIL_ENABLED_ENTITY, normalized.pondLowWaterEmailEnabled),
    )
  }
  if (patch.pondLowWaterInches !== undefined) {
    writes.push(client.setNumber(POND_LOW_WATER_INCHES_ENTITY, normalized.pondLowWaterInches))
  }
  if (patch.cisternLowWaterEmailEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(
        CISTERN_LOW_WATER_EMAIL_ENABLED_ENTITY,
        normalized.cisternLowWaterEmailEnabled,
      ),
    )
  }
  if (patch.cisternLowWaterPercent !== undefined) {
    writes.push(client.setNumber(CISTERN_LOW_WATER_PERCENT_ENTITY, normalized.cisternLowWaterPercent))
  }
  if (patch.poolPumpAutoOnEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(POOL_PUMP_AUTO_ON_ENABLED_ENTITY, normalized.poolPumpAutoOnEnabled),
    )
  }
  if (patch.poolPumpAutoOnMinutes !== undefined) {
    writes.push(client.setNumber(POOL_PUMP_AUTO_ON_MINUTES_ENTITY, normalized.poolPumpAutoOnMinutes))
  }
  if (patch.bathroomFanAutoOffEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(
        BATHROOM_FAN_AUTO_OFF_ENABLED_ENTITY,
        normalized.bathroomFanAutoOffEnabled,
      ),
    )
  }
  if (patch.bathroomFanAutoOffMinutes !== undefined) {
    writes.push(
      client.setNumber(BATHROOM_FAN_AUTO_OFF_MINUTES_ENTITY, normalized.bathroomFanAutoOffMinutes),
    )
  }
  if (patch.pondFillAutoEnabled !== undefined) {
    writes.push(client.setInputBoolean(POND_FILL_AUTO_ENABLED_ENTITY, normalized.pondFillAutoEnabled))
  }
  if (patch.pondFillLowInches !== undefined) {
    writes.push(client.setNumber(POND_FILL_LOW_INCHES_ENTITY, normalized.pondFillLowInches))
  }
  if (patch.pondFillFullInches !== undefined) {
    writes.push(client.setNumber(POND_FILL_FULL_INCHES_ENTITY, normalized.pondFillFullInches))
  }
  if (patch.doorbellEmailEnabled !== undefined) {
    writes.push(client.setInputBoolean(DOORBELL_EMAIL_ENABLED_ENTITY, normalized.doorbellEmailEnabled))
  }
  if (patch.doorbellIconMinutes !== undefined) {
    writes.push(client.setNumber(DOORBELL_ICON_MINUTES_ENTITY, normalized.doorbellIconMinutes))
  }
  if (patch.drivewayAlarmTrigger !== undefined) {
    writes.push(
      client.setSelect(
        DRIVEWAY_ALARM_TRIGGER_ENTITY,
        normalized.drivewayAlarmTrigger === 'off' ? 'Off' : 'On',
      ),
    )
  }
  if (patch.drivewayAlarmResetSeconds !== undefined) {
    writes.push(
      client.setNumber(
        DRIVEWAY_ALARM_RESET_SECONDS_ENTITY,
        normalized.drivewayAlarmResetSeconds,
      ),
    )
  }
  if (patch.drivewayAlarmEmailEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(
        DRIVEWAY_ALARM_EMAIL_ENABLED_ENTITY,
        normalized.drivewayAlarmEmailEnabled,
      ),
    )
  }
  if (patch.drivewayAlarmEnabled !== undefined) {
    writes.push(
      client.setInputBoolean(DRIVEWAY_ALARM_ENABLED_ENTITY, normalized.drivewayAlarmEnabled),
    )
  }
  if (patch.reminders !== undefined) {
    for (const reminder of normalized.reminders) {
      const entities = REMINDER_ENTITIES[reminder.id]
      writes.push(client.setInputBoolean(entities.enabled, reminder.enabled))
      writes.push(client.setInputBoolean(entities.active, reminder.active))
      writes.push(client.setInputText(entities.message, reminder.message))
      writes.push(client.setInputDatetimeTime(entities.reset, reminder.resetTime))
    }
  }

  const helperResults = await Promise.allSettled(writes)
  const helperError = helperResults.find((r) => r.status === 'rejected')
  try {
    await client.persistDashboardSettings(encodeDashboardSettingsPatch(patch))
  } catch (err) {
    if (helperError && helperError.status === 'rejected') {
      throw helperError.reason instanceof Error ? helperError.reason : err
    }
    throw err
  }
  if (helperError && helperError.status === 'rejected') {
    console.warn('Dashboard settings JSON saved; HA helper write failed', helperError.reason)
  }
}

/** Push full settings object into HA helpers (used to restore after helpers are first created). */
export async function pushDashboardSettingsToHelpers(
  client: DashboardSettingsWriter,
  settings: DashboardSettings,
): Promise<void> {
  await Promise.allSettled([
    client.setInputBoolean(POOL_PUMP_OFF_EMAIL_ENABLED_ENTITY, settings.poolPumpOffEmailEnabled),
    client.setInputBoolean(
      DEVICE_COMM_FAILURE_EMAIL_ENABLED_ENTITY,
      settings.deviceCommFailureEmailEnabled,
    ),
    client.setNumber(DEVICE_COMM_FAILURE_MINUTES_ENTITY, settings.deviceCommFailureMinutes),
    client.setInputBoolean(COMMAND_FAILED_EMAIL_ENABLED_ENTITY, settings.commandFailedEmailEnabled),
    client.setInputBoolean(
      INTERNET_OUTAGE_EMAIL_ENABLED_ENTITY,
      settings.internetOutageEmailEnabled,
    ),
    client.setNumber(INTERNET_OUTAGE_MINUTES_ENTITY, settings.internetOutageMinutes),
    client.setInputBoolean(DASHBOARD_NOTIFY_EMAIL_ENABLED_ENTITY, settings.notifyEmailEnabled),
    client.setInputBoolean(DASHBOARD_NOTIFY_PHONE_ENABLED_ENTITY, settings.notifyPhoneEnabled),
    client.setInputText(DASHBOARD_NOTIFY_EMAIL_ENTITY, settings.notifyEmailOverride),
    client.setInputText(DASHBOARD_NOTIFY_PHONE_ENTITY, settings.notifyPhoneTarget),
    client.setInputBoolean(POOL_LOW_WATER_EMAIL_ENABLED_ENTITY, settings.poolLowWaterEmailEnabled),
    client.setNumber(POOL_LOW_WATER_INCHES_ENTITY, settings.poolLowWaterInches),
    client.setInputBoolean(POND_LOW_WATER_EMAIL_ENABLED_ENTITY, settings.pondLowWaterEmailEnabled),
    client.setNumber(POND_LOW_WATER_INCHES_ENTITY, settings.pondLowWaterInches),
    client.setInputBoolean(
      CISTERN_LOW_WATER_EMAIL_ENABLED_ENTITY,
      settings.cisternLowWaterEmailEnabled,
    ),
    client.setNumber(CISTERN_LOW_WATER_PERCENT_ENTITY, settings.cisternLowWaterPercent),
    client.setInputBoolean(POOL_PUMP_AUTO_ON_ENABLED_ENTITY, settings.poolPumpAutoOnEnabled),
    client.setNumber(POOL_PUMP_AUTO_ON_MINUTES_ENTITY, settings.poolPumpAutoOnMinutes),
    client.setInputBoolean(BATHROOM_FAN_AUTO_OFF_ENABLED_ENTITY, settings.bathroomFanAutoOffEnabled),
    client.setNumber(BATHROOM_FAN_AUTO_OFF_MINUTES_ENTITY, settings.bathroomFanAutoOffMinutes),
    client.setInputBoolean(POND_FILL_AUTO_ENABLED_ENTITY, settings.pondFillAutoEnabled),
    client.setNumber(POND_FILL_LOW_INCHES_ENTITY, settings.pondFillLowInches),
    client.setNumber(POND_FILL_FULL_INCHES_ENTITY, settings.pondFillFullInches),
    client.setInputBoolean(DOORBELL_EMAIL_ENABLED_ENTITY, settings.doorbellEmailEnabled),
    client.setNumber(DOORBELL_ICON_MINUTES_ENTITY, settings.doorbellIconMinutes),
    client.setSelect(
      DRIVEWAY_ALARM_TRIGGER_ENTITY,
      settings.drivewayAlarmTrigger === 'off' ? 'Off' : 'On',
    ),
    client.setNumber(DRIVEWAY_ALARM_RESET_SECONDS_ENTITY, settings.drivewayAlarmResetSeconds),
    client.setInputBoolean(DRIVEWAY_ALARM_ENABLED_ENTITY, settings.drivewayAlarmEnabled),
    client.setInputBoolean(DRIVEWAY_ALARM_EMAIL_ENABLED_ENTITY, settings.drivewayAlarmEmailEnabled),
    // Reminder `active` is runtime state (automation / dismiss). Never push it from JSON.
    ...settings.reminders.flatMap((reminder) => {
      const entities = REMINDER_ENTITIES[reminder.id]
      return [
        client.setInputBoolean(entities.enabled, reminder.enabled),
        client.setInputText(entities.message, reminder.message),
        client.setInputDatetimeTime(entities.reset, reminder.resetTime),
      ]
    }),
  ])
}
