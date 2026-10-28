import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isReadOnlyDashboard } from '../dashboardMode'
import { HaClient } from '../ha/client'
import {
  OUTSIDE_LIGHTS_MODE_ENTITY,
  outsideModeFromStates,
  outsideTransformersFromStates,
  type OutsideMode,
  type OutsideTransformer,
  type OutsideControlKey,
} from '../ha/outside'
import {
  formatEnergyKwh,
  formatPower,
  sensorFromState,
  SHED_INVERTER_POWER_ENTITY,
  splitGridImportExport,
  matchAlsoEnergyPvSensors,
  suggestPvSensor,
  toKwh,
  toWatts,
  type HaSensor,
} from '../ha/energy'
import { coverFromState, type HaCover, type HaState } from '../ha/positions'
import {
  pickWeatherEntity,
  weatherFromState,
  weatherSnapshot,
  type HaWeatherForecast,
  type WeatherSnapshot,
} from '../ha/weather'
import {
  calendarSnapshot,
  calendarsFromStates,
  localTwoDayBounds,
  parseCalendarEvents,
  pickCalendarEntity,
  type CalendarSnapshot,
} from '../ha/calendar'
import {
  DEFAULT_REMINDERS,
  normalizeReminders,
  remindersFromHaStates,
  mergeRemindersHaActive,
  remindersConfigNeedsHelperRestore,
  type DashboardReminder,
} from '../ha/reminders'
import { suggestCover } from '../ha/suggest'
import {
  crestronLightsFromStates,
  CRESTRON_POLL_MS,
  UNASSIGNED_ROOM_KEY,
  type CrestronLight,
} from '../ha/lights'
import {
  entitiesCombinedOn,
  entityIsOn,
  PENDING_TOGGLE_POLL_MAX_MS,
  PENDING_TOGGLE_POLL_MS,
  sleep,
} from '../ha/pendingToggle'
import {
  CRESTRON_SCENE_ENTITY_IDS,
  crestronScenesFromStates,
  type CrestronScene,
} from '../ha/scenes'
import { fetchPvCache, type PvCacheSnapshot } from '../ha/pvCache'
import { fetchShadesCache, type ShadesCacheSnapshot } from '../ha/shadesCache'
import {
  DEFAULT_POOL_PUMP_AUTO_ON_MINUTES,
  discoverPoolSamLightEntityIds,
  discoverPoolCircuitSwitchId,
  EMPTY_POOL,
  poolMapCount,
  poolSnapshotFromStates,
  suggestPoolEntityMap,
  type PoolEntityMap,
  type PoolSnapshot,
} from '../ha/pool'
import {
  EMPTY_AC,
  acSnapshotFromStates,
  type AcSnapshot,
} from '../ha/ac'
import {
  EMPTY_IRRIGATION,
  irrigationSnapshotFromStates,
  type IrrigationSnapshot,
} from '../ha/irrigation'
import {
  EMPTY_EGAUGE,
  EGAUGE_LIVE_GRID_ENTITY,
  EGAUGE_POLL_MS,
  egaugeSnapshotFromStates,
  extraReadingsFromStates,
  parseEgaugeRegisters,
  readingsFromRegisters,
  type EgaugeSnapshot,
} from '../ha/egauge'
import { fetchEgaugeLiveCache } from '../ha/egaugeLive'
import { type DeviceCommRow } from '../ha/deviceCommunication'
import {
  applyLiveDeviceCommOverrides,
  deviceCommRowsFromHaStatus,
  fetchDeviceCommStatus,
} from '../ha/deviceCommStatus'
import { startVisibilityInterval } from '../hooks/visibilityInterval'
import {
  EMPTY_CISTERN,
  cisternFromStates,
  type CisternSnapshot,
} from '../ha/cistern'
import {
  CRESTRON_POWER_CYCLE_ENABLED,
  CRESTRON_POWER_CYCLE_MINUTES,
  CRESTRON_POWER_SWITCH,
  DEFAULT_CRESTRON_POWER_CYCLE_MINUTES,
  EMPTY_CRESTRON_POWER,
  crestronPowerFromStates,
  type CrestronPowerSnapshot,
} from '../ha/crestronPower'
import {
  activeIrrigationZone,
  poolHeaterPercent,
  recordAllTrendSamples,
} from '../ha/trends'
import {
  EMPTY_SONOS,
  pickSonosFavorite,
  sonosSnapshotFromStates,
  sonosStopTargets,
  type SonosSnapshot,
} from '../ha/sonos'
import {
  EMPTY_RECEIVER,
  isFamilyRoomSonos,
  RECEIVER_SOURCE_SONOS,
  RECEIVER_SOURCE_TV,
  receiverSnapshotFromStates,
  type ReceiverSnapshot,
} from '../ha/receiver'
import { appendLocalControlLog, clearLocalControlLog, hasRecentControlLogDuplicate } from '../ha/controlLog'
import type { ControlLogKind } from '../ha/controlLog'
import {
  EMPTY_GARAGE,
  MAIN_GARAGE,
  WORKSHOP_GARAGE,
  garageDoorFromStates,
  garageIsOpen,
  type GarageDoorSnapshot,
} from '../ha/garage'
import {
  EMPTY_GATE,
  GATE_CLOSE_PENDING_MS,
  GATE_OPEN_PENDING_MS,
  GATE_RELAY_BUTTON,
  gateFromStates,
  gateIsOpen,
  type GateSnapshot,
} from '../ha/gate'
import {
  EMPTY_HOT_TUB,
  holdHotTubReading,
  hotTubFromStates,
  type HotTubSnapshot,
} from '../ha/hotTub'
import { doorbellActiveUntilMs, doorbellIsRinging, doorbellLastRingMs } from '../ha/doorbell'
import {
  drivewayAlarmActiveUntilMs,
  drivewayAlarmIsActive,
  DRIVEWAY_ALARM_SENSOR,
  drivewayAlarmLastTriggerMs,
  type DrivewayAlarmTriggerState,
} from '../ha/drivewayAlarm'
import { playDashboardSound, normalizeDashboardSoundId } from '../ha/dashboardSounds'
import type { DashboardActionSelection } from '../ha/dashboardActions'
import { runDashboardActionList } from '../ha/dashboardActions'
import type { OutsideCustomButton, OutsideEntitySnapshot } from '../ha/outsideButtons'
import {
  entityIdsAffectedByActions,
  runRestoreSnapshots,
  snapshotEntities,
} from '../ha/outsideButtons'
import type { DrivewayAlarmConditionRow } from '../ha/dashboardConditions'
import {
  EMPTY_HVAC,
  hvacSnapshotFromStates,
  type HvacSnapshot,
} from '../ha/hvac'
import {
  EMPTY_POND,
  DEFAULT_POND_FILL_FULL_INCHES,
  DEFAULT_POND_FILL_LOW_INCHES,
  discoverPondFillEntityId,
  pondFillIsOn,
  POND_FILL_ERROR_ENTITY,
  pondMapCount,
  pondSnapshotFromStates,
  suggestPondEntityMap,
  type PondEntityMap,
  type PondSnapshot,
} from '../ha/pond'
import {
  BALL_FOUNTAIN_FILL_AUTO_ENABLED_ENTITY,
  BALL_FOUNTAIN_FILL_ERROR_ENTITY,
  BALL_FOUNTAIN_FILL_FULL_INCHES_ENTITY,
  BALL_FOUNTAIN_FILL_LOW_INCHES_ENTITY,
  BALL_FOUNTAIN_FILL_VALVE_ENTITY,
  BALL_FOUNTAIN_OFFSET_ENTITY,
  EMPTY_BALL_FOUNTAIN,
  ballFountainFromStates,
  type BallFountainSettings,
  type BallFountainSnapshot,
} from '../ha/ballFountain'
import {
  downloadJson,
  exportHaConfigFile,
  hydrateEnergyEntityMap,
  hydrateHaConfig,
  hydratePondEntityMap,
  hydratePoolEntityMap,
  hydrateShadeEntityMap,
  hydrateCrestronLightRoomMap,
  loadBaseUrl,
  loadEnergyEntityMap,
  loadPondEntityMap,
  loadPoolEntityMap,
  loadShadeEntityMap,
  loadToken,
  mergeEnergyEntityMaps,
  energyMapCount,
  saveBaseUrl,
  saveCrestronLightRoomMap,
  saveEnergyEntityMap,
  savePondEntityMap,
  savePoolEntityMap,
  saveShadeEntityMap,
  saveToken,
  syncCrestronLightRoomMapFromShared,
  syncPoolPondMapsFromShared,
  type EnergyEntityMap,
  type CrestronLightRoomMap,
  type ShadeEntityMap,
} from '../ha/storage'
import { loadShadeScheduleOverrides, setHaEntitySchedules } from './shadeSchedules'
import { sunSnapshotFromStates, type SunSnapshot } from '../ha/sunPosition'
import {
  DEFAULT_CISTERN_LOW_WATER_PERCENT,
  DEFAULT_DEVICE_COMM_FAILURE_MINUTES,
  DEFAULT_INTERNET_OUTAGE_MINUTES,
  DEFAULT_PHONE_NOTIFY_ENTITY,
  DEFAULT_POND_LOW_WATER_INCHES,
  DEFAULT_POOL_LOW_WATER_INCHES,
  POND_WATER_LEVEL_OFFSET_ENTITY,
  POOL_WATER_LEVEL_OFFSET_ENTITY,
} from '../ha/notifications'
import { internetOnlineFromStates } from '../ha/internet'
import {
  DEFAULT_DASHBOARD_SETTINGS,
  dashboardSettingsConfigEqual,
  dashboardSettingsFromHaStates,
  fetchDashboardSettings,
  helperFieldsToRestoreFromJson,
  missingDashboardSettingHelpers,
  normalizeDashboardSettings,
  normalizeStockFormulas,
  normalizeStockSymbols,
  persistDashboardSettingsJsonOnly,
  persistDashboardSettingsPatch,
  preserveJsonOnlyDashboardSettings,
  pushDashboardSettingsToHelpers,
  takeJsonOnlyDashboardSettings,
  type DashboardSettings,
  type StockFormula,
} from '../ha/dashboardSettings'
import {
  BATHROOM_FAN_SLOT_COUNT,
  DEFAULT_BATHROOM_FAN_AUTO_OFF_MINUTES,
  EMPTY_BATHROOM_FAN_SLOTS,
  normalizeBathroomFanSlots,
  type BathroomFanSlots,
} from '../ha/bathroomFans'
import { DEFAULT_ZYNECT_CONFIG } from '../zynect/types'
import { hydrateZynectConfig } from '../zynect/config'
import { loadShadeScheduleMap, schedulesFromScheduleMap, usesSunDefault, getShadeScheduleMap } from './shadeScheduleMap'
import {
  countMatchedHomebridgeShades,
  fetchHomebridgeSchedules,
  homebridgeSchedulesForShades,
  loadHomebridgeScheduleConfig,
} from '../homebridge/schedules'
import {
  analyzeScheduleLoad,
  buildCoverSchedules,
  collectScriptIdsFromConfigs,
  countScheduledCovers,
  coversByAreaIdFromRegistry,
  type HaAutomationConfig,
  type ScheduleDebugInfo,
} from '../ha/schedules'
import type { EntityRegistryEntry } from '../ha/ws'
import type { ShadeScheduleEvent } from './shadeSchedules'
import { INITIAL_SHADES, type FloorId, type Shade } from './types'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type EnergySnapshot = {
  pvOnlyWatts: number | null
  pvOnlyLoadWatts: number | null
  pvOnlyGridWatts: number | null
  pvOnlyLabel: string
  pvOnlyLoadLabel: string
  pvOnlyGridLabel: string
  pvOnlyExcessLabel: string
  pvOnlyMonthLabel: string
  pvOnlyTodayLabel: string
  pvOnlyLifetimeLabel: string
  /** Shed APsystems EZ1 microinverter. */
  /** The inverter power sensor exists in HA (it may still be unavailable). */
  shedInverterMapped: boolean
  /** Null while the inverter is unreachable; 0 only when it reports 0 W. */
  shedInverterWatts: number | null
  shedInverterLabel: string
  shedInverterTodayLabel: string
  shedInverterMonthLabel: string
  shedInverterLifetimeLabel: string
}

type HouseContextValue = {
  shades: Shade[]
  entityMap: ShadeEntityMap
  covers: HaCover[]
  sensors: HaSensor[]
  energyMap: EnergyEntityMap
  energy: EnergySnapshot
  poolMap: PoolEntityMap
  pool: PoolSnapshot
  pondMap: PondEntityMap
  pond: PondSnapshot
  crestronPower: CrestronPowerSnapshot
  setCrestronPower: (on: boolean) => Promise<void>
  setCrestronPowerCycleEnabled: (enabled: boolean) => Promise<void>
  setCrestronPowerCycleMinutes: (minutes: number) => Promise<void>
  /** Clears the pond fill controller's error so automatic fill can run again. */
  clearPondFillError: () => Promise<void>
  ballFountain: BallFountainSnapshot
  setBallFountainFill: (on: boolean) => Promise<void>
  clearBallFountainFillError: () => Promise<void>
  setBallFountainSettings: (patch: Partial<BallFountainSettings>) => Promise<void>
  hvac: HvacSnapshot
  ac: AcSnapshot
  irrigation: IrrigationSnapshot
  audio: SonosSnapshot
  receiver: ReceiverSnapshot
  egauge: EgaugeSnapshot
  cistern: CisternSnapshot
  mainGarage: GarageDoorSnapshot
  workshopGarage: GarageDoorSnapshot
  gate: GateSnapshot
  hotTub: HotTubSnapshot
  /** True for 5 minutes after the DoorBird doorstation button is pressed. */
  doorbellRinging: boolean
  /** True while the driveway-alarm icon should stay red after a trigger. */
  drivewayAlarmActive: boolean
  /** Latest driveway-alarm trigger time (start of the auto-resolve countdown). */
  drivewayAlarmLastTriggerAt: number | null
  drivewayAlarmEnabled: boolean
  setDrivewayAlarmEnabled: (enabled: boolean) => void
  drivewayAlarmTrigger: DrivewayAlarmTriggerState
  setDrivewayAlarmTrigger: (trigger: DrivewayAlarmTriggerState) => void
  drivewayAlarmResetSeconds: number
  setDrivewayAlarmResetSeconds: (seconds: number) => void
  drivewayAlarmConditions: DrivewayAlarmConditionRow[]
  setDrivewayAlarmConditions: (rows: DrivewayAlarmConditionRow[]) => void
  drivewayAlarmActions: DashboardActionSelection[]
  setDrivewayAlarmActions: (actions: DashboardActionSelection[]) => void
  drivewayAlarmRestore: boolean
  setDrivewayAlarmRestore: (enabled: boolean) => void
  drivewayAlarmResetActions: DashboardActionSelection[]
  setDrivewayAlarmResetActions: (actions: DashboardActionSelection[]) => void
  drivewayAlarmAudioEnabled: boolean
  setDrivewayAlarmAudioEnabled: (enabled: boolean) => void
  drivewayAlarmAudio: string
  setDrivewayAlarmAudio: (soundId: string) => void
  /** Manual icon click when idle: run the full alarm trigger path. */
  activateDrivewayAlarm: () => Promise<void>
  /** Manual icon click when active: run icon-reset actions and clear the icon. */
  resetDrivewayAlarm: () => Promise<void>
  crestronScenes: CrestronScene[]
  outsideTransformers: OutsideTransformer[]
  outsideMode: OutsideMode
  outsideButtons: OutsideCustomButton[]
  /** Button ids currently showing the red Active control. */
  outsideButtonActiveIds: string[]
  setOutsideButtons: (buttons: OutsideCustomButton[]) => void
  stockSymbols: string[]
  setStockSymbols: (symbols: string[]) => void
  stockFormulas: StockFormula[]
  setStockFormulas: (formulas: StockFormula[]) => void
  runOutsideButton: (buttonId: string) => Promise<void>
  /** Click Active: optional restore + activeActions, then return to idle button. */
  deactivateOutsideButton: (buttonId: string) => Promise<void>
  weather: WeatherSnapshot | null
  calendar: CalendarSnapshot | null
  reminders: DashboardReminder[]
  sun: SunSnapshot | null
  /** Last-communication rows for every polled device / integration. */
  deviceCommStatus: DeviceCommRow[]
  connectionStatus: ConnectionStatus
  connectionError: string | null
  lastSyncedAt: number | null
  scheduleRevision: number
  scheduledCoverCount: number
  scheduleDebug: ScheduleDebugInfo | null
  scheduleUsesSunDefault: boolean
  scheduleHomebridgeSource: 'homebridge' | 'cache' | null
  mappedCount: number
  /** Loaded via view.html — all write actions are disabled. */
  readOnly: boolean
  setShadePosition: (id: string, position: number) => void
  setPoolLights: (on: boolean) => Promise<void>
  setPondFill: (on: boolean) => Promise<void>
  /** Turn on ScreenLogic Pool circuit (starts filter pump at programmed Pool speed). */
  turnPoolPumpOn: () => Promise<void>
  setThermostatMode: (entityId: string, mode: string) => Promise<void>
  setThermostatSetpoint: (entityId: string, temperature: number) => Promise<void>
  setOutsideTransformer: (key: OutsideControlKey, on: boolean) => Promise<void>
  setOutsideTransformerBrightness: (key: OutsideControlKey, percent: number) => void
  setOutsideMode: (mode: OutsideMode) => void
  updateReminder: (id: 1 | 2, patch: Partial<Omit<DashboardReminder, 'id'>>) => void
  dismissReminder: (id: 1 | 2) => void
  setMainGarageDoor: (open: boolean) => Promise<void>
  setWorkshopGarageDoor: (open: boolean) => Promise<void>
  setGateOpen: (open: boolean) => Promise<void>
  bathroomFanAutoOffEnabled: boolean
  setBathroomFanAutoOffEnabled: (enabled: boolean) => void
  bathroomFanAutoOffMinutes: number
  setBathroomFanAutoOffMinutes: (minutes: number) => void
  bathroomFanSlots: BathroomFanSlots
  setBathroomFanSlot: (index: number, entityId: string) => void
  pondFillAutoEnabled: boolean
  setPondFillAutoEnabled: (enabled: boolean) => void
  pondFillLowInches: number
  setPondFillLowInches: (inches: number) => void
  pondFillFullInches: number
  setPondFillFullInches: (inches: number) => void
  doorbellEmailEnabled: boolean
  setDoorbellEmailEnabled: (enabled: boolean) => void
  doorbellIconMinutes: number
  setDoorbellIconMinutes: (minutes: number) => void
  doorbellAudioEnabled: boolean
  setDoorbellAudioEnabled: (enabled: boolean) => void
  doorbellAudio: string
  setDoorbellAudio: (soundId: string) => void
  drivewayAlarmEmailEnabled: boolean
  setDrivewayAlarmEmailEnabled: (enabled: boolean) => void
  poolPumpOffEmailEnabled: boolean
  setPoolPumpOffEmailEnabled: (enabled: boolean) => void
  deviceCommFailureEmailEnabled: boolean
  setDeviceCommFailureEmailEnabled: (enabled: boolean) => void
  deviceCommFailureMinutes: number
  setDeviceCommFailureMinutes: (minutes: number) => void
  deviceCommNotifyEnabled: Record<string, boolean>
  setDeviceCommNotifyEnabled: (key: string, enabled: boolean) => void
  commandFailedEmailEnabled: boolean
  setCommandFailedEmailEnabled: (enabled: boolean) => void
  internetOutageEmailEnabled: boolean
  setInternetOutageEmailEnabled: (enabled: boolean) => void
  internetOutageMinutes: number
  setInternetOutageMinutes: (minutes: number) => void
  /** true online, false offline, null unknown / sensor missing */
  internetOnline: boolean | null
  notifyEmailEnabled: boolean
  setNotifyEmailEnabled: (enabled: boolean) => void
  notifyPhoneEnabled: boolean
  setNotifyPhoneEnabled: (enabled: boolean) => void
  notifyEmailOverride: string
  setNotifyEmailOverride: (email: string) => void
  notifyPhoneTarget: string
  setNotifyPhoneTarget: (target: string) => void
  poolLowWaterEmailEnabled: boolean
  setPoolLowWaterEmailEnabled: (enabled: boolean) => void
  poolLowWaterInches: number
  setPoolLowWaterInches: (inches: number) => void
  pondLowWaterEmailEnabled: boolean
  setPondLowWaterEmailEnabled: (enabled: boolean) => void
  pondLowWaterInches: number
  setPondLowWaterInches: (inches: number) => void
  cisternLowWaterEmailEnabled: boolean
  setCisternLowWaterEmailEnabled: (enabled: boolean) => void
  cisternLowWaterPercent: number
  setCisternLowWaterPercent: (percent: number) => void
  poolPumpAutoOnEnabled: boolean
  setPoolPumpAutoOnEnabled: (enabled: boolean) => void
  poolPumpAutoOnMinutes: number
  setPoolPumpAutoOnMinutes: (minutes: number) => void
  openAllShades: () => void
  closeAllShades: () => void
  setFloorPosition: (floorId: FloorId, position: number) => void
  connect: (token: string, baseUrl?: string) => Promise<void>
  disconnect: () => void
  refresh: () => Promise<void>
  crestronLights: CrestronLight[]
  setCrestronLight: (entityId: string, on: boolean) => Promise<void>
  setCrestronLightBrightness: (entityId: string, percent: number) => void
  setCrestronLightRoom: (entityId: string, room: string) => void
  activateCrestronScene: (entityId: string) => void
  stopAllSonos: () => Promise<void>
  playSonos: (entityId: string) => Promise<void>
  stopSonos: (entityId: string) => Promise<void>
  setSonosVolume: (entityId: string, volumePercent: number) => Promise<void>
  selectSonosSource: (entityId: string, source: string) => Promise<void>
  toggleReceiver: () => Promise<void>
  selectReceiverSource: (source: string) => Promise<void>
  setReceiverVolume: (volumePercent: number) => Promise<void>
  clearControlLog: (kind?: ControlLogKind) => Promise<void>
  setEntityMapping: (shadeId: string, entityId: string | null) => void
  replaceEntityMap: (map: ShadeEntityMap) => void
  autoMapEntities: () => number
  setEnergyMapping: (key: keyof EnergyEntityMap, entityId: string | null) => void
  replaceEnergyMap: (map: EnergyEntityMap) => void
  autoMapEnergy: () => number
  setPoolDepthOffset: (offset: number) => void
  setPondDepthOffset: (offset: number) => void
  exportShadeMap: () => void
  exportEnergyMap: () => void
  exportPoolMap: () => void
  exportPondMap: () => void
  exportHaConfig: () => void
}

const HouseContext = createContext<HouseContextValue | null>(null)
const POLL_MS = 5_000
/** Weather get_forecasts is rate-limited by many providers — keep this slow. */
const WEATHER_POLL_MS = 5 * 60 * 1000
/** Daily/monthly utility meters on the EZ1 "today" counter; they keep their value overnight. */
const SHED_INVERTER_TODAY = 'sensor.shed_inverter_energy_today'
const SHED_INVERTER_MONTH = 'sensor.shed_inverter_energy_this_month'
const SHED_INVERTER_LIFETIME = 'sensor.shed_inverter_energy_lifetime'
const WEATHER_FETCH_RETRIES = 3
const WEATHER_FETCH_RETRY_MS = 2_500

const EMPTY_ENERGY: EnergySnapshot = {
  pvOnlyWatts: null,
  pvOnlyLoadWatts: null,
  pvOnlyGridWatts: null,
  pvOnlyLabel: formatPower(null),
  pvOnlyLoadLabel: formatPower(null),
  pvOnlyGridLabel: formatPower(null),
  pvOnlyExcessLabel: formatPower(null),
  pvOnlyMonthLabel: formatEnergyKwh(null),
  pvOnlyTodayLabel: formatEnergyKwh(null),
  pvOnlyLifetimeLabel: formatEnergyKwh(null),
  shedInverterMapped: false,
  shedInverterWatts: null,
  shedInverterLabel: formatPower(null),
  shedInverterTodayLabel: formatEnergyKwh(null),
  shedInverterMonthLabel: formatEnergyKwh(null),
  shedInverterLifetimeLabel: formatEnergyKwh(null),
}

function clampPosition(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function shadesCacheHasData(cache: ShadesCacheSnapshot | null): boolean {
  if (!cache?.shades) return false
  return Object.values(cache.shades).some((entry) => entry?.position != null)
}

/** Shade ids whose position came from a live HA cover state on the last sync. */
const liveShadeIds = new Set<string>()

function applyCoverPositions(
  shades: Shade[],
  entityMap: ShadeEntityMap,
  coversById: Map<string, HaCover>,
): Shade[] {
  liveShadeIds.clear()
  return shades.map((shade) => {
    const entityId = entityMap[shade.id]
    if (!entityId) return shade
    const cover = coversById.get(entityId)
    if (!cover || cover.closedPercent == null) return shade
    liveShadeIds.add(shade.id)
    return { ...shade, position: cover.closedPercent }
  })
}

/** Fill in shades that have no live HA position from the HA-host cache. */
function applyShadesCache(shades: Shade[], cache: ShadesCacheSnapshot | null): Shade[] {
  if (!cache?.shades) return shades
  return shades.map((shade) => {
    if (liveShadeIds.has(shade.id)) return shade
    const entry = cache.shades?.[shade.id]
    if (!entry || entry.position == null) return shade
    return { ...shade, position: Math.max(0, Math.min(100, Math.round(entry.position))) }
  })
}

function applyShadePositions(
  shades: Shade[],
  entityMap: ShadeEntityMap,
  coversById: Map<string, HaCover>,
  cache: ShadesCacheSnapshot | null,
): Shade[] {
  const fromCovers = applyCoverPositions(shades, entityMap, coversById)
  if (shadesCacheHasData(cache)) return applyShadesCache(fromCovers, cache)
  return fromCovers
}

function pvCacheHasData(cache: PvCacheSnapshot | null): boolean {
  if (!cache) return false
  return (
    cache.powerW != null ||
    cache.todayKwh != null ||
    cache.energyMonthKwh != null ||
    cache.energyLifetimeKwh != null
  )
}

function applyPvCache(base: EnergySnapshot, cache: PvCacheSnapshot | null): EnergySnapshot {
  if (!pvCacheHasData(cache) || !cache) return base
  const pvOnlyWatts = cache.powerW ?? base.pvOnlyWatts
  const pvOnlyTodayKwh = cache.todayKwh ?? null
  const pvOnlyMonthKwh = cache.energyMonthKwh ?? null
  const pvOnlyLifetimeKwh = cache.energyLifetimeKwh ?? null
  return {
    ...base,
    pvOnlyWatts: pvOnlyWatts ?? null,
    pvOnlyLabel: formatPower(pvOnlyWatts ?? null),
    pvOnlyTodayLabel:
      pvOnlyTodayKwh != null ? formatEnergyKwh(pvOnlyTodayKwh) : base.pvOnlyTodayLabel,
    pvOnlyMonthLabel:
      pvOnlyMonthKwh != null ? formatEnergyKwh(pvOnlyMonthKwh) : base.pvOnlyMonthLabel,
    pvOnlyLifetimeLabel:
      pvOnlyLifetimeKwh != null ? formatEnergyKwh(pvOnlyLifetimeKwh) : base.pvOnlyLifetimeLabel,
  }
}

function snapshotFromSensors(
  energyMap: EnergyEntityMap,
  sensorsById: Map<string, HaSensor>,
): EnergySnapshot {
  const pvOnlySensor = energyMap.pvOnlyProduction
    ? sensorsById.get(energyMap.pvOnlyProduction) ?? null
    : null
  const pvOnlyLoadSensor = energyMap.pvOnlyLoad
    ? sensorsById.get(energyMap.pvOnlyLoad) ?? null
    : null
  const pvOnlyGridSensor = energyMap.pvOnlyGrid
    ? sensorsById.get(energyMap.pvOnlyGrid) ?? null
    : null
  const pvOnlyMonthSensor = energyMap.pvOnlyMonthEnergy
    ? sensorsById.get(energyMap.pvOnlyMonthEnergy) ?? null
    : null
  const pvOnlyTodaySensor = energyMap.pvOnlyTodayEnergy
    ? sensorsById.get(energyMap.pvOnlyTodayEnergy) ?? null
    : null
  const pvOnlyLifetimeSensor = energyMap.pvOnlyLifetimeEnergy
    ? sensorsById.get(energyMap.pvOnlyLifetimeEnergy) ?? null
    : null
  const pvOnlyWatts = toWatts(pvOnlySensor)
  const pvOnlyLoadWatts = toWatts(pvOnlyLoadSensor)
  const pvOnlyGridWatts = toWatts(pvOnlyGridSensor)
  const { importWatts: pvOnlyGridImportWatts, exportWatts: pvOnlyGridExportWatts } =
    splitGridImportExport(pvOnlyGridWatts)
  const pvOnlyMonthKwh = toKwh(pvOnlyMonthSensor)
  const pvOnlyTodayKwh = toKwh(pvOnlyTodaySensor)
  const pvOnlyLifetimeKwh = toKwh(pvOnlyLifetimeSensor)

  const inverterPowerSensor = sensorsById.get(SHED_INVERTER_POWER_ENTITY) ?? null
  const shedInverterWatts = inverterPowerSensor == null ? null : toWatts(inverterPowerSensor)
  const shedInverterTodayKwh = toKwh(sensorsById.get(SHED_INVERTER_TODAY) ?? null)
  const shedInverterMonthKwh = toKwh(sensorsById.get(SHED_INVERTER_MONTH) ?? null)
  const shedInverterLifetimeKwh = toKwh(sensorsById.get(SHED_INVERTER_LIFETIME) ?? null)

  return {
    pvOnlyWatts,
    pvOnlyLoadWatts,
    pvOnlyGridWatts,
    pvOnlyLabel: formatPower(pvOnlyWatts),
    pvOnlyLoadLabel: formatPower(pvOnlyLoadWatts == null ? null : Math.abs(pvOnlyLoadWatts)),
    pvOnlyGridLabel: formatPower(pvOnlyGridImportWatts),
    pvOnlyExcessLabel: formatPower(pvOnlyGridExportWatts),
    pvOnlyMonthLabel: formatEnergyKwh(pvOnlyMonthKwh),
    pvOnlyTodayLabel: formatEnergyKwh(pvOnlyTodayKwh),
    pvOnlyLifetimeLabel: formatEnergyKwh(pvOnlyLifetimeKwh),
    shedInverterMapped: inverterPowerSensor != null,
    shedInverterWatts,
    shedInverterLabel: formatPower(shedInverterWatts == null ? null : Math.max(0, shedInverterWatts)),
    shedInverterTodayLabel: formatEnergyKwh(shedInverterTodayKwh),
    shedInverterMonthLabel: formatEnergyKwh(shedInverterMonthKwh),
    shedInverterLifetimeLabel: formatEnergyKwh(shedInverterLifetimeKwh),
  }
}

function mergeScheduleRecords(
  ...maps: Array<Record<string, ShadeScheduleEvent[]>>
): Record<string, ShadeScheduleEvent[]> {
  const merged = new Map<string, ShadeScheduleEvent[]>()
  for (const map of maps) {
    for (const [entityId, events] of Object.entries(map)) {
      const list = merged.get(entityId) ?? []
      list.push(...events)
      merged.set(entityId, list)
    }
  }
  const result: Record<string, ShadeScheduleEvent[]> = {}
  for (const [entityId, events] of merged) {
    const seen = new Set<string>()
    const deduped: ShadeScheduleEvent[] = []
    for (const event of events) {
      const key = `${event.time}|${event.action}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(event)
    }
    result[entityId] = deduped.sort((a, b) => a.time.localeCompare(b.time))
  }
  return result
}

const noop = () => {}
const noopAsync = async () => {}

const recentControlLogs: { entry: {
  ts: string
  source: string
  actor: string
  action: string
  entity_id?: string | null
  detail?: unknown
  ok?: boolean
}; at: number }[] = []

type ControlLogNotifyEntry = (typeof recentControlLogs)[number]['entry']
const notifyCommandFailedHandlers = new Set<(entry: ControlLogNotifyEntry) => void>()

function logControl(
  client: { logControlEvent: (entry: {
    source?: string
    actor: string
    action: string
    entityId?: string | null
    detail?: unknown
    ok?: boolean
  }) => Promise<void> } | null | undefined,
  entry: {
    actor: string
    action: string
    entityId?: string | null
    detail?: unknown
    ok?: boolean
  },
): void {
  const full = {
    ts: new Date().toISOString(),
    source: 'dashboard' as const,
    actor: entry.actor,
    action: entry.action,
    entity_id: entry.entityId ?? null,
    detail: entry.detail,
    ok: entry.ok !== false,
  }
  // Drop accidental double-fires (and avoid writing local+HA twice).
  const cutoff = Date.now() - 2500
  while (recentControlLogs.length > 0 && recentControlLogs[0].at < cutoff) {
    recentControlLogs.shift()
  }
  if (hasRecentControlLogDuplicate(full, recentControlLogs.map((row) => row.entry))) {
    return
  }
  recentControlLogs.push({ entry: full, at: Date.now() })

  appendLocalControlLog(full)
  if (full.ok === false) {
    notifyCommandFailedHandlers.forEach((handler) => {
      try {
        handler(full)
      } catch {
        /* ignore notify handler errors */
      }
    })
  }
  if (!client) return
  void client
    .logControlEvent({
      source: 'dashboard',
      actor: entry.actor,
      action: entry.action,
      entityId: entry.entityId,
      detail: entry.detail,
      ok: entry.ok,
    })
    .catch(() => undefined)
}

/** Driveway / doorbell sounds only play for triggers newer than this. */
const ALERT_SOUND_MAX_AGE_MS = 2 * 60 * 1000

function maxKnownMs(a: number | null, b: number | null): number | null {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}

export function HouseProvider({ children }: { children: ReactNode }) {
  const readOnly = isReadOnlyDashboard()
  const [shades, setShades] = useState<Shade[]>(INITIAL_SHADES)
  const [entityMap, setEntityMap] = useState<ShadeEntityMap>(() => loadShadeEntityMap())
  const [energyMap, setEnergyMap] = useState<EnergyEntityMap>(() => loadEnergyEntityMap())
  const [poolMap, setPoolMap] = useState<PoolEntityMap>(() => loadPoolEntityMap())
  const [pondMap, setPondMap] = useState<PondEntityMap>(() => loadPondEntityMap())
  const [covers, setCovers] = useState<HaCover[]>([])
  const [sensors, setSensors] = useState<HaSensor[]>([])
  const [energy, setEnergy] = useState<EnergySnapshot>(EMPTY_ENERGY)
  const [poolPumpOffEmailEnabled, setPoolPumpOffEmailEnabledState] = useState(true)
  const [deviceCommFailureEmailEnabled, setDeviceCommFailureEmailEnabledState] = useState(false)
  const [deviceCommFailureMinutes, setDeviceCommFailureMinutesState] = useState(
    DEFAULT_DEVICE_COMM_FAILURE_MINUTES,
  )
  const [deviceCommNotifyEnabled, setDeviceCommNotifyEnabledState] = useState<
    Record<string, boolean>
  >({})
  const [commandFailedEmailEnabled, setCommandFailedEmailEnabledState] = useState(false)
  const [internetOutageEmailEnabled, setInternetOutageEmailEnabledState] = useState(true)
  const [internetOutageMinutes, setInternetOutageMinutesState] = useState(
    DEFAULT_INTERNET_OUTAGE_MINUTES,
  )
  const [internetOnline, setInternetOnline] = useState<boolean | null>(null)
  const [notifyEmailEnabled, setNotifyEmailEnabledState] = useState(true)
  const [notifyPhoneEnabled, setNotifyPhoneEnabledState] = useState(false)
  const [notifyEmailOverride, setNotifyEmailOverrideState] = useState('')
  const [notifyPhoneTarget, setNotifyPhoneTargetState] = useState(DEFAULT_PHONE_NOTIFY_ENTITY)
  const [poolLowWaterEmailEnabled, setPoolLowWaterEmailEnabledState] = useState(false)
  const [poolLowWaterInches, setPoolLowWaterInchesState] = useState(DEFAULT_POOL_LOW_WATER_INCHES)
  const [pondLowWaterEmailEnabled, setPondLowWaterEmailEnabledState] = useState(false)
  const [pondLowWaterInches, setPondLowWaterInchesState] = useState(DEFAULT_POND_LOW_WATER_INCHES)
  const [cisternLowWaterEmailEnabled, setCisternLowWaterEmailEnabledState] = useState(false)
  const [cisternLowWaterPercent, setCisternLowWaterPercentState] = useState(
    DEFAULT_CISTERN_LOW_WATER_PERCENT,
  )
  const [poolPumpAutoOnEnabled, setPoolPumpAutoOnEnabledState] = useState(false)
  const [poolPumpAutoOnMinutes, setPoolPumpAutoOnMinutesState] = useState(
    DEFAULT_POOL_PUMP_AUTO_ON_MINUTES,
  )
  const [bathroomFanAutoOffEnabled, setBathroomFanAutoOffEnabledState] = useState(false)
  const [bathroomFanAutoOffMinutes, setBathroomFanAutoOffMinutesState] = useState(
    DEFAULT_BATHROOM_FAN_AUTO_OFF_MINUTES,
  )
  const [bathroomFanSlots, setBathroomFanSlotsState] = useState<BathroomFanSlots>([
    ...EMPTY_BATHROOM_FAN_SLOTS,
  ])
  const [pondFillAutoEnabled, setPondFillAutoEnabledState] = useState(false)
  const [pondFillLowInches, setPondFillLowInchesState] = useState(DEFAULT_POND_FILL_LOW_INCHES)
  const [pondFillFullInches, setPondFillFullInchesState] = useState(DEFAULT_POND_FILL_FULL_INCHES)
  const [doorbellEmailEnabled, setDoorbellEmailEnabledState] = useState(false)
  const [doorbellIconMinutes, setDoorbellIconMinutesState] = useState(5)
  const [doorbellAudioEnabled, setDoorbellAudioEnabledState] = useState(false)
  const [doorbellAudio, setDoorbellAudioState] = useState(() =>
    normalizeDashboardSoundId(DEFAULT_DASHBOARD_SETTINGS.doorbellAudio),
  )
  const [drivewayAlarmEmailEnabled, setDrivewayAlarmEmailEnabledState] = useState(false)
  const [drivewayAlarmEnabled, setDrivewayAlarmEnabledState] = useState(true)
  const [drivewayAlarmTrigger, setDrivewayAlarmTriggerState] =
    useState<DrivewayAlarmTriggerState>('on')
  const [drivewayAlarmResetSeconds, setDrivewayAlarmResetSecondsState] = useState(30 * 60)
  const [drivewayAlarmConditions, setDrivewayAlarmConditionsState] = useState<
    DrivewayAlarmConditionRow[]
  >([])
  const [drivewayAlarmActions, setDrivewayAlarmActionsState] = useState<DashboardActionSelection[]>(
    [],
  )
  const [drivewayAlarmRestore, setDrivewayAlarmRestoreState] = useState(false)
  const [drivewayAlarmResetActions, setDrivewayAlarmResetActionsState] = useState<
    DashboardActionSelection[]
  >([])
  const [drivewayAlarmAudioEnabled, setDrivewayAlarmAudioEnabledState] = useState(false)
  const [drivewayAlarmAudio, setDrivewayAlarmAudioState] = useState(() =>
    normalizeDashboardSoundId(DEFAULT_DASHBOARD_SETTINGS.drivewayAlarmAudio),
  )
  const [pool, setPool] = useState<PoolSnapshot>(EMPTY_POOL)
  const [pond, setPond] = useState<PondSnapshot>(EMPTY_POND)
  const [ballFountain, setBallFountain] = useState<BallFountainSnapshot>(EMPTY_BALL_FOUNTAIN)
  const [crestronPower, setCrestronPowerSnap] =
    useState<CrestronPowerSnapshot>(EMPTY_CRESTRON_POWER)
  const [hvac, setHvac] = useState<HvacSnapshot>(EMPTY_HVAC)
  const [ac, setAc] = useState<AcSnapshot>(EMPTY_AC)
  const [irrigation, setIrrigation] = useState<IrrigationSnapshot>(EMPTY_IRRIGATION)
  const [audio, setAudio] = useState<SonosSnapshot>(EMPTY_SONOS)
  const [receiver, setReceiver] = useState<ReceiverSnapshot>(EMPTY_RECEIVER)
  const [egauge, setEgauge] = useState<EgaugeSnapshot>(EMPTY_EGAUGE)
  const [deviceCommStatus, setDeviceCommStatus] = useState<DeviceCommRow[]>([])
  const [cistern, setCistern] = useState<CisternSnapshot>(EMPTY_CISTERN)
  const [mainGarage, setMainGarage] = useState<GarageDoorSnapshot>(EMPTY_GARAGE)
  const [workshopGarage, setWorkshopGarage] = useState<GarageDoorSnapshot>(EMPTY_GARAGE)
  const [gate, setGate] = useState<GateSnapshot>(EMPTY_GATE)
  const [hotTub, setHotTub] = useState<HotTubSnapshot>(EMPTY_HOT_TUB)
  const [doorbellRinging, setDoorbellRinging] = useState(false)
  const [drivewayAlarmActive, setDrivewayAlarmActive] = useState(false)
  const [drivewayAlarmLastTriggerAt, setDrivewayAlarmLastTriggerAt] = useState<number | null>(null)
  const [crestronLights, setCrestronLights] = useState<CrestronLight[]>([])
  const [crestronScenes, setCrestronScenes] = useState<CrestronScene[]>([])
  const [crestronLightRooms, setCrestronLightRooms] = useState<CrestronLightRoomMap>({})
  const [outsideTransformers, setOutsideTransformers] = useState<OutsideTransformer[]>([])
  const [outsideMode, setOutsideMode] = useState<OutsideMode>('None')
  const [outsideButtons, setOutsideButtonsState] = useState<OutsideCustomButton[]>([])
  const [stockSymbols, setStockSymbolsState] = useState<string[]>([])
  const [stockFormulas, setStockFormulasState] = useState<StockFormula[]>([])
  const [outsideButtonActiveIds, setOutsideButtonActiveIds] = useState<string[]>([])
  const outsideButtonSnapshotsRef = useRef<Record<string, OutsideEntitySnapshot[]>>({})
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [calendar, setCalendar] = useState<CalendarSnapshot | null>(null)
  const [reminders, setReminders] = useState<DashboardReminder[]>(() =>
    DEFAULT_REMINDERS.map((reminder) => ({ ...reminder })),
  )
  const [sun, setSun] = useState<SunSnapshot | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [scheduleRevision, setScheduleRevision] = useState(0)
  const [scheduledCoverCount, setScheduledCoverCount] = useState(0)
  const [scheduleDebug, setScheduleDebug] = useState<ScheduleDebugInfo | null>(null)
  const [scheduleUsesSunDefault, setScheduleUsesSunDefault] = useState(false)
  const [scheduleHomebridgeSource, setScheduleHomebridgeSource] = useState<
    'homebridge' | 'cache' | null
  >(null)
  const clientRef = useRef<HaClient | null>(null)
  const entityMapRef = useRef(entityMap)
  const energyMapRef = useRef(energyMap)
  const poolMapRef = useRef(poolMap)
  const pondMapRef = useRef(pondMap)
  const shadesRef = useRef(shades)
  const coversRef = useRef(covers)
  const sensorsRef = useRef(sensors)
  const crestronLightsRef = useRef(crestronLights)
  const crestronLightRoomsRef = useRef(crestronLightRooms)
  const migrateCrestronLightRoomsRef = useRef(false)
  const outsideTransformersRef = useRef(outsideTransformers)
  const egaugeRef = useRef(egauge)
  const outsideBrightnessSetAtRef = useRef<Partial<Record<OutsideControlKey, number>>>({})
  const pvCacheRef = useRef<PvCacheSnapshot | null>(null)
  const shadesCacheRef = useRef<ShadesCacheSnapshot | null>(null)
  const weatherForecastCacheRef = useRef<{
    entityId: string
    forecast: HaWeatherForecast[]
  } | null>(null)
  const weatherForecastInFlightRef = useRef(false)
  const statesRef = useRef<HaState[]>([])
  const egaugeUpdatedAtMsRef = useRef<number | null>(null)
  const deviceCommStatusRef = useRef<DeviceCommRow[]>([])
  const deviceCommSnapshotsRef = useRef({
    energy: EMPTY_ENERGY as EnergySnapshot,
    mainGarage: EMPTY_GARAGE as GarageDoorSnapshot,
    workshopGarage: EMPTY_GARAGE as GarageDoorSnapshot,
    gate: EMPTY_GATE as GateSnapshot,
    cistern: EMPTY_CISTERN as CisternSnapshot,
    weather: null as WeatherSnapshot | null,
    irrigation: EMPTY_IRRIGATION as IrrigationSnapshot,
    audio: EMPTY_SONOS as SonosSnapshot,
    receiver: EMPTY_RECEIVER as ReceiverSnapshot,
    hvac: EMPTY_HVAC as HvacSnapshot,
    ac: EMPTY_AC as AcSnapshot,
    outsideTransformers: [] as OutsideTransformer[],
    crestronLights: [] as CrestronLight[],
    egauge: EMPTY_EGAUGE as EgaugeSnapshot,
  })
  /** Last known pool pump RPM for edge-detecting unexpected stops. */
  const previousPoolRpmRef = useRef<number | null>(null)
  const dashboardSettingsRef = useRef<DashboardSettings>(DEFAULT_DASHBOARD_SETTINGS)
  /** Skip playing alert audio on the first state sync after connect. */
  const alertAudioPrimedRef = useRef(false)
  const drivewayLastTriggerMsRef = useRef<number | null>(null)
  const doorbellLastRingMsRef = useRef<number | null>(null)
  const drivewaySensorRawRef = useRef<string | null>(null)
  const siteCoordsRef = useRef({
    latitude: DEFAULT_ZYNECT_CONFIG.siteLatitude,
    longitude: DEFAULT_ZYNECT_CONFIG.siteLongitude,
  })
  entityMapRef.current = entityMap
  energyMapRef.current = energyMap
  poolMapRef.current = poolMap
  pondMapRef.current = pondMap
  shadesRef.current = shades
  coversRef.current = covers
  sensorsRef.current = sensors
  crestronLightsRef.current = crestronLights
  crestronLightRoomsRef.current = crestronLightRooms
  outsideTransformersRef.current = outsideTransformers
  egaugeRef.current = egauge
  deviceCommStatusRef.current = deviceCommStatus
  deviceCommSnapshotsRef.current = {
    energy,
    mainGarage,
    workshopGarage,
    gate,
    cistern,
    weather,
    irrigation,
    audio,
    receiver,
    hvac,
    ac,
    outsideTransformers,
    crestronLights,
    egauge,
  }
  const entityRegistryRef = useRef<EntityRegistryEntry[]>([])

  const refreshSun = useCallback((when = new Date()) => {
    const { latitude, longitude } = siteCoordsRef.current
    setSun(sunSnapshotFromStates(statesRef.current, latitude, longitude, when))
  }, [])

  const syncSchedulesFromHa = useCallback(async () => {
    const client = clientRef.current
    const shadeToCover = entityMapRef.current
    const mappedCoverEntityIds = [
      ...new Set(Object.values(shadeToCover).filter(Boolean)),
    ]

    let fromHomebridge: Record<string, ShadeScheduleEvent[]> = {}
    let homebridgeSource: 'homebridge' | 'cache' | null = null
    let homebridgeParsedCount = 0
    let homebridgeMatchedCount = 0
    let homebridgeUnmatched: string[] = []
    const homebridgeErrors: string[] = []

    if (mappedCoverEntityIds.length > 0) {
      try {
        const { parsed, source } = await fetchHomebridgeSchedules()
        homebridgeParsedCount = parsed.length
        const matchInfo = countMatchedHomebridgeShades(parsed, shadesRef.current, shadeToCover)
        homebridgeMatchedCount = matchInfo.matched
        homebridgeUnmatched = matchInfo.unmatched
        fromHomebridge = homebridgeSchedulesForShades(parsed, shadesRef.current, shadeToCover)
        homebridgeSource = source
      } catch (err) {
        homebridgeErrors.push(
          err instanceof Error ? err.message : 'Homebridge schedule load failed',
        )
      }
    }

    if (!client) {
      setHaEntitySchedules(fromHomebridge)
      setScheduledCoverCount(countScheduledCovers(fromHomebridge))
      setScheduleUsesSunDefault(false)
      setScheduleHomebridgeSource(homebridgeSource)
      setScheduleDebug(
        analyzeScheduleLoad([], [], fromHomebridge, mappedCoverEntityIds, {
          automationEntityCount: 0,
          listedIds: 0,
          errors: homebridgeErrors,
          scheduleMapCoverCount: 0,
          homebridgeCoverCount: countScheduledCovers(fromHomebridge),
          homebridgeSource,
          homebridgeParsedCount,
          homebridgeMatchedCount,
          homebridgeUnmatched,
        }),
      )
      setScheduleRevision((value) => value + 1)
      return
    }

    try {
      const states = await client.getStates()

      let automationLoad = {
        automationEntityCount: 0,
        listedIds: [] as string[],
        errors: [] as string[],
        configs: [] as HaAutomationConfig[],
      }

      if (states.some((state) => state.entity_id.startsWith('automation.'))) {
        automationLoad = await client.loadAutomations()
      }

      const configs = automationLoad.configs

      const [registry] = await Promise.all([client.listEntityRegistry()])
      entityRegistryRef.current = registry
      const scriptSequences = await client.listScriptSequences(collectScriptIdsFromConfigs(configs))

      const fromAutomations = buildCoverSchedules(
        configs,
        states,
        scriptSequences,
        coversByAreaIdFromRegistry(registry),
        mappedCoverEntityIds,
      )
      const fromScheduleMap = schedulesFromScheduleMap(getShadeScheduleMap(), states, shadeToCover)
      const schedules = mergeScheduleRecords(fromAutomations, fromScheduleMap, fromHomebridge)

      setHaEntitySchedules(schedules)
      setScheduledCoverCount(countScheduledCovers(schedules))
      setScheduleUsesSunDefault(usesSunDefault(getShadeScheduleMap()))
      setScheduleHomebridgeSource(homebridgeSource)
      setScheduleDebug(
        analyzeScheduleLoad(configs, states, schedules, mappedCoverEntityIds, {
          automationEntityCount: automationLoad.automationEntityCount,
          listedIds: automationLoad.listedIds.length,
          errors: [...automationLoad.errors, ...homebridgeErrors],
          scheduleMapCoverCount: countScheduledCovers(fromScheduleMap),
          homebridgeCoverCount: countScheduledCovers(fromHomebridge),
          homebridgeSource,
          homebridgeParsedCount,
          homebridgeMatchedCount,
          homebridgeUnmatched,
        }),
      )
      setScheduleRevision((value) => value + 1)
    } catch (err) {
      const schedules = fromHomebridge
      setHaEntitySchedules(schedules)
      setScheduledCoverCount(countScheduledCovers(schedules))
      setScheduleUsesSunDefault(false)
      setScheduleHomebridgeSource(homebridgeSource)
      setScheduleDebug(
        analyzeScheduleLoad([], [], schedules, mappedCoverEntityIds, {
          automationEntityCount: 0,
          listedIds: 0,
          errors: [
            err instanceof Error ? err.message : 'Schedule load failed',
            ...homebridgeErrors,
          ],
          scheduleMapCoverCount: 0,
          homebridgeCoverCount: countScheduledCovers(fromHomebridge),
          homebridgeSource,
          homebridgeParsedCount,
          homebridgeMatchedCount,
          homebridgeUnmatched,
        }),
      )
      setScheduleRevision((value) => value + 1)
    }
  }, [])

  const applyCrestronStates = useCallback((states: HaState[]) => {
    setCrestronScenes(crestronScenesFromStates(states))
    setCrestronLights((previousLights) => {
      const previous = new Map(previousLights.map((light) => [light.entityId, light]))
      return crestronLightsFromStates(
        states,
        entityRegistryRef.current,
        crestronLightRoomsRef.current,
      ).map((light) => ({
        ...light,
        brightness: light.brightness ?? previous.get(light.entityId)?.brightness ?? null,
      }))
    })
  }, [])

  const refreshDeviceCommStatus = useCallback(async () => {
    const file = await fetchDeviceCommStatus()
    if (!file) return
    const live = deviceCommSnapshotsRef.current
    setDeviceCommStatus(
      applyLiveDeviceCommOverrides(deviceCommRowsFromHaStatus(file), {
        gate: live.gate,
        mainGarage: live.mainGarage,
        workshopGarage: live.workshopGarage,
        outsideTransformers: live.outsideTransformers,
        crestronLights: live.crestronLights,
        irrigation: live.irrigation,
        weather: live.weather,
        audio: live.audio,
        receiver: live.receiver,
        hvac: live.hvac,
        ac: live.ac,
        cistern: live.cistern,
      }),
    )
  }, [])

  // Keep Last Communication / connectivity rail in sync with live UI unavailability.
  useEffect(() => {
    setDeviceCommStatus((prev) => {
      if (prev.length === 0) return prev
      const live = deviceCommSnapshotsRef.current
      const next = applyLiveDeviceCommOverrides(prev, {
        gate: live.gate,
        mainGarage: live.mainGarage,
        workshopGarage: live.workshopGarage,
        outsideTransformers: live.outsideTransformers,
        crestronLights: live.crestronLights,
        irrigation: live.irrigation,
        weather: live.weather,
        audio: live.audio,
        receiver: live.receiver,
        hvac: live.hvac,
        ac: live.ac,
        cistern: live.cistern,
      })
      const changed = next.some(
        (row, index) =>
          row.succeeded !== prev[index]?.succeeded ||
          row.resultLabel !== prev[index]?.resultLabel,
      )
      return changed ? next : prev
    })
  }, [
    gate.doorbirdOffline,
    gate.sensorOffline,
    gate.sensorBlocked,
    mainGarage.offline,
    workshopGarage.offline,
    outsideTransformers,
    crestronLights,
    irrigation,
    weather,
    audio,
    receiver,
    hvac,
    ac,
    cistern,
  ])

  useEffect(() => {
    void refreshDeviceCommStatus()
    return startVisibilityInterval(() => {
      void refreshDeviceCommStatus()
    }, 30_000)
  }, [refreshDeviceCommStatus])

  const syncCrestronFromHa = useCallback(async () => {
    const client = clientRef.current
    if (!client) return

    const entityIds = [
      ...crestronLightsRef.current.map((light) => light.entityId),
      ...CRESTRON_SCENE_ENTITY_IDS,
    ]
    if (entityIds.length > 0) {
      await client.refreshEntities(entityIds).catch(() => undefined)
    }

    const states = await client.getStates()
    statesRef.current = states
    applyCrestronStates(states)
  }, [applyCrestronStates])

  const syncEgaugeFromHa = useCallback(async () => {
    // Prefer the static JSON written by egauge_live — avoids a HA API hit every second.
    const cache = await fetchEgaugeLiveCache()
    if (cache && typeof cache.gridWatts === 'number' && Number.isFinite(cache.gridWatts)) {
      const fetchedMs = cache.fetchedAt ? Date.parse(cache.fetchedAt) : Date.now()
      egaugeUpdatedAtMsRef.current = Number.isFinite(fetchedMs) ? fetchedMs : Date.now()
      const cacheWatts = cache.gridWatts
      const cacheRegisters = parseEgaugeRegisters(cache.registers)
      const extraReadings = extraReadingsFromStates(statesRef.current)
      setEgauge((previous) => {
        const readings =
          cacheRegisters.length > 0
            ? readingsFromRegisters(cacheRegisters, extraReadings)
            : previous.readings
        const readingsChanged =
          readings.length !== previous.readings.length ||
          readings.some(
            (reading, i) =>
              reading.label !== previous.readings[i]?.label ||
              reading.watts !== previous.readings[i]?.watts,
          )
        if (previous.gridWatts === cacheWatts && !readingsChanged) return previous
        return {
          readings: readingsChanged ? readings : previous.readings,
          gridWatts: cacheWatts,
          gridFormatted: formatPower(cacheWatts),
        }
      })
      deviceCommSnapshotsRef.current = {
        ...deviceCommSnapshotsRef.current,
        egauge: {
          ...deviceCommSnapshotsRef.current.egauge,
          gridWatts: cacheWatts,
          gridFormatted: formatPower(cacheWatts),
        },
      }
      return
    }

    const client = clientRef.current
    if (!client) return

    const live = await client.getEntityState(EGAUGE_LIVE_GRID_ENTITY).catch(() => null)
    if (live) {
      const liveWatts = toWatts(sensorFromState(live))
      if (liveWatts != null) {
        const parsed = Date.parse(live.last_updated ?? live.last_changed ?? '')
        egaugeUpdatedAtMsRef.current = Number.isFinite(parsed) ? parsed : Date.now()
        setEgauge((previous) => {
          if (previous.gridWatts === liveWatts) return previous
          return {
            ...previous,
            gridWatts: liveWatts,
            gridFormatted: formatPower(liveWatts),
          }
        })
        deviceCommSnapshotsRef.current = {
          ...deviceCommSnapshotsRef.current,
          egauge: {
            ...deviceCommSnapshotsRef.current.egauge,
            gridWatts: liveWatts,
            gridFormatted: formatPower(liveWatts),
          },
        }
        return
      }
    }

    const states = await client.getStates()
    statesRef.current = states
    const snap = egaugeSnapshotFromStates(states, entityRegistryRef.current)
    setEgauge(snap)
    const liveState = states.find((entry) => entry.entity_id === EGAUGE_LIVE_GRID_ENTITY)
    if (liveState) {
      const parsed = Date.parse(liveState.last_updated ?? liveState.last_changed ?? '')
      egaugeUpdatedAtMsRef.current = Number.isFinite(parsed) ? parsed : Date.now()
    } else if (snap.gridWatts != null) {
      egaugeUpdatedAtMsRef.current = Date.now()
    }
    deviceCommSnapshotsRef.current = {
      ...deviceCommSnapshotsRef.current,
      egauge: snap,
    }
  }, [])

  const syncFromHa = useCallback(async () => {
    const client = clientRef.current
    if (!client) return

    const states = await client.getStates()
    statesRef.current = states
    applyCrestronStates(states)
    const coverList = states
      .filter((s) => s.entity_id.startsWith('cover.'))
      .map((s) => coverFromState(s))
      .sort((a, b) => a.name.localeCompare(b.name))
    const sensorList = states
      .filter((s) => s.entity_id.startsWith('sensor.'))
      .map((s) => sensorFromState(s))
      .sort((a, b) => a.name.localeCompare(b.name))

    setCovers(coverList)
    setSensors(sensorList)

    const weatherEntities = states
      .filter((s) => s.entity_id.startsWith('weather.'))
      .map((s) => weatherFromState(s))
    let pickedWeather = pickWeatherEntity(weatherEntities)
    // Current conditions come from state every poll; forecasts are refreshed on a
    // slower interval (providers rate-limit get_forecasts).
    if (pickedWeather) {
      const cached = weatherForecastCacheRef.current
      if (
        cached &&
        cached.entityId === pickedWeather.entityId &&
        cached.forecast.length > 0
      ) {
        pickedWeather = { ...pickedWeather, forecast: cached.forecast }
      }
    }

    const weatherSnap = weatherSnapshot(pickedWeather)
    setWeather(weatherSnap)
    setInternetOnline(internetOnlineFromStates(states))

    const calendarEntities = calendarsFromStates(states)
    const pickedCalendar = pickCalendarEntity(calendarEntities)
    let calendarSnap: CalendarSnapshot | null = null
    if (pickedCalendar) {
      try {
        const { start, end } = localTwoDayBounds()
        const rawEvents = await client.getCalendarEvents(pickedCalendar.entityId, start, end)
        calendarSnap = calendarSnapshot(pickedCalendar, parseCalendarEvents(rawEvents))
      } catch {
        calendarSnap = calendarSnapshot(pickedCalendar, [])
        if (calendarSnap) {
          calendarSnap = {
            ...calendarSnap,
            statusLabel: 'Could not load calendar events',
          }
        }
      }
    }
    setCalendar(calendarSnap)

    setReminders(remindersFromHaStates(states, dashboardSettingsRef.current.reminders))

    const coversById = new Map(coverList.map((c) => [c.entityId, c]))
    setShades((prev) =>
      applyShadePositions(prev, entityMapRef.current, coversById, shadesCacheRef.current),
    )

    const sensorsById = new Map(sensorList.map((s) => [s.entityId, s]))
    const baseEnergy = snapshotFromSensors(energyMapRef.current, sensorsById)
    setEnergy(applyPvCache(baseEnergy, pvCacheRef.current))

    let nextPoolMap = poolMapRef.current
    if (poolMapCount(nextPoolMap) === 0) {
      const suggested = suggestPoolEntityMap(states)
      if (poolMapCount(suggested) > 0) {
        nextPoolMap = suggested
        poolMapRef.current = suggested
        savePoolEntityMap(suggested)
        setPoolMap(suggested)
      }
    }
    const nextPool = poolSnapshotFromStates(nextPoolMap, states)
    setPool(nextPool)
    {
      const nextRpm = nextPool.pumpRpm
      const prevRpm = previousPoolRpmRef.current
      if (prevRpm != null && prevRpm > 0 && nextRpm === 0) {
        logControl(client, {
          actor: 'system',
          action: 'pool.pump_off',
          entityId: nextPoolMap.pumpRpm,
          detail: { rpm: 0, previousRpm: prevRpm },
        })
      }
      if (nextRpm != null) previousPoolRpmRef.current = nextRpm
    }

    let nextPondMap = pondMapRef.current
    if (pondMapCount(nextPondMap) === 0) {
      const suggested = suggestPondEntityMap(states)
      if (pondMapCount(suggested) > 0) {
        nextPondMap = suggested
        pondMapRef.current = suggested
        savePondEntityMap(suggested)
        setPondMap(suggested)
      }
    }
    const pondSnap = pondSnapshotFromStates(nextPondMap, states)
    setPond(pondSnap)
    setBallFountain(ballFountainFromStates(states))
    setCrestronPowerSnap(crestronPowerFromStates(states))
    const hvacSnap = hvacSnapshotFromStates(states)
    setHvac(hvacSnap)
    const acSnap = acSnapshotFromStates(states)
    setAc(acSnap)
    const irrigationSnap = irrigationSnapshotFromStates(states)
    setIrrigation(irrigationSnap)
    const audioSnap = sonosSnapshotFromStates(states, entityRegistryRef.current)
    setAudio(audioSnap)
    const receiverSnap = receiverSnapshotFromStates(states, entityRegistryRef.current)
    setReceiver(receiverSnap)
    const egaugeSnap = egaugeSnapshotFromStates(states, entityRegistryRef.current)
    setEgauge(egaugeSnap)
    const liveEgauge = states.find((entry) => entry.entity_id === EGAUGE_LIVE_GRID_ENTITY)
    if (liveEgauge) {
      const parsed = Date.parse(liveEgauge.last_updated ?? liveEgauge.last_changed ?? '')
      egaugeUpdatedAtMsRef.current = Number.isFinite(parsed) ? parsed : Date.now()
    }
    const cisternSnap = cisternFromStates(states)
    setCistern(cisternSnap)

    const sensorsByIdForTrends = new Map(
      states
        .filter((s) => s.entity_id.startsWith('sensor.'))
        .map((s) => {
          const sensor = sensorFromState(s)
          return [sensor.entityId, sensor] as const
        }),
    )
    const energySnap = applyPvCache(
      snapshotFromSensors(energyMapRef.current, sensorsByIdForTrends),
      pvCacheRef.current,
    )
    recordAllTrendSamples({
      cisternPercent: cisternSnap.levelPercent,
      pondPercent: pondSnap.levelPercent,
      shedInverterWatts: energySnap.shedInverterWatts,
      pvArrayWatts: energySnap.pvOnlyWatts,
      irrigationZone: activeIrrigationZone(irrigationSnap),
      wellPumpWatts:
        egaugeSnap.readings.find((reading) => /well\s*pump/i.test(reading.label))?.watts ?? null,
      poolTempF: nextPool.temperatureF,
      poolHeaterPercent: poolHeaterPercent(nextPool.spaHeaterOn),
      poolLevelInches: nextPool.depthFt,
      pondTempF: null,
      pondFillPercent: pondSnap.fillOn == null ? null : pondSnap.fillOn ? 100 : 0,
      hotTubTempF: hotTubFromStates(states).temperatureF,
      hotTubWatts:
        egaugeSnap.readings.find((reading) => /hot\s*tub/i.test(reading.label))?.watts ?? null,
    })

    const mainGarageSnap = garageDoorFromStates(states, MAIN_GARAGE)
    const workshopGarageSnap = garageDoorFromStates(states, WORKSHOP_GARAGE)
    const gateSnap = gateFromStates(states)
    setMainGarage(mainGarageSnap)
    setWorkshopGarage(workshopGarageSnap)
    setGate(gateSnap)
    const hotTubSnap = hotTubFromStates(states)
    setHotTub((prev) => holdHotTubReading(prev, hotTubSnap))
    setDoorbellRinging(
      doorbellIsRinging(
        states,
        Date.now(),
        (dashboardSettingsRef.current.doorbellIconMinutes || 5) * 60_000,
      ),
    )
    setDrivewayAlarmActive(
      drivewayAlarmIsActive(
        states,
        Date.now(),
        (dashboardSettingsRef.current.drivewayAlarmResetSeconds || 30 * 60) * 1000,
        dashboardSettingsRef.current.drivewayAlarmTrigger || 'on',
      ),
    )
    {
      const drivewayMs = drivewayAlarmLastTriggerMs(
        states,
        dashboardSettingsRef.current.drivewayAlarmTrigger || 'on',
      )
      setDrivewayAlarmLastTriggerAt(drivewayMs)
      const doorbellMs = doorbellLastRingMs(states)
      const previousDrivewayMs = drivewayLastTriggerMsRef.current
      const previousDoorbellMs = doorbellLastRingMsRef.current
      const drivewayRaw =
        states.find((entry) => entry.entity_id === DRIVEWAY_ALARM_SENSOR)?.state?.toLowerCase() ??
        null
      const previousDrivewayRaw = drivewaySensorRawRef.current
      drivewaySensorRawRef.current = drivewayRaw
      const nowMs = Date.now()
      // Sound only for a trigger newer than any seen and still fresh, so a timestamp that
      // drops out and comes back (settings reload, reconnect) can't replay an old one.
      const isFreshTrigger = (ms: number | null, previous: number | null) =>
        ms != null && (previous == null || ms > previous) && nowMs - ms < ALERT_SOUND_MAX_AGE_MS
      const drivewayReconnected =
        drivewayRaw !== previousDrivewayRaw &&
        (previousDrivewayRaw === 'unavailable' || previousDrivewayRaw === 'unknown')
      if (!alertAudioPrimedRef.current) {
        alertAudioPrimedRef.current = true
      } else {
        if (
          isFreshTrigger(drivewayMs, previousDrivewayMs) &&
          !drivewayReconnected &&
          dashboardSettingsRef.current.drivewayAlarmAudioEnabled
        ) {
          void playDashboardSound(dashboardSettingsRef.current.drivewayAlarmAudio)
        }
        if (
          isFreshTrigger(doorbellMs, previousDoorbellMs) &&
          dashboardSettingsRef.current.doorbellAudioEnabled
        ) {
          void playDashboardSound(dashboardSettingsRef.current.doorbellAudio)
        }
      }
      drivewayLastTriggerMsRef.current = maxKnownMs(previousDrivewayMs, drivewayMs)
      doorbellLastRingMsRef.current = maxKnownMs(previousDoorbellMs, doorbellMs)
    }
    const outsideSnap = outsideTransformersFromStates(states)
    setOutsideTransformers((previous) => {
      const previousByKey = new Map(
        previous.flatMap((transformer) =>
          transformer.controls.map((control) => [control.key, control] as const),
        ),
      )
      return outsideSnap.map((transformer) => ({
        ...transformer,
        controls: transformer.controls.map((control) => {
          const previous = previousByKey.get(control.key)
          const fromHa = control.brightness
          const userSetAt = outsideBrightnessSetAtRef.current[control.key]
          let brightness = fromHa ?? previous?.brightness ?? null

          if (
            previous?.brightness != null &&
            fromHa != null &&
            userSetAt != null &&
            Date.now() - userSetAt < 8000 &&
            Math.abs(fromHa - previous.brightness) >= 13
          ) {
            brightness = previous.brightness
          } else if (
            fromHa != null &&
            previous?.brightness != null &&
            Math.abs(fromHa - previous.brightness) <= 13
          ) {
            delete outsideBrightnessSetAtRef.current[control.key]
          }

          return {
            ...control,
            brightness,
          }
        }),
      }))
    })
    setOutsideMode(outsideModeFromStates(states))
    const crestronLightsSnap = crestronLightsFromStates(
      states,
      entityRegistryRef.current,
      crestronLightRoomsRef.current,
    )

    const syncedMaps = await syncPoolPondMapsFromShared(
      poolMapRef.current,
      pondMapRef.current,
    )
    let finalPondSnap = pondSnap
    if (syncedMaps.changed) {
      poolMapRef.current = syncedMaps.pool
      pondMapRef.current = syncedMaps.pond
      setPoolMap(syncedMaps.pool)
      setPondMap(syncedMaps.pond)
      setPool(poolSnapshotFromStates(syncedMaps.pool, states))
      finalPondSnap = pondSnapshotFromStates(syncedMaps.pond, states)
      setPond(finalPondSnap)
    }

    const fileSettings = await fetchDashboardSettings()
    // Prefer live file; if fetch fails mid-restart, keep last good in-memory settings.
    const durableJson =
      fileSettings ??
      (dashboardSettingsRef.current &&
      !dashboardSettingsConfigEqual(dashboardSettingsRef.current, DEFAULT_DASHBOARD_SETTINGS)
        ? dashboardSettingsRef.current
        : null)
    const haOnly = dashboardSettingsFromHaStates(states, DEFAULT_DASHBOARD_SETTINGS)
    const missingHelpers = missingDashboardSettingHelpers(states)

    let mergedSettings: DashboardSettings
    let allowSyncPersist = false
    if (missingHelpers.length > 0) {
      // Helpers not ready (e.g. mid-restart) — show durable JSON, do not write.
      mergedSettings = durableJson ?? DEFAULT_DASHBOARD_SETTINGS
    } else if (!durableJson) {
      // No durable JSON available (first run or fetch failed). Show helpers only —
      // never write haOnly defaults over a file we simply failed to read.
      mergedSettings = haOnly
    } else if (
      dashboardSettingsConfigEqual(durableJson, DEFAULT_DASHBOARD_SETTINGS) &&
      !dashboardSettingsConfigEqual(haOnly, DEFAULT_DASHBOARD_SETTINGS)
    ) {
      // Seed/default JSON — adopt live helpers once, keep any JSON-only already present.
      mergedSettings = preserveJsonOnlyDashboardSettings(
        { ...haOnly, ...takeJsonOnlyDashboardSettings(durableJson) },
        durableJson,
      )
      allowSyncPersist = Boolean(fileSettings)
    } else if (
      dashboardSettingsConfigEqual(haOnly, DEFAULT_DASHBOARD_SETTINGS) &&
      !dashboardSettingsConfigEqual(durableJson, DEFAULT_DASHBOARD_SETTINGS)
    ) {
      // Helpers look freshly reset to defaults — restore from durable JSON.
      mergedSettings = durableJson
      if (clientRef.current) {
        void pushDashboardSettingsToHelpers(clientRef.current, durableJson).catch(() => undefined)
      }
    } else {
      // Helpers authoritative for automation knobs; JSON keeps rule lists + fan slots.
      mergedSettings = preserveJsonOnlyDashboardSettings(
        dashboardSettingsFromHaStates(states, durableJson),
        durableJson,
      )
      allowSyncPersist = Boolean(fileSettings)
    }

    // Per-field: helper still at stock default while JSON has a custom value → restore.
    if (durableJson && clientRef.current && missingHelpers.length === 0) {
      const helperRestore = helperFieldsToRestoreFromJson(durableJson, haOnly)
      if (Object.keys(helperRestore).length > 0) {
        mergedSettings = normalizeDashboardSettings({ ...mergedSettings, ...helperRestore })
        void persistDashboardSettingsPatch(clientRef.current, helperRestore).catch(() => undefined)
      }
    }

    // Reminder Active is owned by HA (daily reset automation / dismiss), not JSON.
    mergedSettings = {
      ...mergedSettings,
      reminders: mergeRemindersHaActive(mergedSettings.reminders, haOnly.reminders),
    }
    // If helpers still hold stock reminder defaults but JSON has custom values,
    // push config back so HA automations / UI stay aligned.
    if (
      clientRef.current &&
      remindersConfigNeedsHelperRestore(mergedSettings.reminders, haOnly.reminders)
    ) {
      void pushDashboardSettingsToHelpers(clientRef.current, {
        ...mergedSettings,
        // Keep HA's live Active flags while restoring message/time/enabled.
        reminders: mergeRemindersHaActive(mergedSettings.reminders, haOnly.reminders),
      }).catch(() => undefined)
    }

    if (
      allowSyncPersist &&
      fileSettings &&
      clientRef.current &&
      !dashboardSettingsConfigEqual(mergedSettings, fileSettings)
    ) {
      const toPersist = preserveJsonOnlyDashboardSettings(mergedSettings, fileSettings)
      void persistDashboardSettingsJsonOnly(clientRef.current, toPersist).catch(() => undefined)
    }
    dashboardSettingsRef.current = mergedSettings
    setPoolPumpOffEmailEnabledState(mergedSettings.poolPumpOffEmailEnabled)
    setDeviceCommFailureEmailEnabledState(mergedSettings.deviceCommFailureEmailEnabled)
    setDeviceCommFailureMinutesState(mergedSettings.deviceCommFailureMinutes)
    setDeviceCommNotifyEnabledState(mergedSettings.deviceCommNotifyEnabled)
    setCommandFailedEmailEnabledState(mergedSettings.commandFailedEmailEnabled)
    setInternetOutageEmailEnabledState(mergedSettings.internetOutageEmailEnabled)
    setInternetOutageMinutesState(mergedSettings.internetOutageMinutes)
    setNotifyEmailEnabledState(mergedSettings.notifyEmailEnabled)
    setNotifyPhoneEnabledState(mergedSettings.notifyPhoneEnabled)
    setNotifyEmailOverrideState(mergedSettings.notifyEmailOverride)
    setNotifyPhoneTargetState(mergedSettings.notifyPhoneTarget)
    setPoolLowWaterEmailEnabledState(mergedSettings.poolLowWaterEmailEnabled)
    setPoolLowWaterInchesState(mergedSettings.poolLowWaterInches)
    setPondLowWaterEmailEnabledState(mergedSettings.pondLowWaterEmailEnabled)
    setPondLowWaterInchesState(mergedSettings.pondLowWaterInches)
    setCisternLowWaterEmailEnabledState(mergedSettings.cisternLowWaterEmailEnabled)
    setCisternLowWaterPercentState(mergedSettings.cisternLowWaterPercent)
    setPoolPumpAutoOnEnabledState(mergedSettings.poolPumpAutoOnEnabled)
    setPoolPumpAutoOnMinutesState(mergedSettings.poolPumpAutoOnMinutes)
    setBathroomFanAutoOffEnabledState(mergedSettings.bathroomFanAutoOffEnabled)
    setBathroomFanAutoOffMinutesState(mergedSettings.bathroomFanAutoOffMinutes)
    setBathroomFanSlotsState(mergedSettings.bathroomFanSlots)
    setPondFillAutoEnabledState(mergedSettings.pondFillAutoEnabled)
    setPondFillLowInchesState(mergedSettings.pondFillLowInches)
    setPondFillFullInchesState(mergedSettings.pondFillFullInches)
    setDoorbellEmailEnabledState(mergedSettings.doorbellEmailEnabled)
    setDoorbellIconMinutesState(mergedSettings.doorbellIconMinutes)
    setDoorbellAudioEnabledState(mergedSettings.doorbellAudioEnabled)
    setDoorbellAudioState(mergedSettings.doorbellAudio)
    setDrivewayAlarmEmailEnabledState(mergedSettings.drivewayAlarmEmailEnabled)
    setDrivewayAlarmEnabledState(mergedSettings.drivewayAlarmEnabled)
    setDrivewayAlarmTriggerState(mergedSettings.drivewayAlarmTrigger)
    setDrivewayAlarmResetSecondsState(mergedSettings.drivewayAlarmResetSeconds)
    setDrivewayAlarmConditionsState(mergedSettings.drivewayAlarmConditions)
    setDrivewayAlarmActionsState(mergedSettings.drivewayAlarmActions)
    setDrivewayAlarmRestoreState(mergedSettings.drivewayAlarmRestore)
    setDrivewayAlarmResetActionsState(mergedSettings.drivewayAlarmResetActions)
    setDrivewayAlarmAudioEnabledState(mergedSettings.drivewayAlarmAudioEnabled)
    setDrivewayAlarmAudioState(mergedSettings.drivewayAlarmAudio)
    setOutsideButtonsState(mergedSettings.outsideButtons)
    setStockSymbolsState(mergedSettings.stockSymbols)
    setStockFormulasState(mergedSettings.stockFormulas)
    setReminders(mergedSettings.reminders)
    const clientForOffsets = clientRef.current
    if (clientForOffsets) {
      const poolOffset = poolMapRef.current.depthOffset ?? 0
      const pondOffset = pondMapRef.current.depthOffset ?? 0
      void clientForOffsets.setNumber(POOL_WATER_LEVEL_OFFSET_ENTITY, poolOffset).catch(() => undefined)
      void clientForOffsets.setNumber(POND_WATER_LEVEL_OFFSET_ENTITY, pondOffset).catch(() => undefined)
    }

    refreshSun()

    deviceCommSnapshotsRef.current = {
      energy: energySnap,
      mainGarage: mainGarageSnap,
      workshopGarage: workshopGarageSnap,
      gate: gateSnap,
      cistern: cisternSnap,
      weather: weatherSnap,
      irrigation: irrigationSnap,
      audio: audioSnap,
      receiver: receiverSnap,
      hvac: hvacSnap,
      ac: acSnap,
      outsideTransformers: outsideSnap,
      crestronLights: crestronLightsSnap,
      egauge: egaugeSnap,
    }

    setLastSyncedAt(Date.now())
    setConnectionStatus('connected')
    setConnectionError(null)
  }, [applyCrestronStates, refreshSun])

  const syncWeatherForecastsFromHa = useCallback(async () => {
    const client = clientRef.current
    if (!client || weatherForecastInFlightRef.current) return
    weatherForecastInFlightRef.current = true
    try {
      const states = statesRef.current.length > 0 ? statesRef.current : await client.getStates()
      statesRef.current = states
      const weatherEntities = states
        .filter((s) => s.entity_id.startsWith('weather.'))
        .map((s) => weatherFromState(s))
      const picked = pickWeatherEntity(weatherEntities)
      if (!picked) return

      const forecastEntityIds = [
        picked.entityId,
        ...weatherEntities
          .map((entity) => entity.entityId)
          .filter((entityId) => entityId !== picked.entityId),
      ]

      let forecast: HaWeatherForecast[] = []
      let usedEntityId = picked.entityId
      outer: for (const entityId of forecastEntityIds) {
        for (let attempt = 1; attempt <= WEATHER_FETCH_RETRIES; attempt += 1) {
          try {
            const next = await client.getWeatherForecasts(entityId)
            if (next.length > 0) {
              forecast = next
              usedEntityId = entityId
              break outer
            }
          } catch {
            if (attempt < WEATHER_FETCH_RETRIES) {
              await sleep(WEATHER_FETCH_RETRY_MS * attempt)
            }
          }
        }
      }

      if (forecast.length === 0) {
        // Keep last good forecast; current conditions still update via syncFromHa.
        return
      }

      weatherForecastCacheRef.current = { entityId: usedEntityId, forecast }
      const base =
        weatherEntities.find((entity) => entity.entityId === usedEntityId) ?? picked
      setWeather(weatherSnapshot({ ...base, forecast }))
      deviceCommSnapshotsRef.current = {
        ...deviceCommSnapshotsRef.current,
        weather: weatherSnapshot({ ...base, forecast }),
      }
    } finally {
      weatherForecastInFlightRef.current = false
    }
  }, [])

  const pollUntilToggleConfirmed = useCallback(
    async (isConfirmed: () => boolean, maxMs: number = PENDING_TOGGLE_POLL_MAX_MS) => {
      const deadline = Date.now() + maxMs
      while (Date.now() < deadline) {
        if (isConfirmed()) return true
        await syncFromHa().catch(() => undefined)
        if (isConfirmed()) return true
        await sleep(PENDING_TOGGLE_POLL_MS)
      }
      return isConfirmed()
    },
    [syncFromHa],
  )

  const pollUntilCrestronToggleConfirmed = useCallback(
    async (isConfirmed: () => boolean) => {
      const deadline = Date.now() + PENDING_TOGGLE_POLL_MAX_MS
      while (Date.now() < deadline) {
        if (isConfirmed()) return true
        await syncCrestronFromHa().catch(() => undefined)
        if (isConfirmed()) return true
        await sleep(PENDING_TOGGLE_POLL_MS)
      }
      return isConfirmed()
    },
    [syncCrestronFromHa],
  )

  const syncCrestronLightRoomsFromShared = useCallback(async () => {
    const result = await syncCrestronLightRoomMapFromShared(crestronLightRoomsRef.current)
    if (!result.changed) return
    crestronLightRoomsRef.current = result.map
    setCrestronLightRooms(result.map)
  }, [])

  const connect = useCallback(
    async (token: string, baseUrl = '') => {
      const trimmed = token.trim()
      if (!trimmed) throw new Error('Access token is required')

      const client = new HaClient(trimmed, baseUrl.trim())
      setConnectionStatus('connecting')
      setConnectionError(null)
      try {
        await client.ping()
        clientRef.current = client
        saveToken(trimmed)
        saveBaseUrl(baseUrl.trim())
        await syncSchedulesFromHa()
        await syncFromHa()
        void syncWeatherForecastsFromHa().catch(() => undefined)
        if (migrateCrestronLightRoomsRef.current) {
          await Promise.all(
            Object.entries(crestronLightRoomsRef.current).map(([entityId, room]) =>
              client.persistCrestronLightRoom(entityId, room),
            ),
          )
          migrateCrestronLightRoomsRef.current = false
        }
      } catch (err) {
        clientRef.current = null
        setConnectionStatus('error')
        setConnectionError(err instanceof Error ? err.message : 'Connection failed')
        throw err
      }
    },
    [syncFromHa, syncSchedulesFromHa, syncWeatherForecastsFromHa],
  )

  const disconnect = useCallback(() => {
    clientRef.current = null
    saveToken('')
    setCovers([])
    setSensors([])
    setWeather(null)
    setInternetOnline(null)
    weatherForecastCacheRef.current = null
    setCalendar(null)
    setReminders(DEFAULT_REMINDERS.map((reminder) => ({ ...reminder })))
    setEnergy(EMPTY_ENERGY)
    setPool(EMPTY_POOL)
    setPond(EMPTY_POND)
    setBallFountain(EMPTY_BALL_FOUNTAIN)
    setHvac(EMPTY_HVAC)
    setAc(EMPTY_AC)
    setCrestronLights([])
    setCrestronScenes([])
    setOutsideTransformers([])
    setOutsideMode('None')
    setHaEntitySchedules({})
    setScheduledCoverCount(0)
    setScheduleDebug(null)
    setScheduleRevision((value) => value + 1)
    setConnectionStatus('disconnected')
    setConnectionError(null)
    alertAudioPrimedRef.current = false
    drivewayLastTriggerMsRef.current = null
    setDrivewayAlarmLastTriggerAt(null)
    doorbellLastRingMsRef.current = null
    drivewaySensorRawRef.current = null
    setLastSyncedAt(null)
    liveShadeIds.clear()
    setShades(INITIAL_SHADES)
  }, [])

  const refresh = useCallback(async () => {
    if (!clientRef.current) return
    try {
      await syncCrestronLightRoomsFromShared()
      await syncSchedulesFromHa()
      await syncFromHa()
    } catch (err) {
      setConnectionStatus('error')
      setConnectionError(err instanceof Error ? err.message : 'Refresh failed')
    }
  }, [syncCrestronLightRoomsFromShared, syncFromHa, syncSchedulesFromHa])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.all([
        hydrateHaConfig(),
        loadShadeScheduleOverrides(),
        loadShadeScheduleMap(),
        loadHomebridgeScheduleConfig(),
      ])
      const [nextShades, nextEnergy, nextPool, nextPond, nextCrestronLightRooms] =
        await Promise.all([
        hydrateShadeEntityMap(),
        hydrateEnergyEntityMap(),
        hydratePoolEntityMap(),
        hydratePondEntityMap(),
          hydrateCrestronLightRoomMap(),
        ])
      if (cancelled) return
      setEntityMap(nextShades)
      setPoolMap(nextPool)
      setPondMap(nextPond)
      setCrestronLightRooms(nextCrestronLightRooms.map)
      crestronLightRoomsRef.current = nextCrestronLightRooms.map
      migrateCrestronLightRoomsRef.current =
        !nextCrestronLightRooms.sharedHasAssignments &&
        Object.keys(nextCrestronLightRooms.map).length > 0
      // Prefer hydrated map (includes energy-map.json + repairs). Only fill gaps from
      // whatever was set in this browser while hydrate was in flight.
      setEnergyMap((current) => {
        const merged = mergeEnergyEntityMaps(nextEnergy, current)
        saveEnergyEntityMap(merged)
        return merged
      })

      const tryConnect = async () => {
        const token = loadToken()
        if (!token) {
          setConnectionStatus('disconnected')
          return
        }
        try {
          await connect(token, loadBaseUrl())
        } catch {
          // Stale browser token — re-load from ha-config.json on the HA box and retry once.
          saveToken('')
          const hydrated = await hydrateHaConfig()
          const retry = loadToken()
          if (hydrated && retry) {
            await connect(retry, loadBaseUrl()).catch(() => undefined)
          } else {
            setConnectionStatus('disconnected')
          }
        }
      }
      await tryConnect()
    })()
    return () => {
      cancelled = true
    }
  }, [connect])

  useEffect(() => {
    if (Object.keys(entityMap).length === 0) return
    void syncSchedulesFromHa()
  }, [entityMap, syncSchedulesFromHa])

  useEffect(() => {
    if (connectionStatus !== 'connected') return
    void syncWeatherForecastsFromHa().catch(() => undefined)
    return startVisibilityInterval(() => {
      void syncWeatherForecastsFromHa().catch(() => undefined)
    }, WEATHER_POLL_MS)
  }, [connectionStatus, syncWeatherForecastsFromHa])

  useEffect(() => {
    if (connectionStatus !== 'connected') return
    return startVisibilityInterval(() => {
      void refresh()
    }, POLL_MS)
  }, [connectionStatus, refresh])

  useEffect(() => {
    if (connectionStatus !== 'connected') return
    void syncCrestronFromHa().catch(() => undefined)
    return startVisibilityInterval(() => {
      void syncCrestronFromHa().catch(() => undefined)
    }, CRESTRON_POLL_MS)
  }, [connectionStatus, syncCrestronFromHa])

  useEffect(() => {
    if (connectionStatus !== 'connected') return
    let inFlight = false
    const tick = async () => {
      if (inFlight) return
      inFlight = true
      try {
        await syncEgaugeFromHa()
      } catch {
        /* keep last reading */
      } finally {
        inFlight = false
      }
    }
    void tick()
    return startVisibilityInterval(() => {
      void tick()
    }, EGAUGE_POLL_MS)
  }, [connectionStatus, syncEgaugeFromHa])

  useEffect(() => {
    if (connectionStatus !== 'connected' || covers.length === 0) return
    const byId = new Map(covers.map((c) => [c.entityId, c]))
    setShades((prev) => applyShadePositions(prev, entityMap, byId, shadesCacheRef.current))
  }, [entityMap, covers, connectionStatus])

  useEffect(() => {
    const sync = async () => {
      const pvCache = await fetchPvCache()
      pvCacheRef.current = pvCache
      setEnergy((prev) => {
        const next = applyPvCache(prev, pvCache)
        deviceCommSnapshotsRef.current = {
          ...deviceCommSnapshotsRef.current,
          energy: next,
        }
        return next
      })
    }
    void sync()
    return startVisibilityInterval(() => {
      void sync()
    }, POLL_MS)
  }, [])

  useEffect(() => {
    let cancelled = false
    void hydrateZynectConfig().then((config) => {
      if (cancelled) return
      siteCoordsRef.current = {
        latitude: config.siteLatitude,
        longitude: config.siteLongitude,
      }
      refreshSun()
    })
    return () => {
      cancelled = true
    }
  }, [refreshSun])

  useEffect(() => {
    refreshSun()
    return startVisibilityInterval(() => refreshSun(), 30_000)
  }, [refreshSun])

  useEffect(() => {
    if (!doorbellRinging) return
    const until = doorbellActiveUntilMs(
      statesRef.current,
      (dashboardSettingsRef.current.doorbellIconMinutes || 5) * 60_000,
    )
    if (until == null) {
      setDoorbellRinging(false)
      return
    }
    const remaining = until - Date.now()
    if (remaining <= 0) {
      setDoorbellRinging(false)
      return
    }
    const id = window.setTimeout(() => setDoorbellRinging(false), remaining)
    return () => window.clearTimeout(id)
  }, [doorbellRinging, lastSyncedAt])

  useEffect(() => {
    if (!drivewayAlarmActive) return
    const until = drivewayAlarmActiveUntilMs(
      statesRef.current,
      (dashboardSettingsRef.current.drivewayAlarmResetSeconds || 30 * 60) * 1000,
      dashboardSettingsRef.current.drivewayAlarmTrigger || 'on',
    )
    if (until == null) {
      setDrivewayAlarmActive(false)
      return
    }
    const remaining = until - Date.now()
    if (remaining <= 0) {
      setDrivewayAlarmActive(false)
      return
    }
    const id = window.setTimeout(() => setDrivewayAlarmActive(false), remaining)
    return () => window.clearTimeout(id)
  }, [drivewayAlarmActive, drivewayAlarmResetSeconds, drivewayAlarmTrigger, lastSyncedAt])

  useEffect(() => {
    const sync = async () => {
      const cache = await fetchShadesCache()
      shadesCacheRef.current = cache
      setShades((prev) => applyShadesCache(prev, cache))
    }
    void sync()
    return startVisibilityInterval(() => {
      void sync()
    }, POLL_MS)
  }, [])

  useEffect(() => {
    if (connectionStatus !== 'connected') return
    const byId = new Map(sensors.map((s) => [s.entityId, s]))
    setEnergy(applyPvCache(snapshotFromSensors(energyMap, byId), pvCacheRef.current))
  }, [energyMap, sensors, connectionStatus])

  const setEntityMapping = useCallback((shadeId: string, entityId: string | null) => {
    setEntityMap((prev) => {
      const next = { ...prev }
      if (!entityId) delete next[shadeId]
      else next[shadeId] = entityId
      saveShadeEntityMap(next)
      return next
    })
  }, [])

  const replaceEntityMap = useCallback((map: ShadeEntityMap) => {
    saveShadeEntityMap(map)
    setEntityMap(loadShadeEntityMap())
  }, [])

  const setEnergyMapping = useCallback((key: keyof EnergyEntityMap, entityId: string | null) => {
    setEnergyMap((prev) => {
      const next = { ...prev, [key]: entityId }
      saveEnergyEntityMap(next)
      return next
    })
  }, [])

  const replaceEnergyMap = useCallback((map: EnergyEntityMap) => {
    saveEnergyEntityMap(map)
    setEnergyMap(loadEnergyEntityMap())
  }, [])

  const exportShadeMap = useCallback(() => {
    downloadJson('shade-map.json', pruneAndLoad())
    function pruneAndLoad() {
      saveShadeEntityMap(entityMapRef.current)
      return loadShadeEntityMap()
    }
  }, [])

  const exportEnergyMap = useCallback(() => {
    downloadJson('energy-map.json', energyMapRef.current)
  }, [])

  const exportPoolMap = useCallback(() => {
    downloadJson('pool-map.json', poolMapRef.current)
  }, [])

  const setPoolDepthOffset = useCallback((offset: number) => {
    const depthOffset = Number.isFinite(offset) ? offset : 0
    const next = { ...poolMapRef.current, depthOffset }
    poolMapRef.current = next
    savePoolEntityMap(next)
    setPoolMap(next)
    setPool(poolSnapshotFromStates(next, statesRef.current))
    void clientRef.current?.persistMapDepthOffset('pool', depthOffset)
    void clientRef.current?.setNumber(POOL_WATER_LEVEL_OFFSET_ENTITY, depthOffset).catch(() => undefined)
  }, [])

  const exportPondMap = useCallback(() => {
    downloadJson('pond-map.json', pondMapRef.current)
  }, [])

  const setPondDepthOffset = useCallback((offset: number) => {
    const depthOffset = Number.isFinite(offset) ? offset : 0
    const next = { ...pondMapRef.current, depthOffset }
    pondMapRef.current = next
    savePondEntityMap(next)
    setPondMap(next)
    setPond(pondSnapshotFromStates(next, statesRef.current))
    void clientRef.current?.persistMapDepthOffset('pond', depthOffset)
    void clientRef.current?.setNumber(POND_WATER_LEVEL_OFFSET_ENTITY, depthOffset).catch(() => undefined)
  }, [])

  const exportHaConfig = useCallback(() => {
    exportHaConfigFile()
  }, [])

  const autoMapEntities = useCallback(() => {
    const next = { ...entityMapRef.current }
    const used = new Set(Object.values(next))
    let added = 0
    for (const shade of shadesRef.current) {
      if (next[shade.id]) continue
      const suggestion = suggestCover(
        shade,
        coversRef.current.filter((c) => !used.has(c.entityId)),
      )
      if (!suggestion) continue
      next[shade.id] = suggestion
      used.add(suggestion)
      added += 1
    }
    saveShadeEntityMap(next)
    setEntityMap(next)
    return added
  }, [])

  const autoMapEnergy = useCallback(() => {
    const next = { ...energyMapRef.current }
    let added = 0
    const used = () =>
      [
        next.pvOnlyProduction,
        next.pvOnlyLoad,
        next.pvOnlyGrid,
        next.pvOnlyMonthEnergy,
        next.pvOnlyTodayEnergy,
        next.pvOnlyLifetimeEnergy,
      ].filter(Boolean) as string[]

    const alsoEnergy = matchAlsoEnergyPvSensors(sensorsRef.current)
    if (alsoEnergy.production || alsoEnergy.today || alsoEnergy.month || alsoEnergy.lifetime) {
      if (alsoEnergy.production && next.pvOnlyProduction !== alsoEnergy.production) {
        next.pvOnlyProduction = alsoEnergy.production
        added += 1
      }
      if (alsoEnergy.today && next.pvOnlyTodayEnergy !== alsoEnergy.today) {
        next.pvOnlyTodayEnergy = alsoEnergy.today
        added += 1
      }
      if (alsoEnergy.month && next.pvOnlyMonthEnergy !== alsoEnergy.month) {
        next.pvOnlyMonthEnergy = alsoEnergy.month
        added += 1
      }
      if (alsoEnergy.lifetime && next.pvOnlyLifetimeEnergy !== alsoEnergy.lifetime) {
        next.pvOnlyLifetimeEnergy = alsoEnergy.lifetime
        added += 1
      }
      if (next.pvOnlyLoad || next.pvOnlyGrid) {
        next.pvOnlyLoad = null
        next.pvOnlyGrid = null
        added += 1
      }
    } else {
      if (!next.pvOnlyProduction) {
        const id = suggestPvSensor(sensorsRef.current, used())
        if (id) {
          next.pvOnlyProduction = id
          added += 1
        }
      }
      if (!next.pvOnlyTodayEnergy) {
        const today = sensorsRef.current.find((s) =>
          /energy_produced_today|produced_today/.test(s.entityId),
        )
        if (today) {
          next.pvOnlyTodayEnergy = today.entityId
          added += 1
        }
      }
      if (!next.pvOnlyMonthEnergy) {
        const month = sensorsRef.current.find((s) =>
          /energy_produced_this_month|this_month/.test(s.entityId),
        )
        if (month) {
          next.pvOnlyMonthEnergy = month.entityId
          added += 1
        }
      }
      if (!next.pvOnlyLifetimeEnergy) {
        const lifetime = sensorsRef.current.find((s) =>
          /lifetime_energy_produced|lifetime_energy/.test(s.entityId),
        )
        if (lifetime) {
          next.pvOnlyLifetimeEnergy = lifetime.entityId
          added += 1
        }
      }
    }
    saveEnergyEntityMap(next)
    setEnergyMap(next)
    return added
  }, [])

  // Auto-map when empty.
  useEffect(() => {
    if (connectionStatus !== 'connected' || sensors.length === 0) return
    if (energyMapCount(energyMapRef.current) > 0) return
    autoMapEnergy()
  }, [connectionStatus, sensors, autoMapEnergy])

  const setShadePosition = useCallback(
    (id: string, position: number) => {
      const next = clampPosition(position)
      setShades((prev) =>
        prev.map((shade) => (shade.id === id ? { ...shade, position: next } : shade)),
      )

      const entityId = entityMapRef.current[id]
      const client = clientRef.current
      if (!entityId || !client) return

      void (async () => {
        try {
          if (next <= 0) await client.openCover(entityId)
          else if (next >= 100) await client.closeCover(entityId)
          else await client.setCoverClosedPercent(entityId, next)
          logControl(client, {
            actor: 'ui',
            action: 'shade.set_position',
            entityId,
            detail: { shadeId: id, closedPercent: next },
          })
          await syncFromHa()
        } catch (err) {
          logControl(client, {
            actor: 'ui',
            action: 'shade.set_position',
            entityId,
            detail: { shadeId: id, closedPercent: next },
            ok: false,
          })
          setConnectionError(err instanceof Error ? err.message : 'Failed to set shade')
          await syncFromHa().catch(() => undefined)
        }
      })()
    },
    [syncFromHa],
  )

  const setPoolLights = useCallback(
    async (on: boolean) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')

      const entityIds = discoverPoolSamLightEntityIds(statesRef.current)
      if (entityIds.length === 0) return

      const isConfirmed = () => {
        const values = entityIds.map((entityId) => entityIsOn(statesRef.current, entityId))
        if (values.some((value) => value == null)) return false
        return on ? values.every((value) => value === true) : values.every((value) => value === false)
      }

      try {
        await Promise.all(entityIds.map((entityId) => client.setLight(entityId, on)))
        const confirmed = await pollUntilToggleConfirmed(isConfirmed)
        if (!confirmed) {
          throw new Error('Pool lights did not confirm — try again')
        }
        logControl(client, {
          actor: 'ui',
          action: on ? 'light.turn_on' : 'light.turn_off',
          entityId: entityIds.join(','),
          detail: { label: 'Pool lights', count: entityIds.length },
        })
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: on ? 'light.turn_on' : 'light.turn_off',
          entityId: entityIds.join(','),
          detail: { label: 'Pool lights' },
          ok: false,
        })
        void syncFromHa().catch(() => undefined)
        setConnectionError(err instanceof Error ? err.message : 'Failed to set pool lights')
        throw err
      }
    },
    [pollUntilToggleConfirmed, syncFromHa],
  )

  const setPondFill = useCallback(
    async (on: boolean) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')

      const entityId = discoverPondFillEntityId(statesRef.current)
      if (!entityId) throw new Error('Pond fill valve not found')

      try {
        if (entityId.startsWith('valve.')) {
          await client.setValve(entityId, on)
        } else {
          await client.setSwitch(entityId, on)
        }
        const confirmed = await pollUntilToggleConfirmed(
          () => pondFillIsOn(statesRef.current, entityId) === on,
        )
        if (!confirmed) {
          throw new Error('Pond fill did not confirm — try again')
        }
        logControl(client, {
          actor: 'ui',
          action: entityId.startsWith('valve.')
            ? on
              ? 'valve.open_valve'
              : 'valve.close_valve'
            : on
              ? 'switch.turn_on'
              : 'switch.turn_off',
          entityId,
          detail: { label: 'Pond fill' },
        })
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: entityId.startsWith('valve.')
            ? on
              ? 'valve.open_valve'
              : 'valve.close_valve'
            : on
              ? 'switch.turn_on'
              : 'switch.turn_off',
          entityId,
          detail: { label: 'Pond fill' },
          ok: false,
        })
        void syncFromHa().catch(() => undefined)
        setConnectionError(err instanceof Error ? err.message : 'Failed to set pond fill')
        throw err
      }
    },
    [pollUntilToggleConfirmed, syncFromHa],
  )

  const setCrestronPower = useCallback(
    async (on: boolean) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')
      const action = on ? 'switch.turn_on' : 'switch.turn_off'
      try {
        await client.setSwitch(CRESTRON_POWER_SWITCH, on)
        const confirmed = await pollUntilToggleConfirmed(
          () => crestronPowerFromStates(statesRef.current).on === on,
        )
        if (!confirmed) throw new Error('Crestron controller power did not confirm — try again')
        logControl(client, {
          actor: 'ui',
          action,
          entityId: CRESTRON_POWER_SWITCH,
          detail: { label: 'Crestron controller power' },
        })
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action,
          entityId: CRESTRON_POWER_SWITCH,
          detail: { label: 'Crestron controller power' },
          ok: false,
        })
        void syncFromHa().catch(() => undefined)
        setConnectionError(
          err instanceof Error ? err.message : 'Failed to set Crestron controller power',
        )
        throw err
      }
    },
    [pollUntilToggleConfirmed, syncFromHa],
  )

  const clearPondFillError = useCallback(async () => {
    const client = clientRef.current
    if (!client) throw new Error('Not connected to Home Assistant')
    setPond((prev) => ({ ...prev, fillError: false }))
    try {
      await client.callService('input_boolean', 'turn_off', [POND_FILL_ERROR_ENTITY])
      logControl(client, {
        actor: 'ui',
        action: 'pond_fill.clear_error',
        entityId: POND_FILL_ERROR_ENTITY,
        detail: { label: 'Pond fill error' },
      })
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Failed to clear pond fill error')
    }
    await syncFromHa().catch(() => undefined)
  }, [syncFromHa])

  const setBallFountainFill = useCallback(
    async (on: boolean) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')
      const entityId = BALL_FOUNTAIN_FILL_VALVE_ENTITY
      const action = on ? 'valve.open_valve' : 'valve.close_valve'
      try {
        await client.setValve(entityId, on)
        const confirmed = await pollUntilToggleConfirmed(
          () => pondFillIsOn(statesRef.current, entityId) === on,
        )
        if (!confirmed) throw new Error('Ball fountain fill did not confirm — try again')
        logControl(client, { actor: 'ui', action, entityId, detail: { label: 'Ball fountain fill' } })
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action,
          entityId,
          detail: { label: 'Ball fountain fill' },
          ok: false,
        })
        void syncFromHa().catch(() => undefined)
        setConnectionError(err instanceof Error ? err.message : 'Failed to set Ball fountain fill')
        throw err
      }
    },
    [pollUntilToggleConfirmed, syncFromHa],
  )

  const clearBallFountainFillError = useCallback(async () => {
    const client = clientRef.current
    if (!client) throw new Error('Not connected to Home Assistant')
    setBallFountain((prev) => ({ ...prev, fillError: false }))
    try {
      await client.callService('input_boolean', 'turn_off', [BALL_FOUNTAIN_FILL_ERROR_ENTITY])
      logControl(client, {
        actor: 'ui',
        action: 'ball_fountain_fill.clear_error',
        entityId: BALL_FOUNTAIN_FILL_ERROR_ENTITY,
        detail: { label: 'Ball fountain fill error' },
      })
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : 'Failed to clear Ball fountain fill error',
      )
    }
    await syncFromHa().catch(() => undefined)
  }, [syncFromHa])

  const setBallFountainSettings = useCallback(
    async (patch: Partial<BallFountainSettings>) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')
      const inches = (value: number, fallback: number, min: number, max: number) =>
        Math.max(min, Math.min(max, Math.round((Number.isFinite(value) ? value : fallback) * 10) / 10))
      const next: Partial<BallFountainSettings> = { ...patch }
      if (next.fillLowInches !== undefined) next.fillLowInches = inches(next.fillLowInches, -1, -50, 50)
      if (next.fillFullInches !== undefined) next.fillFullInches = inches(next.fillFullInches, 0, -50, 50)
      if (next.offsetInches !== undefined) next.offsetInches = inches(next.offsetInches, 0, -100, 200)
      setBallFountain((prev) => ({ ...prev, ...next }))
      const writes: Promise<unknown>[] = []
      if (next.fillAutoEnabled !== undefined) {
        writes.push(client.setInputBoolean(BALL_FOUNTAIN_FILL_AUTO_ENABLED_ENTITY, next.fillAutoEnabled))
      }
      if (next.fillLowInches !== undefined) {
        writes.push(client.setNumber(BALL_FOUNTAIN_FILL_LOW_INCHES_ENTITY, next.fillLowInches))
      }
      if (next.fillFullInches !== undefined) {
        writes.push(client.setNumber(BALL_FOUNTAIN_FILL_FULL_INCHES_ENTITY, next.fillFullInches))
      }
      if (next.offsetInches !== undefined) {
        writes.push(client.setNumber(BALL_FOUNTAIN_OFFSET_ENTITY, next.offsetInches))
      }
      try {
        await Promise.all(writes)
      } catch (err) {
        setConnectionError(
          err instanceof Error ? err.message : 'Failed to save Ball fountain settings',
        )
      }
      await syncFromHa().catch(() => undefined)
    },
    [syncFromHa],
  )

  const setCrestronPowerCycleEnabled = useCallback(
    async (enabled: boolean) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')
      setCrestronPowerSnap((prev) => ({ ...prev, cycleEnabled: enabled }))
      try {
        await client.callService(
          'input_boolean',
          enabled ? 'turn_on' : 'turn_off',
          [CRESTRON_POWER_CYCLE_ENABLED],
        )
      } catch (err) {
        setConnectionError(
          err instanceof Error ? err.message : 'Failed to save Crestron auto power-cycle',
        )
      }
      await syncFromHa().catch(() => undefined)
    },
    [syncFromHa],
  )

  const setCrestronPowerCycleMinutes = useCallback(
    async (minutes: number) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')
      const next = Math.max(
        1,
        Math.min(240, Math.round(Number(minutes) || DEFAULT_CRESTRON_POWER_CYCLE_MINUTES)),
      )
      setCrestronPowerSnap((prev) => ({ ...prev, cycleMinutes: next }))
      try {
        await client.callService('input_number', 'set_value', [CRESTRON_POWER_CYCLE_MINUTES], {
          value: next,
        })
      } catch (err) {
        setConnectionError(
          err instanceof Error ? err.message : 'Failed to save Crestron power-cycle minutes',
        )
      }
      await syncFromHa().catch(() => undefined)
    },
    [syncFromHa],
  )

  const turnPoolPumpOn = useCallback(async () => {
    const client = clientRef.current
    if (!client) throw new Error('Not connected to Home Assistant')

    const entityId = discoverPoolCircuitSwitchId(statesRef.current)
    try {
      await client.setSwitch(entityId, true)
      logControl(client, {
        actor: 'ui',
        action: 'switch.turn_on',
        entityId,
        detail: { label: 'Pool circuit', reason: 'pump_off' },
      })
      const confirmed = await pollUntilToggleConfirmed(
        () => entityIsOn(statesRef.current, entityId) === true,
      )
      if (!confirmed) {
        await syncFromHa().catch(() => undefined)
      } else {
        await syncFromHa()
      }
    } catch (err) {
      logControl(client, {
        actor: 'ui',
        action: 'switch.turn_on',
        entityId,
        detail: { label: 'Pool circuit', reason: 'pump_off' },
        ok: false,
      })
      void syncFromHa().catch(() => undefined)
      setConnectionError(err instanceof Error ? err.message : 'Failed to turn on pool pump')
      throw err
    }
  }, [pollUntilToggleConfirmed, syncFromHa])

  const setThermostatMode = useCallback(
    async (entityId: string, mode: string) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')

      try {
        if (mode === 'eco') {
          await client.setClimatePreset(entityId, 'eco')
          logControl(client, {
            actor: 'ui',
            action: 'climate.set_preset_mode',
            entityId,
            detail: { preset_mode: 'eco' },
          })
          await syncFromHa()
          return
        }
        const current = statesRef.current.find((state) => state.entity_id === entityId)
        if (current?.attributes.preset_mode === 'eco') {
          await client.setClimatePreset(entityId, 'none')
        }
        await client.setClimateMode(entityId, mode)
        logControl(client, {
          actor: 'ui',
          action: 'climate.set_hvac_mode',
          entityId,
          detail: { mode },
        })
        await syncFromHa()
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: 'climate.set_hvac_mode',
          entityId,
          detail: { mode },
          ok: false,
        })
        void syncFromHa().catch(() => undefined)
        setConnectionError(err instanceof Error ? err.message : 'Failed to set thermostat mode')
        throw err
      }
    },
    [syncFromHa],
  )

  const setThermostatSetpoint = useCallback(
    async (entityId: string, temperature: number) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')

      try {
        const current = statesRef.current.find((state) => state.entity_id === entityId)
        if (current?.attributes.preset_mode === 'eco') {
          // Nest accepts but silently ignores setpoint changes while in Eco.
          await client.setClimatePreset(entityId, 'none')
          logControl(client, {
            actor: 'ui',
            action: 'climate.set_preset_mode',
            entityId,
            detail: { preset_mode: 'none', reason: 'setpoint change' },
          })
        }
        await client.setClimateTemperature(entityId, temperature)
        await syncFromHa()
      } catch (err) {
        void syncFromHa().catch(() => undefined)
        setConnectionError(err instanceof Error ? err.message : 'Failed to set thermostat temperature')
        throw err
      }
    },
    [syncFromHa],
  )

  const setOutsideTransformer = useCallback(
    async (key: OutsideControlKey, on: boolean) => {
      const transformer = outsideTransformersRef.current.find((item) =>
        item.controls.some((control) => control.key === key),
      )
      const control = transformer?.controls.find((item) => item.key === key)
      const client = clientRef.current
      const entityId = control?.entityId
      const entityIds = control?.entityIds ?? (entityId ? [entityId] : [])
      if (!client || !transformer || !control || entityIds.length === 0) return

      const isConfirmed = () => entitiesCombinedOn(statesRef.current, entityIds) === on

      try {
        await Promise.all(
          entityIds.map((id) => {
            if (control.domain !== 'light') {
              return client.setSwitch(id, on)
            }
            const brightness =
              on && control.dimmable ? control.brightness ?? null : null
            return client.setLight(
              id,
              on,
              brightness != null ? { brightness } : undefined,
            )
          }),
        )
        await pollUntilToggleConfirmed(isConfirmed)
        logControl(client, {
          actor: 'ui',
          action: on ? `${control.domain}.turn_on` : `${control.domain}.turn_off`,
          entityId: entityIds.join(','),
          detail: { label: control.label, key },
        })
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: on ? `${control.domain}.turn_on` : `${control.domain}.turn_off`,
          entityId: entityIds.join(','),
          detail: { label: control.label, key },
          ok: false,
        })
        void syncFromHa().catch(() => undefined)
        setConnectionError(
          err instanceof Error ? err.message : `Failed to set ${control.label}`,
        )
        throw err
      }
    },
    [pollUntilToggleConfirmed, syncFromHa],
  )

  const setMainGarageDoor = useCallback(
    async (open: boolean) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')

      const isConfirmed = () => garageIsOpen(statesRef.current, MAIN_GARAGE) === open

      try {
        await client.toggleCover(MAIN_GARAGE.cover)
        await pollUntilToggleConfirmed(isConfirmed)
        logControl(client, {
          actor: 'ui',
          action: 'cover.toggle',
          entityId: MAIN_GARAGE.cover,
          detail: { label: 'Main garage', open },
        })
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: 'cover.toggle',
          entityId: MAIN_GARAGE.cover,
          detail: { label: 'Main garage', open },
          ok: false,
        })
        void syncFromHa().catch(() => undefined)
        setConnectionError(err instanceof Error ? err.message : 'Failed to toggle garage door')
        throw err
      }
    },
    [pollUntilToggleConfirmed, syncFromHa],
  )

  const setWorkshopGarageDoor = useCallback(
    async (open: boolean) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')

      const isConfirmed = () => garageIsOpen(statesRef.current, WORKSHOP_GARAGE) === open

      try {
        await client.toggleCover(WORKSHOP_GARAGE.cover)
        await pollUntilToggleConfirmed(isConfirmed)
        logControl(client, {
          actor: 'ui',
          action: 'cover.toggle',
          entityId: WORKSHOP_GARAGE.cover,
          detail: { label: 'Workshop garage', open },
        })
        await syncFromHa()
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: 'cover.toggle',
          entityId: WORKSHOP_GARAGE.cover,
          detail: { label: 'Workshop garage', open },
          ok: false,
        })
        void syncFromHa().catch(() => undefined)
        setConnectionError(
          err instanceof Error ? err.message : 'Failed to toggle workshop garage door',
        )
        throw err
      }
    },
    [pollUntilToggleConfirmed, syncFromHa],
  )

  const setGateOpen = useCallback(
    async (open: boolean) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')

      if (gateIsOpen(statesRef.current) === open) return

      const isConfirmed = () => gateIsOpen(statesRef.current) === open

      try {
        await client.pressButton(GATE_RELAY_BUTTON)
        await pollUntilToggleConfirmed(
          isConfirmed,
          open ? GATE_OPEN_PENDING_MS : GATE_CLOSE_PENDING_MS,
        )
        logControl(client, {
          actor: 'ui',
          action: 'button.press',
          entityId: GATE_RELAY_BUTTON,
          detail: { label: 'Driveway gate', open },
        })
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: 'button.press',
          entityId: GATE_RELAY_BUTTON,
          detail: { label: 'Driveway gate', open },
          ok: false,
        })
        void syncFromHa().catch(() => undefined)
        setConnectionError(err instanceof Error ? err.message : 'Failed to toggle driveway gate')
        throw err
      }
    },
    [pollUntilToggleConfirmed, syncFromHa],
  )

  const setOutsideTransformerBrightness = useCallback(
    (key: OutsideControlKey, percent: number) => {
      const transformer = outsideTransformersRef.current.find((item) =>
        item.controls.some((control) => control.key === key),
      )
      const control = transformer?.controls.find((item) => item.key === key)
      const client = clientRef.current
      const entityId = control?.entityId
      if (!client || !transformer || !control || !entityId || !control.dimmable) return

      const brightness = Math.max(1, Math.min(100, Math.round(percent))) * 255 / 100
      outsideBrightnessSetAtRef.current[key] = Date.now()
      setOutsideTransformers((current) =>
        current.map((item) =>
          item.key !== transformer.key
            ? item
            : {
                ...item,
                controls: item.controls.map((entry) =>
                  entry.key === key
                    ? { ...entry, brightness: Math.round(brightness) }
                    : entry,
                ),
              },
        ),
      )
      void (async () => {
        try {
          await client.setLightBrightness(entityId, percent)
        } catch (err) {
          setConnectionError(
            err instanceof Error ? err.message : `Failed to dim ${control.label}`,
          )
          await syncFromHa().catch(() => undefined)
        }
      })()
    },
    [syncFromHa],
  )

  const setDesiredOutsideMode = useCallback(
    (mode: OutsideMode) => {
      const client = clientRef.current
      if (!client) return
      const currentMode = outsideModeFromStates(statesRef.current)
      setOutsideMode(mode)

      const modeScripts: Record<OutsideMode, string> = {
        None: 'script.outside_lights_all_off',
        Normal: 'script.outside_lights_normal_on',
        Guest: 'script.outside_lights_guest_on',
      }

      void (async () => {
        try {
          if (currentMode === mode) {
            // Re-apply the scene when the mode is already selected (input_select
            // will not fire a state change, so automation would not run).
            await client.runScript(modeScripts[mode])
            logControl(client, {
              actor: 'ui',
              action: 'script.turn_on',
              entityId: modeScripts[mode],
              detail: { mode, reason: 'reapply' },
            })
          } else {
            await client.setSelect(OUTSIDE_LIGHTS_MODE_ENTITY, mode)
            logControl(client, {
              actor: 'ui',
              action: 'input_select.select_option',
              entityId: OUTSIDE_LIGHTS_MODE_ENTITY,
              detail: { mode },
            })
          }
          await syncFromHa()
        } catch (err) {
          logControl(client, {
            actor: 'ui',
            action:
              currentMode === mode ? 'script.turn_on' : 'input_select.select_option',
            entityId: currentMode === mode ? modeScripts[mode] : OUTSIDE_LIGHTS_MODE_ENTITY,
            detail: { mode },
            ok: false,
          })
          setConnectionError(
            err instanceof Error ? err.message : 'Failed to set Outside lights mode',
          )
          await syncFromHa().catch(() => undefined)
        }
      })()
    },
    [syncFromHa],
  )

  const setCrestronLight = useCallback(
    async (entityId: string, on: boolean) => {
      const client = clientRef.current
      if (!client) return
      const light = crestronLightsRef.current.find((item) => item.entityId === entityId)
      const isConfirmed = () => entityIsOn(statesRef.current, entityId) === on

      try {
        if (light?.domain === 'fan') {
          await client.setFan(entityId, on)
        } else if (light?.domain === 'switch') {
          await client.setSwitch(entityId, on)
        } else {
          const brightness =
            on && light?.dimmable ? light.brightness ?? null : null
          await client.setLight(
            entityId,
            on,
            brightness != null ? { brightness } : undefined,
          )
        }
        await pollUntilCrestronToggleConfirmed(isConfirmed)
        logControl(client, {
          actor: 'ui',
          action: on ? 'light.turn_on' : 'light.turn_off',
          entityId,
          detail: { label: light?.name ?? entityId, domain: light?.domain },
        })
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: on ? 'light.turn_on' : 'light.turn_off',
          entityId,
          detail: { label: light?.name ?? entityId, domain: light?.domain },
          ok: false,
        })
        void syncCrestronFromHa().catch(() => undefined)
        setConnectionError(
          err instanceof Error ? err.message : `Failed to set ${light?.name ?? entityId}`,
        )
        throw err
      }
    },
    [pollUntilCrestronToggleConfirmed, syncCrestronFromHa],
  )

  const setCrestronLightBrightness = useCallback(
    (entityId: string, percent: number) => {
      const client = clientRef.current
      const light = crestronLightsRef.current.find((item) => item.entityId === entityId)
      if (!client || !light || !light.dimmable) return

      const brightness = Math.max(1, Math.min(100, Math.round(percent))) * 255 / 100
      setCrestronLights((current) =>
        current.map((item) =>
          item.entityId === entityId
            ? { ...item, brightness: Math.round(brightness) }
            : item,
        ),
      )
      void (async () => {
        try {
          await client.setLightBrightness(entityId, percent)
          await syncFromHa()
        } catch (err) {
          setConnectionError(
            err instanceof Error ? err.message : `Failed to dim ${light.name}`,
          )
          await syncFromHa().catch(() => undefined)
        }
      })()
    },
    [syncFromHa],
  )

  const setCrestronLightRoom = useCallback(
    (entityId: string, room: string) => {
      const normalizedRoom = room.trim() || UNASSIGNED_ROOM_KEY
      const nextMap = { ...crestronLightRoomsRef.current, [entityId]: normalizedRoom }
      crestronLightRoomsRef.current = nextMap
      setCrestronLightRooms(nextMap)
      setCrestronLights((previousLights) => {
        const previous = new Map(previousLights.map((light) => [light.entityId, light]))
        return crestronLightsFromStates(
          statesRef.current,
          entityRegistryRef.current,
          nextMap,
        ).map((light) => ({
          ...light,
          brightness: light.brightness ?? previous.get(light.entityId)?.brightness ?? null,
        }))
      })
      saveCrestronLightRoomMap(nextMap)

      const client = clientRef.current
      if (!client) return
      void (async () => {
        try {
          await client.persistCrestronLightRoom(entityId, normalizedRoom)
        } catch (err) {
          setConnectionError(
            err instanceof Error ? err.message : `Failed to save room for ${entityId}`,
          )
        }
      })()
    },
    [],
  )

  const toggleReceiver = useCallback(async () => {
    const client = clientRef.current
    const entityId = receiver.entityId
    if (!client || !entityId) return
    const nextOn = !receiver.on
    try {
      if (nextOn) await client.mediaPlayerTurnOn(entityId)
      else await client.mediaPlayerTurnOff(entityId)
      setReceiver((prev) => ({ ...prev, on: nextOn }))
      logControl(client, {
        actor: 'ui',
        action: nextOn ? 'media_player.turn_on' : 'media_player.turn_off',
        entityId,
        detail: { label: receiver.label },
      })
      await syncFromHa()
    } catch (err) {
      logControl(client, {
        actor: 'ui',
        action: nextOn ? 'media_player.turn_on' : 'media_player.turn_off',
        entityId,
        detail: { label: receiver.label },
        ok: false,
      })
      setConnectionError(err instanceof Error ? err.message : 'Failed to toggle TV receiver')
      await syncFromHa().catch(() => undefined)
    }
  }, [receiver.entityId, receiver.label, receiver.on, syncFromHa])

  const selectReceiverSource = useCallback(
    async (source: string) => {
      const client = clientRef.current
      const entityId = receiver.entityId
      const next = source.trim()
      if (!client || !entityId || !next) return
      try {
        await client.selectMediaSource(entityId, next)
        logControl(client, {
          actor: 'ui',
          action: 'media_player.select_source',
          entityId,
          detail: { label: receiver.label, source: next },
        })
        setReceiver((prev) => ({
          ...prev,
          on: true,
          source: next,
          sources: prev.sources.includes(next) ? prev.sources : [next, ...prev.sources],
        }))
        await syncFromHa()
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: 'media_player.select_source',
          entityId,
          detail: { label: receiver.label, source: next },
          ok: false,
        })
        setConnectionError(err instanceof Error ? err.message : 'Failed to change TV receiver source')
        await syncFromHa().catch(() => undefined)
      }
    },
    [receiver.entityId, receiver.label, syncFromHa],
  )

  const setReceiverVolume = useCallback(
    async (volumePercent: number) => {
      const client = clientRef.current
      const entityId = receiver.entityId
      if (!client || !entityId) return
      const next = Math.max(0, Math.min(100, Math.round(volumePercent)))
      setReceiver((prev) => ({ ...prev, volumePercent: next, muted: false }))
      try {
        await client.setMediaVolume(entityId, next)
        logControl(client, {
          actor: 'ui',
          action: 'media_player.volume_set',
          entityId,
          detail: { label: receiver.label, volumePercent: next },
        })
        await syncFromHa()
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: 'media_player.volume_set',
          entityId,
          detail: { label: receiver.label, volumePercent: next },
          ok: false,
        })
        setConnectionError(err instanceof Error ? err.message : 'Failed to set TV receiver volume')
        await syncFromHa().catch(() => undefined)
      }
    },
    [receiver.entityId, receiver.label, syncFromHa],
  )

  /** When Family Room Sonos plays: power on + CD. When it stops: TV Audio then off. */
  const syncReceiverWithFamilyRoomSonos = useCallback(
    async (mode: 'play' | 'stop') => {
      const client = clientRef.current
      const entityId = receiver.entityId
      if (!client || !entityId || !receiver.available) return

      const source = mode === 'play' ? RECEIVER_SOURCE_SONOS : RECEIVER_SOURCE_TV
      try {
        if (mode === 'play' && !receiver.on) {
          await client.mediaPlayerTurnOn(entityId)
          logControl(client, {
            actor: 'ui',
            action: 'media_player.turn_on',
            entityId,
            detail: { label: receiver.label, reason: 'family_room_sonos_play' },
          })
        }
        await client.selectMediaSource(entityId, source)
        logControl(client, {
          actor: 'ui',
          action: 'media_player.select_source',
          entityId,
          detail: {
            label: receiver.label,
            source,
            reason: mode === 'play' ? 'family_room_sonos_play' : 'family_room_sonos_stop',
          },
        })
        if (mode === 'stop') {
          await client.mediaPlayerTurnOff(entityId)
          logControl(client, {
            actor: 'ui',
            action: 'media_player.turn_off',
            entityId,
            detail: { label: receiver.label, reason: 'family_room_sonos_stop' },
          })
        }
        setReceiver((prev) => ({
          ...prev,
          on: mode === 'play',
          source,
          sources: prev.sources.includes(source) ? prev.sources : [source, ...prev.sources],
        }))
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: mode === 'stop' ? 'media_player.turn_off' : 'media_player.select_source',
          entityId,
          detail: { label: receiver.label, source, reason: 'family_room_sonos' },
          ok: false,
        })
        setConnectionError(
          err instanceof Error ? err.message : 'Failed to sync TV receiver with Family Room Sonos',
        )
      }
    },
    [receiver.available, receiver.entityId, receiver.label, receiver.on],
  )

  const stopAllSonos = useCallback(async () => {
    const client = clientRef.current
    if (!client) return
    const targets = sonosStopTargets(audio)
    if (targets.length === 0) return
    const stoppingFamilyRoom = targets.some((entityId) => {
      const unit = audio.units.find((entry) => entry.entityId === entityId)
      return isFamilyRoomSonos(entityId, unit?.label)
    })
    try {
      await client.mediaStop(targets)
      logControl(client, {
        actor: 'ui',
        action: 'media_player.media_stop',
        entityId: targets.join(','),
        detail: { label: 'Stop all Sonos', count: targets.length },
      })
      if (stoppingFamilyRoom) await syncReceiverWithFamilyRoomSonos('stop')
      await syncFromHa()
    } catch (err) {
      logControl(client, {
        actor: 'ui',
        action: 'media_player.media_stop',
        entityId: targets.join(','),
        detail: { label: 'Stop all Sonos' },
        ok: false,
      })
      setConnectionError(err instanceof Error ? err.message : 'Failed to stop Sonos')
    }
  }, [audio, syncFromHa, syncReceiverWithFamilyRoomSonos])

  const playSonos = useCallback(
    async (entityId: string) => {
      const client = clientRef.current
      const unit = audio.units.find((entry) => entry.entityId === entityId)
      if (!client || !unit) return

      const familyRoom = isFamilyRoomSonos(entityId, unit.label)
      // Start Marantz early so CD path is ready while Sonos spins up.
      if (familyRoom) void syncReceiverWithFamilyRoomSonos('play')

      const favorite = pickSonosFavorite(unit)
      try {
        // Some Sonos units return HTTP 500 on media_play while paused; select_source
        // with a favorite is reliable. Idle with an empty queue also needs a favorite.
        let usedSource: string | undefined
        if (unit.paused || unit.playing) {
          try {
            await client.mediaPlay(entityId)
          } catch {
            if (!favorite) throw new Error(`Resume failed for ${unit.label}`)
            await client.selectMediaSource(entityId, favorite)
            usedSource = favorite
          }
        } else if (favorite) {
          await client.selectMediaSource(entityId, favorite)
          usedSource = favorite
          try {
            await client.mediaPlay(entityId)
          } catch {
            /* select_source often already started playback */
          }
        } else {
          await client.mediaPlay(entityId)
        }

        logControl(client, {
          actor: 'ui',
          action: usedSource ? 'media_player.select_source' : 'media_player.media_play',
          entityId,
          detail: { label: unit.label, source: usedSource },
        })
        await syncFromHa()
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: 'media_player.media_play',
          entityId,
          detail: { label: unit.label },
          ok: false,
        })
        setConnectionError(err instanceof Error ? err.message : 'Failed to play Sonos')
        await syncFromHa().catch(() => undefined)
      }
    },
    [audio.units, syncFromHa, syncReceiverWithFamilyRoomSonos],
  )

  const stopSonos = useCallback(
    async (entityId: string) => {
      const client = clientRef.current
      const unit = audio.units.find((entry) => entry.entityId === entityId)
      if (!client || !unit) return
      try {
        await client.mediaStop(entityId)
        logControl(client, {
          actor: 'ui',
          action: 'media_player.media_stop',
          entityId,
        })
        if (isFamilyRoomSonos(entityId, unit.label)) {
          void syncReceiverWithFamilyRoomSonos('stop')
        }
        await syncFromHa()
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: 'media_player.media_stop',
          entityId,
          ok: false,
        })
        setConnectionError(err instanceof Error ? err.message : 'Failed to stop Sonos')
        await syncFromHa().catch(() => undefined)
      }
    },
    [audio.units, syncFromHa, syncReceiverWithFamilyRoomSonos],
  )

  const setSonosVolume = useCallback(
    async (entityId: string, volumePercent: number) => {
      const client = clientRef.current
      if (!client || !audio.units.some((unit) => unit.entityId === entityId)) return
      setAudio((prev) => ({
        ...prev,
        units: prev.units.map((unit) =>
          unit.entityId === entityId
            ? { ...unit, volumePercent: Math.max(0, Math.min(100, Math.round(volumePercent))) }
            : unit,
        ),
      }))
      try {
        await client.setMediaVolume(entityId, volumePercent)
        await syncFromHa()
      } catch (err) {
        setConnectionError(err instanceof Error ? err.message : 'Failed to set Sonos volume')
      }
    },
    [audio.units, syncFromHa],
  )

  const selectSonosSource = useCallback(
    async (entityId: string, source: string) => {
      const client = clientRef.current
      const unit = audio.units.find((entry) => entry.entityId === entityId)
      if (!client || !unit || !source.trim()) return
      try {
        await client.selectMediaSource(entityId, source.trim())
        logControl(client, {
          actor: 'ui',
          action: 'media_player.select_source',
          entityId,
          detail: { source: source.trim() },
        })
        setAudio((prev) => ({
          ...prev,
          units: prev.units.map((entry) =>
            entry.entityId === entityId
              ? { ...entry, source: source.trim(), station: source.trim() }
              : entry,
          ),
        }))
        if (isFamilyRoomSonos(entityId, unit.label)) {
          void syncReceiverWithFamilyRoomSonos('play')
        }
        await syncFromHa()
      } catch (err) {
        setConnectionError(err instanceof Error ? err.message : 'Failed to select Sonos source')
        await syncFromHa().catch(() => undefined)
      }
    },
    [audio.units, syncFromHa, syncReceiverWithFamilyRoomSonos],
  )

  const activateCrestronScene = useCallback(
    (entityId: string) => {
      const client = clientRef.current
      if (!client || !crestronScenes.some((scene) => scene.entityId === entityId)) return
      void (async () => {
        try {
          await client.activateScene(entityId)
          logControl(client, {
            actor: 'ui',
            action: 'scene.turn_on',
            entityId,
          })
          await syncFromHa()
        } catch (err) {
          logControl(client, {
            actor: 'ui',
            action: 'scene.turn_on',
            entityId,
            ok: false,
          })
          setConnectionError(
            err instanceof Error ? err.message : 'Failed to activate Crestron scene',
          )
        }
      })()
    },
    [crestronScenes, syncFromHa],
  )

  const saveDashboardSettingsPatch = useCallback(
    (patch: Partial<DashboardSettings>, errorLabel: string) => {
      const client = clientRef.current
      if (!client) return
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        ...patch,
      }
      void persistDashboardSettingsPatch(client, patch).catch((err) => {
        setConnectionError(err instanceof Error ? err.message : errorLabel)
        void syncFromHa().catch(() => undefined)
      })
    },
    [syncFromHa],
  )

  const setPoolPumpOffEmailEnabled = useCallback(
    (enabled: boolean) => {
      setPoolPumpOffEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { poolPumpOffEmailEnabled: enabled },
        'Failed to save pool pump email preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDeviceCommFailureEmailEnabled = useCallback(
    (enabled: boolean) => {
      setDeviceCommFailureEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { deviceCommFailureEmailEnabled: enabled },
        'Failed to save device communication preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDeviceCommFailureMinutes = useCallback(
    (minutes: number) => {
      const next = Math.max(
        1,
        Math.min(1440, Math.round(Number(minutes) || DEFAULT_DEVICE_COMM_FAILURE_MINUTES)),
      )
      setDeviceCommFailureMinutesState(next)
      saveDashboardSettingsPatch(
        { deviceCommFailureMinutes: next },
        'Failed to save communication failure minutes',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDeviceCommNotifyEnabled = useCallback(
    (key: string, enabled: boolean) => {
      const id = String(key ?? '').trim()
      if (!id) return
      const prev = dashboardSettingsRef.current.deviceCommNotifyEnabled
      const next = { ...prev }
      if (enabled) {
        // Missing keys default to enabled — drop explicit true to keep the map sparse.
        delete next[id]
      } else {
        next[id] = false
      }
      setDeviceCommNotifyEnabledState(next)
      saveDashboardSettingsPatch(
        { deviceCommNotifyEnabled: next },
        'Failed to save device communication notify preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setCommandFailedEmailEnabled = useCallback(
    (enabled: boolean) => {
      setCommandFailedEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { commandFailedEmailEnabled: enabled },
        'Failed to save command-failed preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setInternetOutageEmailEnabled = useCallback(
    (enabled: boolean) => {
      setInternetOutageEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { internetOutageEmailEnabled: enabled },
        'Failed to save internet outage preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setInternetOutageMinutes = useCallback(
    (minutes: number) => {
      const next = Math.max(
        1,
        Math.min(1440, Math.round(Number(minutes) || DEFAULT_INTERNET_OUTAGE_MINUTES)),
      )
      setInternetOutageMinutesState(next)
      saveDashboardSettingsPatch(
        { internetOutageMinutes: next },
        'Failed to save internet outage minutes',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setNotifyEmailEnabled = useCallback(
    (enabled: boolean) => {
      setNotifyEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { notifyEmailEnabled: enabled },
        'Failed to save notify email preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setNotifyPhoneEnabled = useCallback(
    (enabled: boolean) => {
      setNotifyPhoneEnabledState(enabled)
      saveDashboardSettingsPatch(
        { notifyPhoneEnabled: enabled },
        'Failed to save notify phone preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setNotifyEmailOverride = useCallback(
    (email: string) => {
      const next = email.trim()
      setNotifyEmailOverrideState(next)
      saveDashboardSettingsPatch(
        { notifyEmailOverride: next },
        'Failed to save notify email override',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setNotifyPhoneTarget = useCallback(
    (target: string) => {
      const next = target.trim() || DEFAULT_PHONE_NOTIFY_ENTITY
      setNotifyPhoneTargetState(next)
      saveDashboardSettingsPatch(
        { notifyPhoneTarget: next },
        'Failed to save notify phone target',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setPoolLowWaterEmailEnabled = useCallback(
    (enabled: boolean) => {
      setPoolLowWaterEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { poolLowWaterEmailEnabled: enabled },
        'Failed to save pool low water preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setPoolLowWaterInches = useCallback(
    (inches: number) => {
      const next = Math.max(
        -50,
        Math.min(50, Math.round((Number(inches) || DEFAULT_POOL_LOW_WATER_INCHES) * 10) / 10),
      )
      setPoolLowWaterInchesState(next)
      saveDashboardSettingsPatch(
        { poolLowWaterInches: next },
        'Failed to save pool low water inches',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setPondLowWaterEmailEnabled = useCallback(
    (enabled: boolean) => {
      setPondLowWaterEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { pondLowWaterEmailEnabled: enabled },
        'Failed to save pond low water preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setPondLowWaterInches = useCallback(
    (inches: number) => {
      const next = Math.max(
        -50,
        Math.min(50, Math.round((Number(inches) || DEFAULT_POND_LOW_WATER_INCHES) * 10) / 10),
      )
      setPondLowWaterInchesState(next)
      saveDashboardSettingsPatch(
        { pondLowWaterInches: next },
        'Failed to save pond low water inches',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setCisternLowWaterEmailEnabled = useCallback(
    (enabled: boolean) => {
      setCisternLowWaterEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { cisternLowWaterEmailEnabled: enabled },
        'Failed to save cistern low water preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setCisternLowWaterPercent = useCallback(
    (percent: number) => {
      const next = Math.max(
        0,
        Math.min(100, Math.round(Number(percent) || DEFAULT_CISTERN_LOW_WATER_PERCENT)),
      )
      setCisternLowWaterPercentState(next)
      saveDashboardSettingsPatch(
        { cisternLowWaterPercent: next },
        'Failed to save cistern low water percent',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setPoolPumpAutoOnEnabled = useCallback(
    (enabled: boolean) => {
      setPoolPumpAutoOnEnabledState(enabled)
      saveDashboardSettingsPatch(
        { poolPumpAutoOnEnabled: enabled },
        'Failed to save pool pump auto-on preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setPoolPumpAutoOnMinutes = useCallback(
    (minutes: number) => {
      const next = Math.max(
        1,
        Math.min(1440, Math.round(Number(minutes) || DEFAULT_POOL_PUMP_AUTO_ON_MINUTES)),
      )
      setPoolPumpAutoOnMinutesState(next)
      saveDashboardSettingsPatch(
        { poolPumpAutoOnMinutes: next },
        'Failed to save pool pump auto-on minutes',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setBathroomFanAutoOffEnabled = useCallback(
    (enabled: boolean) => {
      setBathroomFanAutoOffEnabledState(enabled)
      saveDashboardSettingsPatch(
        { bathroomFanAutoOffEnabled: enabled },
        'Failed to save bathroom fan auto-off preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setBathroomFanAutoOffMinutes = useCallback(
    (minutes: number) => {
      const next = Math.max(
        1,
        Math.min(1440, Math.round(Number(minutes) || DEFAULT_BATHROOM_FAN_AUTO_OFF_MINUTES)),
      )
      setBathroomFanAutoOffMinutesState(next)
      saveDashboardSettingsPatch(
        { bathroomFanAutoOffMinutes: next },
        'Failed to save bathroom fan auto-off minutes',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setBathroomFanSlot = useCallback(
    (index: number, entityId: string) => {
      if (index < 0 || index >= BATHROOM_FAN_SLOT_COUNT) return
      setBathroomFanSlotsState((current) => {
        const next = [...current] as BathroomFanSlots
        next[index] = entityId.trim()
        const normalized = normalizeBathroomFanSlots(next)
        saveDashboardSettingsPatch(
          { bathroomFanSlots: normalized },
          'Failed to save bathroom fan mapping',
        )
        return normalized
      })
    },
    [saveDashboardSettingsPatch],
  )

  const setPondFillAutoEnabled = useCallback(
    (enabled: boolean) => {
      setPondFillAutoEnabledState(enabled)
      saveDashboardSettingsPatch(
        { pondFillAutoEnabled: enabled },
        'Failed to save pond fill auto preference',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setPondFillLowInches = useCallback(
    (inches: number) => {
      const next = Math.max(
        -50,
        Math.min(50, Math.round((Number(inches) || DEFAULT_POND_FILL_LOW_INCHES) * 10) / 10),
      )
      setPondFillLowInchesState(next)
      saveDashboardSettingsPatch(
        { pondFillLowInches: next },
        'Failed to save pond fill low inches',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setPondFillFullInches = useCallback(
    (inches: number) => {
      const next = Math.max(
        -50,
        Math.min(50, Math.round((Number(inches) || DEFAULT_POND_FILL_FULL_INCHES) * 10) / 10),
      )
      setPondFillFullInchesState(next)
      saveDashboardSettingsPatch(
        { pondFillFullInches: next },
        'Failed to save pond fill full inches',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDoorbellEmailEnabled = useCallback(
    (enabled: boolean) => {
      setDoorbellEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { doorbellEmailEnabled: enabled },
        'Failed to save doorbell alert setting',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDoorbellIconMinutes = useCallback(
    (minutes: number) => {
      const next = Math.max(1, Math.min(1440, Math.round(Number(minutes) || 5)))
      setDoorbellIconMinutesState(next)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        doorbellIconMinutes: next,
      }
      setDoorbellRinging(doorbellIsRinging(statesRef.current, Date.now(), next * 60_000))
      saveDashboardSettingsPatch(
        { doorbellIconMinutes: next },
        'Failed to save doorbell icon minutes',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDoorbellAudioEnabled = useCallback(
    (enabled: boolean) => {
      setDoorbellAudioEnabledState(enabled)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        doorbellAudioEnabled: enabled,
      }
      saveDashboardSettingsPatch(
        { doorbellAudioEnabled: enabled },
        'Failed to save doorbell audio setting',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDoorbellAudio = useCallback(
    (soundId: string) => {
      const next = normalizeDashboardSoundId(soundId)
      setDoorbellAudioState(next)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        doorbellAudio: next,
      }
      saveDashboardSettingsPatch(
        { doorbellAudio: next },
        'Failed to save doorbell audio selection',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmEmailEnabled = useCallback(
    (enabled: boolean) => {
      setDrivewayAlarmEmailEnabledState(enabled)
      saveDashboardSettingsPatch(
        { drivewayAlarmEmailEnabled: enabled },
        'Failed to save driveway alarm alert setting',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmEnabled = useCallback(
    (enabled: boolean) => {
      setDrivewayAlarmEnabledState(enabled)
      saveDashboardSettingsPatch(
        { drivewayAlarmEnabled: enabled },
        'Failed to save driveway alarm enable setting',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmTrigger = useCallback(
    (trigger: DrivewayAlarmTriggerState) => {
      const next = trigger === 'off' ? 'off' : 'on'
      setDrivewayAlarmTriggerState(next)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        drivewayAlarmTrigger: next,
      }
      setDrivewayAlarmActive(
        drivewayAlarmIsActive(
          statesRef.current,
          Date.now(),
          (dashboardSettingsRef.current.drivewayAlarmResetSeconds || 30 * 60) * 1000,
          next,
        ),
      )
      saveDashboardSettingsPatch(
        { drivewayAlarmTrigger: next },
        'Failed to save driveway alarm trigger',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmResetSeconds = useCallback(
    (seconds: number) => {
      const next = Math.max(1, Math.min(86_400, Math.round(Number(seconds) || 1800)))
      setDrivewayAlarmResetSecondsState(next)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        drivewayAlarmResetSeconds: next,
      }
      setDrivewayAlarmActive(
        drivewayAlarmIsActive(
          statesRef.current,
          Date.now(),
          next * 1000,
          dashboardSettingsRef.current.drivewayAlarmTrigger || 'on',
        ),
      )
      saveDashboardSettingsPatch(
        { drivewayAlarmResetSeconds: next },
        'Failed to save driveway alarm reset seconds',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmActions = useCallback(
    (actions: DashboardActionSelection[]) => {
      setDrivewayAlarmActionsState(actions)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        drivewayAlarmActions: actions,
      }
      saveDashboardSettingsPatch(
        { drivewayAlarmActions: actions },
        'Failed to save driveway alarm actions',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmRestore = useCallback(
    (enabled: boolean) => {
      setDrivewayAlarmRestoreState(enabled)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        drivewayAlarmRestore: enabled,
      }
      saveDashboardSettingsPatch(
        { drivewayAlarmRestore: enabled },
        'Failed to save driveway alarm restore setting',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmResetActions = useCallback(
    (actions: DashboardActionSelection[]) => {
      setDrivewayAlarmResetActionsState(actions)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        drivewayAlarmResetActions: actions,
      }
      saveDashboardSettingsPatch(
        { drivewayAlarmResetActions: actions },
        'Failed to save driveway alarm reset actions',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmConditions = useCallback(
    (rows: DrivewayAlarmConditionRow[]) => {
      setDrivewayAlarmConditionsState(rows)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        drivewayAlarmConditions: rows,
      }
      saveDashboardSettingsPatch(
        { drivewayAlarmConditions: rows },
        'Failed to save driveway alarm conditions',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmAudioEnabled = useCallback(
    (enabled: boolean) => {
      setDrivewayAlarmAudioEnabledState(enabled)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        drivewayAlarmAudioEnabled: enabled,
      }
      saveDashboardSettingsPatch(
        { drivewayAlarmAudioEnabled: enabled },
        'Failed to save driveway alarm audio setting',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setDrivewayAlarmAudio = useCallback(
    (soundId: string) => {
      const next = normalizeDashboardSoundId(soundId)
      setDrivewayAlarmAudioState(next)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        drivewayAlarmAudio: next,
      }
      saveDashboardSettingsPatch(
        { drivewayAlarmAudio: next },
        'Failed to save driveway alarm audio selection',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setStockSymbols = useCallback(
    (symbols: string[]) => {
      const next = normalizeStockSymbols(symbols)
      setStockSymbolsState(next)
      saveDashboardSettingsPatch({ stockSymbols: next }, 'Failed to save stock symbols')
    },
    [saveDashboardSettingsPatch],
  )

  const setStockFormulas = useCallback(
    (formulas: StockFormula[]) => {
      const next = normalizeStockFormulas(formulas)
      setStockFormulasState(next)
      saveDashboardSettingsPatch({ stockFormulas: next }, 'Failed to save calculated values')
    },
    [saveDashboardSettingsPatch],
  )

  const setOutsideButtons = useCallback(
    (buttons: OutsideCustomButton[]) => {
      setOutsideButtonsState(buttons)
      dashboardSettingsRef.current = {
        ...dashboardSettingsRef.current,
        outsideButtons: buttons,
      }
      // Drop active/snapshot state for removed buttons.
      const ids = new Set(buttons.map((button) => button.id))
      setOutsideButtonActiveIds((prev) => prev.filter((id) => ids.has(id)))
      for (const id of Object.keys(outsideButtonSnapshotsRef.current)) {
        if (!ids.has(id)) delete outsideButtonSnapshotsRef.current[id]
      }
      saveDashboardSettingsPatch(
        { outsideButtons: buttons },
        'Failed to save Outside buttons',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const runOutsideButton = useCallback(async (buttonId: string) => {
    const client = clientRef.current
    if (!client) return
    const button = dashboardSettingsRef.current.outsideButtons.find((item) => item.id === buttonId)
    if (!button || button.actions.length === 0) return
    try {
      const states = statesRef.current
      if (button.restore) {
        const entityIds = entityIdsAffectedByActions(button.actions, states, audio)
        outsideButtonSnapshotsRef.current[buttonId] = snapshotEntities(states, entityIds)
      } else {
        delete outsideButtonSnapshotsRef.current[buttonId]
      }
      await runDashboardActionList(client, button.actions, states, audio)
      setOutsideButtonActiveIds((prev) =>
        prev.includes(buttonId) ? prev : [...prev, buttonId],
      )
      logControl(client, {
        actor: 'outside_button',
        action: 'button.run',
        entityId: null,
        detail: {
          id: button.id,
          name: button.name,
          actions: button.actions.length,
          restore: button.restore,
        },
        ok: true,
      })
    } catch (err) {
      delete outsideButtonSnapshotsRef.current[buttonId]
      logControl(client, {
        actor: 'outside_button',
        action: 'button.run',
        entityId: null,
        detail: {
          id: button.id,
          name: button.name,
          error: err instanceof Error ? err.message : 'Failed',
        },
        ok: false,
      })
      setConnectionError(err instanceof Error ? err.message : 'Failed to run Outside button')
    }
  }, [audio])

  const deactivateOutsideButton = useCallback(async (buttonId: string) => {
    const client = clientRef.current
    if (!client) return
    const button = dashboardSettingsRef.current.outsideButtons.find((item) => item.id === buttonId)
    if (!button) return
    try {
      if (button.restore) {
        const snapshots = outsideButtonSnapshotsRef.current[buttonId] ?? []
        await runRestoreSnapshots(client, snapshots)
      }
      if (button.activeActions.length > 0) {
        await runDashboardActionList(
          client,
          button.activeActions,
          statesRef.current,
          audio,
        )
      }
      delete outsideButtonSnapshotsRef.current[buttonId]
      setOutsideButtonActiveIds((prev) => prev.filter((id) => id !== buttonId))
      logControl(client, {
        actor: 'outside_button',
        action: 'button.deactivate',
        entityId: null,
        detail: {
          id: button.id,
          name: button.name,
          restore: button.restore,
          activeActions: button.activeActions.length,
        },
        ok: true,
      })
    } catch (err) {
      logControl(client, {
        actor: 'outside_button',
        action: 'button.deactivate',
        entityId: null,
        detail: {
          id: button.id,
          name: button.name,
          error: err instanceof Error ? err.message : 'Failed',
        },
        ok: false,
      })
      setConnectionError(
        err instanceof Error ? err.message : 'Failed to deactivate Outside button',
      )
    }
  }, [audio])

  const activateDrivewayAlarm = useCallback(async () => {
    const client = clientRef.current
    if (!client) return
    // Optimistic: show the icon immediately while HA runs the trigger path.
    setDrivewayAlarmActive(true)
    try {
      // Manual icon click skips condition gates (sensor automation still applies them).
      await client.runShellCommand('dashboard_run_driveway_trigger_manual')
      await syncFromHa()
    } catch (err) {
      setDrivewayAlarmActive(false)
      setConnectionError(
        err instanceof Error ? err.message : 'Failed to run driveway alarm trigger',
      )
    }
  }, [syncFromHa])

  const resetDrivewayAlarm = useCallback(async () => {
    const client = clientRef.current
    if (!client) return
    try {
      await client.stopScript('script.dashboard_driveway_alarm_delayed_reset').catch(() => undefined)
      await client.runShellCommand('dashboard_run_driveway_reset')
      setDrivewayAlarmActive(false)
      await syncFromHa()
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : 'Failed to run driveway alarm reset',
      )
    }
  }, [syncFromHa])

  const updateReminder = useCallback(
    (id: 1 | 2, patch: Partial<Omit<DashboardReminder, 'id'>>) => {
      setReminders((current) => {
        const next = normalizeReminders(
          current.map((reminder) => (reminder.id === id ? { ...reminder, ...patch } : reminder)),
        )
        dashboardSettingsRef.current = { ...dashboardSettingsRef.current, reminders: next }
        saveDashboardSettingsPatch({ reminders: next }, 'Failed to save reminder')
        return next
      })
    },
    [saveDashboardSettingsPatch],
  )

  const dismissReminder = useCallback(
    (id: 1 | 2) => {
      updateReminder(id, { active: false })
    },
    [updateReminder],
  )

  const commandFailedEmailEnabledRef = useRef(commandFailedEmailEnabled)
  commandFailedEmailEnabledRef.current = commandFailedEmailEnabled
  const notifyEmailEnabledRef = useRef(notifyEmailEnabled)
  notifyEmailEnabledRef.current = notifyEmailEnabled
  const notifyPhoneEnabledRef = useRef(notifyPhoneEnabled)
  notifyPhoneEnabledRef.current = notifyPhoneEnabled
  const recentCommandFailEmailsRef = useRef<{ key: string; at: number }[]>([])

  useEffect(() => {
    const handler = (entry: ControlLogNotifyEntry) => {
      const alertEnabled = commandFailedEmailEnabledRef.current
      const sendEmail = alertEnabled && notifyEmailEnabledRef.current
      const sendPhone = alertEnabled && notifyPhoneEnabledRef.current
      if (!sendEmail && !sendPhone) return
      const client = clientRef.current
      if (!client) return
      const key = `${entry.action}|${entry.entity_id ?? ''}`
      const now = Date.now()
      recentCommandFailEmailsRef.current = recentCommandFailEmailsRef.current.filter(
        (row) => now - row.at < 5 * 60 * 1000,
      )
      if (recentCommandFailEmailsRef.current.some((row) => row.key === key)) return
      recentCommandFailEmailsRef.current.push({ key, at: now })
      const detail =
        entry.detail == null
          ? ''
          : typeof entry.detail === 'string'
            ? entry.detail
            : JSON.stringify(entry.detail)
      const title = 'Command failed to execute'
      const message = [
        `Action: ${entry.action}`,
        entry.entity_id ? `Entity: ${entry.entity_id}` : null,
        `Actor: ${entry.actor}`,
        detail ? `Detail: ${detail}` : null,
        `Time: ${entry.ts}`,
      ]
        .filter(Boolean)
        .join('\n')
      if (sendEmail) {
        void client.sendDashboardEmail(title, message).catch(() => undefined)
      }
      if (sendPhone) {
        void client.sendDashboardPhone(title, message).catch(() => undefined)
      }
    }
    notifyCommandFailedHandlers.add(handler)
    return () => {
      notifyCommandFailedHandlers.delete(handler)
    }
  }, [])

  const clearControlLog = useCallback(async (kind?: ControlLogKind) => {
    clearLocalControlLog(kind)
    const client = clientRef.current
    if (!client) return
    try {
      await client.clearControlLog(kind ?? 'all')
    } catch (err) {
      setConnectionError(
        err instanceof Error
          ? err.message
          : 'Cleared local log; HA shared log clear needs a Home Assistant restart for the new shell command',
      )
    }
  }, [])

  const setFloorPosition = useCallback(
    (floorId: FloorId, position: number) => {
      shadesRef.current
        .filter((s) => s.floor === floorId)
        .forEach((s) => setShadePosition(s.id, position))
    },
    [setShadePosition],
  )

  const openAllShades = useCallback(() => {
    shadesRef.current.forEach((s) => setShadePosition(s.id, 0))
  }, [setShadePosition])

  const closeAllShades = useCallback(() => {
    shadesRef.current.forEach((s) => setShadePosition(s.id, 100))
  }, [setShadePosition])

  const mappedCount = useMemo(
    () => Object.values(entityMap).filter(Boolean).length,
    [entityMap],
  )

  const value = useMemo<HouseContextValue>(
    () => ({
      shades,
      entityMap,
      covers,
      sensors,
      energyMap,
      energy,
      poolMap,
      pool,
      pondMap,
      pond,
      hvac,
      ac,
      irrigation,
      audio,
      receiver,
      egauge,
      cistern,
      mainGarage,
      workshopGarage,
      gate,
      hotTub,
      doorbellRinging,
      drivewayAlarmActive,
      drivewayAlarmLastTriggerAt,
      drivewayAlarmEnabled,
      drivewayAlarmTrigger,
      drivewayAlarmResetSeconds,
      drivewayAlarmConditions,
      drivewayAlarmActions,
      drivewayAlarmRestore,
      drivewayAlarmResetActions,
      drivewayAlarmAudioEnabled,
      drivewayAlarmAudio,
      crestronScenes,
      crestronLights,
      outsideTransformers,
      outsideMode,
      outsideButtons,
      outsideButtonActiveIds,
      weather,
      calendar,
      reminders,
      sun,
      deviceCommStatus,
      bathroomFanAutoOffEnabled,
      bathroomFanAutoOffMinutes,
      bathroomFanSlots,
      pondFillAutoEnabled,
      pondFillLowInches,
      pondFillFullInches,
      doorbellEmailEnabled,
      doorbellIconMinutes,
      doorbellAudioEnabled,
      doorbellAudio,
      drivewayAlarmEmailEnabled,
      poolPumpOffEmailEnabled,
      deviceCommFailureEmailEnabled,
      deviceCommFailureMinutes,
      deviceCommNotifyEnabled,
      commandFailedEmailEnabled,
      internetOutageEmailEnabled,
      internetOutageMinutes,
      internetOnline,
      notifyEmailEnabled,
      notifyPhoneEnabled,
      notifyEmailOverride,
      notifyPhoneTarget,
      poolLowWaterEmailEnabled,
      poolLowWaterInches,
      pondLowWaterEmailEnabled,
      pondLowWaterInches,
      cisternLowWaterEmailEnabled,
      cisternLowWaterPercent,
      poolPumpAutoOnEnabled,
      poolPumpAutoOnMinutes,
      connectionStatus,
      connectionError,
      lastSyncedAt,
      scheduleRevision,
      scheduledCoverCount,
      scheduleDebug,
      scheduleUsesSunDefault,
      scheduleHomebridgeSource,
      mappedCount,
      readOnly,
      setShadePosition: readOnly ? noop : setShadePosition,
      setPoolLights: readOnly ? noopAsync : setPoolLights,
      setPondFill: readOnly ? noopAsync : setPondFill,
      crestronPower,
      setCrestronPower: readOnly ? noopAsync : setCrestronPower,
      setCrestronPowerCycleEnabled: readOnly ? noopAsync : setCrestronPowerCycleEnabled,
      clearPondFillError: readOnly ? noopAsync : clearPondFillError,
      ballFountain,
      setBallFountainFill: readOnly ? noopAsync : setBallFountainFill,
      clearBallFountainFillError: readOnly ? noopAsync : clearBallFountainFillError,
      setBallFountainSettings: readOnly ? noopAsync : setBallFountainSettings,
      setCrestronPowerCycleMinutes: readOnly ? noopAsync : setCrestronPowerCycleMinutes,
      turnPoolPumpOn: readOnly ? noopAsync : turnPoolPumpOn,
      setThermostatMode: readOnly ? noopAsync : setThermostatMode,
      setThermostatSetpoint: readOnly ? noopAsync : setThermostatSetpoint,
      setOutsideTransformer: readOnly ? noopAsync : setOutsideTransformer,
      setOutsideTransformerBrightness: readOnly ? noop : setOutsideTransformerBrightness,
      setOutsideMode: readOnly ? noop : setDesiredOutsideMode,
      setOutsideButtons: readOnly ? noop : setOutsideButtons,
      stockSymbols,
      setStockSymbols: readOnly ? noop : setStockSymbols,
      stockFormulas,
      setStockFormulas: readOnly ? noop : setStockFormulas,
      runOutsideButton: readOnly ? noopAsync : runOutsideButton,
      deactivateOutsideButton: readOnly ? noopAsync : deactivateOutsideButton,
      updateReminder: readOnly ? noop : updateReminder,
      dismissReminder: readOnly ? noop : dismissReminder,
      setMainGarageDoor: readOnly ? noopAsync : setMainGarageDoor,
      setWorkshopGarageDoor: readOnly ? noopAsync : setWorkshopGarageDoor,
      setGateOpen: readOnly ? noopAsync : setGateOpen,
      setCrestronLight: readOnly ? noopAsync : setCrestronLight,
      setCrestronLightBrightness: readOnly ? noop : setCrestronLightBrightness,
      setCrestronLightRoom: readOnly ? noop : setCrestronLightRoom,
      activateCrestronScene: readOnly ? noop : activateCrestronScene,
      stopAllSonos: readOnly ? noopAsync : stopAllSonos,
      playSonos: readOnly ? noopAsync : playSonos,
      stopSonos: readOnly ? noopAsync : stopSonos,
      setSonosVolume: readOnly ? noopAsync : setSonosVolume,
      selectSonosSource: readOnly ? noopAsync : selectSonosSource,
      toggleReceiver: readOnly ? noopAsync : toggleReceiver,
      selectReceiverSource: readOnly ? noopAsync : selectReceiverSource,
      setReceiverVolume: readOnly ? noopAsync : setReceiverVolume,
      clearControlLog: readOnly ? noopAsync : clearControlLog,
      setBathroomFanAutoOffEnabled: readOnly ? noop : setBathroomFanAutoOffEnabled,
      setBathroomFanAutoOffMinutes: readOnly ? noop : setBathroomFanAutoOffMinutes,
      setBathroomFanSlot: readOnly ? noop : setBathroomFanSlot,
      setPondFillAutoEnabled: readOnly ? noop : setPondFillAutoEnabled,
      setPondFillLowInches: readOnly ? noop : setPondFillLowInches,
      setPondFillFullInches: readOnly ? noop : setPondFillFullInches,
      setDoorbellEmailEnabled: readOnly ? noop : setDoorbellEmailEnabled,
      setDoorbellIconMinutes: readOnly ? noop : setDoorbellIconMinutes,
      setDoorbellAudioEnabled: readOnly ? noop : setDoorbellAudioEnabled,
      setDoorbellAudio: readOnly ? noop : setDoorbellAudio,
      setDrivewayAlarmEmailEnabled: readOnly ? noop : setDrivewayAlarmEmailEnabled,
      setDrivewayAlarmEnabled: readOnly ? noop : setDrivewayAlarmEnabled,
      setDrivewayAlarmTrigger: readOnly ? noop : setDrivewayAlarmTrigger,
      setDrivewayAlarmResetSeconds: readOnly ? noop : setDrivewayAlarmResetSeconds,
      setDrivewayAlarmConditions: readOnly ? noop : setDrivewayAlarmConditions,
      setDrivewayAlarmActions: readOnly ? noop : setDrivewayAlarmActions,
      setDrivewayAlarmRestore: readOnly ? noop : setDrivewayAlarmRestore,
      setDrivewayAlarmResetActions: readOnly ? noop : setDrivewayAlarmResetActions,
      setDrivewayAlarmAudioEnabled: readOnly ? noop : setDrivewayAlarmAudioEnabled,
      setDrivewayAlarmAudio: readOnly ? noop : setDrivewayAlarmAudio,
      activateDrivewayAlarm: readOnly ? noopAsync : activateDrivewayAlarm,
      resetDrivewayAlarm: readOnly ? noopAsync : resetDrivewayAlarm,
      setPoolPumpOffEmailEnabled: readOnly ? noop : setPoolPumpOffEmailEnabled,
      setDeviceCommFailureEmailEnabled: readOnly ? noop : setDeviceCommFailureEmailEnabled,
      setDeviceCommFailureMinutes: readOnly ? noop : setDeviceCommFailureMinutes,
      setDeviceCommNotifyEnabled: readOnly ? noop : setDeviceCommNotifyEnabled,
      setCommandFailedEmailEnabled: readOnly ? noop : setCommandFailedEmailEnabled,
      setInternetOutageEmailEnabled: readOnly ? noop : setInternetOutageEmailEnabled,
      setInternetOutageMinutes: readOnly ? noop : setInternetOutageMinutes,
      setNotifyEmailEnabled: readOnly ? noop : setNotifyEmailEnabled,
      setNotifyPhoneEnabled: readOnly ? noop : setNotifyPhoneEnabled,
      setNotifyEmailOverride: readOnly ? noop : setNotifyEmailOverride,
      setNotifyPhoneTarget: readOnly ? noop : setNotifyPhoneTarget,
      setPoolLowWaterEmailEnabled: readOnly ? noop : setPoolLowWaterEmailEnabled,
      setPoolLowWaterInches: readOnly ? noop : setPoolLowWaterInches,
      setPondLowWaterEmailEnabled: readOnly ? noop : setPondLowWaterEmailEnabled,
      setPondLowWaterInches: readOnly ? noop : setPondLowWaterInches,
      setCisternLowWaterEmailEnabled: readOnly ? noop : setCisternLowWaterEmailEnabled,
      setCisternLowWaterPercent: readOnly ? noop : setCisternLowWaterPercent,
      setPoolPumpAutoOnEnabled: readOnly ? noop : setPoolPumpAutoOnEnabled,
      setPoolPumpAutoOnMinutes: readOnly ? noop : setPoolPumpAutoOnMinutes,
      openAllShades: readOnly ? noop : openAllShades,
      closeAllShades: readOnly ? noop : closeAllShades,
      setFloorPosition: readOnly ? noop : setFloorPosition,
      connect: readOnly ? noopAsync : connect,
      disconnect: readOnly ? noop : disconnect,
      refresh,
      setEntityMapping: readOnly ? noop : setEntityMapping,
      replaceEntityMap: readOnly ? noop : replaceEntityMap,
      autoMapEntities: readOnly ? () => 0 : autoMapEntities,
      setEnergyMapping: readOnly ? noop : setEnergyMapping,
      replaceEnergyMap: readOnly ? noop : replaceEnergyMap,
      autoMapEnergy: readOnly ? () => 0 : autoMapEnergy,
      exportShadeMap,
      exportEnergyMap,
      exportPoolMap,
      setPoolDepthOffset: readOnly ? noop : setPoolDepthOffset,
      exportPondMap,
      setPondDepthOffset: readOnly ? noop : setPondDepthOffset,
      exportHaConfig,
    }),
    [
      shades,
      entityMap,
      covers,
      sensors,
      energyMap,
      energy,
      poolMap,
      pool,
      pondMap,
      pond,
      hvac,
      ac,
      irrigation,
      audio,
      receiver,
      egauge,
      cistern,
      mainGarage,
      workshopGarage,
      gate,
      hotTub,
      doorbellRinging,
      drivewayAlarmActive,
      drivewayAlarmLastTriggerAt,
      drivewayAlarmEnabled,
      drivewayAlarmTrigger,
      drivewayAlarmResetSeconds,
      drivewayAlarmConditions,
      drivewayAlarmActions,
      drivewayAlarmRestore,
      drivewayAlarmResetActions,
      drivewayAlarmAudioEnabled,
      drivewayAlarmAudio,
      crestronScenes,
      crestronLights,
      outsideTransformers,
      outsideMode,
      outsideButtons,
      outsideButtonActiveIds,
      weather,
      calendar,
      reminders,
      sun,
      deviceCommStatus,
      bathroomFanAutoOffEnabled,
      bathroomFanAutoOffMinutes,
      bathroomFanSlots,
      pondFillAutoEnabled,
      pondFillLowInches,
      pondFillFullInches,
      doorbellEmailEnabled,
      doorbellIconMinutes,
      doorbellAudioEnabled,
      doorbellAudio,
      drivewayAlarmEmailEnabled,
      poolPumpOffEmailEnabled,
      deviceCommFailureEmailEnabled,
      deviceCommFailureMinutes,
      deviceCommNotifyEnabled,
      commandFailedEmailEnabled,
      internetOutageEmailEnabled,
      internetOutageMinutes,
      internetOnline,
      notifyEmailEnabled,
      notifyPhoneEnabled,
      notifyEmailOverride,
      notifyPhoneTarget,
      poolLowWaterEmailEnabled,
      poolLowWaterInches,
      pondLowWaterEmailEnabled,
      pondLowWaterInches,
      cisternLowWaterEmailEnabled,
      cisternLowWaterPercent,
      poolPumpAutoOnEnabled,
      poolPumpAutoOnMinutes,
      connectionStatus,
      connectionError,
      lastSyncedAt,
      scheduleRevision,
      scheduledCoverCount,
      scheduleDebug,
      scheduleUsesSunDefault,
      scheduleHomebridgeSource,
      mappedCount,
      readOnly,
      setShadePosition,
      setPoolLights,
      setPondFill,
      crestronPower,
      setCrestronPower,
      setCrestronPowerCycleEnabled,
      setCrestronPowerCycleMinutes,
      clearPondFillError,
      ballFountain,
      setBallFountainFill,
      clearBallFountainFillError,
      setBallFountainSettings,
      turnPoolPumpOn,
      setThermostatMode,
      setThermostatSetpoint,
      setOutsideTransformer,
      setOutsideTransformerBrightness,
      setDesiredOutsideMode,
      setOutsideButtons,
      stockSymbols,
      setStockSymbols,
      stockFormulas,
      setStockFormulas,
      runOutsideButton,
      deactivateOutsideButton,
      updateReminder,
      dismissReminder,
      setMainGarageDoor,
      setWorkshopGarageDoor,
      setGateOpen,
      setCrestronLight,
      setCrestronLightBrightness,
      setCrestronLightRoom,
      activateCrestronScene,
      setBathroomFanAutoOffEnabled,
      setBathroomFanAutoOffMinutes,
      setBathroomFanSlot,
      setPondFillAutoEnabled,
      setPondFillLowInches,
      setPondFillFullInches,
      setDoorbellEmailEnabled,
      setDoorbellIconMinutes,
      setDoorbellAudioEnabled,
      setDoorbellAudio,
      setDrivewayAlarmEmailEnabled,
      setDrivewayAlarmEnabled,
      setDrivewayAlarmTrigger,
      setDrivewayAlarmResetSeconds,
      setDrivewayAlarmConditions,
      setDrivewayAlarmActions,
      setDrivewayAlarmRestore,
      setDrivewayAlarmResetActions,
      setDrivewayAlarmAudioEnabled,
      setDrivewayAlarmAudio,
      activateDrivewayAlarm,
      resetDrivewayAlarm,
      setPoolPumpOffEmailEnabled,
      setDeviceCommFailureEmailEnabled,
      setDeviceCommFailureMinutes,
      setDeviceCommNotifyEnabled,
      setCommandFailedEmailEnabled,
      setInternetOutageEmailEnabled,
      setInternetOutageMinutes,
      setNotifyEmailEnabled,
      setNotifyPhoneEnabled,
      setNotifyEmailOverride,
      setNotifyPhoneTarget,
      setPoolLowWaterEmailEnabled,
      setPoolLowWaterInches,
      setPondLowWaterEmailEnabled,
      setPondLowWaterInches,
      setCisternLowWaterEmailEnabled,
      setCisternLowWaterPercent,
      setPoolPumpAutoOnEnabled,
      setPoolPumpAutoOnMinutes,
      openAllShades,
      closeAllShades,
      setFloorPosition,
      connect,
      disconnect,
      refresh,
      setEntityMapping,
      replaceEntityMap,
      autoMapEntities,
      setEnergyMapping,
      replaceEnergyMap,
      autoMapEnergy,
      exportShadeMap,
      exportEnergyMap,
      exportPoolMap,
      setPoolDepthOffset,
      exportPondMap,
      setPondDepthOffset,
      exportHaConfig,
    ],
  )

  return <HouseContext.Provider value={value}>{children}</HouseContext.Provider>
}

export function useHouse(): HouseContextValue {
  const ctx = useContext(HouseContext)
  if (!ctx) throw new Error('useHouse must be used within HouseProvider')
  return ctx
}
