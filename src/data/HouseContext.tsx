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
  formatSoc,
  newestSensorUpdatedMs,
  sensorFromState,
  SHED_STALE_MS,
  splitGridImportExport,
  suggestBatterySocSensor,
  suggestPowerpackPowerSensor,
  matchAlsoEnergyPvSensors,
  suggestPvSensor,
  sumWatts,
  toKwh,
  toPercent,
  toWatts,
  type HaSensor,
} from '../ha/energy'
import { coverFromState, type HaCover, type HaState } from '../ha/positions'
import {
  pickWeatherEntity,
  weatherFromState,
  weatherSnapshot,
  type WeatherSnapshot,
} from '../ha/weather'
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
  SHED_POWER_TOGGLE_INITIAL_DELAY_MS,
  SHED_POWER_TOGGLE_POLL_MAX_MS,
  SHED_POWER_TOGGLE_POLL_MS,
  sleep,
} from '../ha/pendingToggle'
import {
  CRESTRON_SCENE_ENTITY_IDS,
  crestronScenesFromStates,
  type CrestronScene,
} from '../ha/scenes'
import { fetchPvCache, type PvCacheSnapshot } from '../ha/pvCache'
import { fetchShedCache, type ShedCacheSnapshot } from '../ha/shedCache'
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
  type EgaugeSnapshot,
} from '../ha/egauge'
import { fetchEgaugeLiveCache } from '../ha/egaugeLive'
import { type DeviceCommRow } from '../ha/deviceCommunication'
import {
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
  activeIrrigationZone,
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
  EMPTY_HVAC,
  hvacSnapshotFromStates,
  type HvacSnapshot,
} from '../ha/hvac'
import {
  EMPTY_POND,
  pondMapCount,
  pondSnapshotFromStates,
  suggestPondEntityMap,
  type PondEntityMap,
  type PondSnapshot,
} from '../ha/pond'
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
  clampSocThreshold,
  DEFAULT_SHED_POWER_SETTINGS,
  type ShedPowerSettings,
} from '../ha/shedPowerSettings'
import {
  DEFAULT_CISTERN_LOW_WATER_PERCENT,
  DEFAULT_DEVICE_COMM_FAILURE_MINUTES,
  DEFAULT_PHONE_NOTIFY_ENTITY,
  DEFAULT_POND_LOW_WATER_INCHES,
  DEFAULT_POOL_LOW_WATER_INCHES,
  POND_WATER_LEVEL_OFFSET_ENTITY,
  POOL_WATER_LEVEL_OFFSET_ENTITY,
} from '../ha/notifications'
import {
  DEFAULT_DASHBOARD_SETTINGS,
  dashboardSettingsFromHaStates,
  fetchDashboardSettings,
  missingDashboardSettingHelpers,
  persistDashboardSettingsPatch,
  pushDashboardSettingsToHelpers,
  type DashboardSettings,
} from '../ha/dashboardSettings'
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
  powerpackWatts: number | null
  totalWatts: number | null
  batterySoc: number | null
  loadWatts: number | null
  batteryPowerWatts: number | null
  gridWatts: number | null
  pvOnlyLabel: string
  pvOnlyLoadLabel: string
  pvOnlyGridLabel: string
  pvOnlyExcessLabel: string
  pvOnlyMonthLabel: string
  pvOnlyTodayLabel: string
  pvOnlyLifetimeLabel: string
  powerpackLabel: string
  totalLabel: string
  batteryLabel: string
  loadLabel: string
  batteryPowerLabel: string
  /** Enlighten-style flow label: Charging / Discharging / Idle */
  batteryPowerFlowLabel: string
  gridLabel: string
  /** Newest HA/cache timestamp among mapped shed PowerPack sensors. */
  shedUpdatedAtMs: number | null
  /**
   * null = shed sensors not mapped / unknown.
   * false = unavailable entities or last update older than SHED_STALE_MS.
   */
  shedCommunicating: boolean | null
}

/** TP-Link Kasa "Shed Power" outlet (local switch entity). */
export const SHED_POWER_SWITCH_ENTITY = 'switch.shed_power'

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
  crestronScenes: CrestronScene[]
  outsideTransformers: OutsideTransformer[]
  outsideMode: OutsideMode
  weather: WeatherSnapshot | null
  sun: SunSnapshot | null
  /** Shed Power Kasa plug; null when unknown / unavailable */
  shedPowerOn: boolean | null
  /** Last-communication rows for every polled device / integration. */
  deviceCommStatus: DeviceCommRow[]
  shedPowerSettings: ShedPowerSettings
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
  setShedPower: (on: boolean) => Promise<void>
  setPoolLights: (on: boolean) => Promise<void>
  /** Turn on ScreenLogic Pool circuit (starts filter pump at programmed Pool speed). */
  turnPoolPumpOn: () => Promise<void>
  setThermostatMode: (entityId: string, mode: string) => Promise<void>
  setThermostatSetpoint: (entityId: string, temperature: number) => Promise<void>
  setOutsideTransformer: (key: OutsideControlKey, on: boolean) => Promise<void>
  setOutsideTransformerBrightness: (key: OutsideControlKey, percent: number) => void
  setOutsideMode: (mode: OutsideMode) => void
  setMainGarageDoor: (open: boolean) => Promise<void>
  setWorkshopGarageDoor: (open: boolean) => Promise<void>
  setGateOpen: (open: boolean) => Promise<void>
  setShedPowerOnThreshold: (value: number) => void
  setShedPowerOffThreshold: (value: number) => void
  poolPumpOffEmailEnabled: boolean
  setPoolPumpOffEmailEnabled: (enabled: boolean) => void
  deviceCommFailureEmailEnabled: boolean
  setDeviceCommFailureEmailEnabled: (enabled: boolean) => void
  deviceCommFailureMinutes: number
  setDeviceCommFailureMinutes: (minutes: number) => void
  commandFailedEmailEnabled: boolean
  setCommandFailedEmailEnabled: (enabled: boolean) => void
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
  clearControlLog: () => Promise<void>
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

const EMPTY_ENERGY: EnergySnapshot = {
  pvOnlyWatts: null,
  pvOnlyLoadWatts: null,
  pvOnlyGridWatts: null,
  powerpackWatts: null,
  totalWatts: null,
  batterySoc: null,
  loadWatts: null,
  batteryPowerWatts: null,
  gridWatts: null,
  pvOnlyLabel: formatPower(null),
  pvOnlyLoadLabel: formatPower(null),
  pvOnlyGridLabel: formatPower(null),
  pvOnlyExcessLabel: formatPower(null),
  pvOnlyMonthLabel: formatEnergyKwh(null),
  pvOnlyTodayLabel: formatEnergyKwh(null),
  pvOnlyLifetimeLabel: formatEnergyKwh(null),
  powerpackLabel: formatPower(null),
  totalLabel: formatPower(null),
  batteryLabel: formatSoc(null),
  loadLabel: formatPower(null),
  batteryPowerLabel: formatBatteryFlow(null),
  batteryPowerFlowLabel: batteryFlowLabel(null),
  gridLabel: formatPower(null),
  shedUpdatedAtMs: null,
  shedCommunicating: null,
}

function clampPosition(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function shadesCacheHasData(cache: ShadesCacheSnapshot | null): boolean {
  if (!cache?.shades) return false
  return Object.values(cache.shades).some((entry) => entry?.position != null)
}

function applyCoverPositions(
  shades: Shade[],
  entityMap: ShadeEntityMap,
  coversById: Map<string, HaCover>,
): Shade[] {
  return shades.map((shade) => {
    const entityId = entityMap[shade.id]
    if (!entityId) return shade
    const cover = coversById.get(entityId)
    if (!cover || cover.closedPercent == null) return shade
    return { ...shade, position: cover.closedPercent }
  })
}

function applyShadesCache(shades: Shade[], cache: ShadesCacheSnapshot | null): Shade[] {
  if (!cache?.shades) return shades
  return shades.map((shade) => {
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
  // HA-host cache is the source of truth for display when populated.
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
  const totalWatts = sumWatts(pvOnlyWatts ?? null, base.powerpackWatts)
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
    totalWatts,
    totalLabel: formatPower(totalWatts),
  }
}

function shedCacheHasData(cache: ShedCacheSnapshot | null): boolean {
  if (!cache) return false
  return (
    cache.pvPowerW != null ||
    cache.loadPowerW != null ||
    cache.batteryPowerW != null ||
    cache.gridPowerW != null ||
    cache.batterySoc != null
  )
}

function applyShedCache(base: EnergySnapshot, cache: ShedCacheSnapshot | null): EnergySnapshot {
  if (!shedCacheHasData(cache) || !cache) return base
  const powerpackWatts = cache.pvPowerW ?? base.powerpackWatts
  const loadWatts = cache.loadPowerW ?? base.loadWatts
  const batteryPowerWatts = cache.batteryPowerW ?? base.batteryPowerWatts
  const gridWatts = cache.gridPowerW ?? base.gridWatts
  const batterySoc = cache.batterySoc ?? base.batterySoc
  const totalWatts = sumWatts(base.pvOnlyWatts, powerpackWatts ?? null)
  const cacheUpdatedAtMs = (() => {
    if (!cache.fetchedAt) return null
    const t = Date.parse(cache.fetchedAt)
    return Number.isFinite(t) ? t : null
  })()
  const shedUpdatedAtMs =
    cacheUpdatedAtMs == null
      ? base.shedUpdatedAtMs
      : base.shedUpdatedAtMs == null
        ? cacheUpdatedAtMs
        : Math.max(base.shedUpdatedAtMs, cacheUpdatedAtMs)
  const cacheFresh =
    cacheUpdatedAtMs != null && Date.now() - cacheUpdatedAtMs <= SHED_STALE_MS
  const shedCommunicating = evaluateShedCommunicating({
    mapped: true,
    updatedAtMs: shedUpdatedAtMs,
    // Fresh shed-cache.json can override HA unavailable entities.
    unavailable: base.shedCommunicating === false && !cacheFresh,
  })
  return {
    ...base,
    powerpackWatts: powerpackWatts ?? null,
    loadWatts: loadWatts ?? null,
    batteryPowerWatts: batteryPowerWatts ?? null,
    gridWatts: gridWatts ?? null,
    batterySoc: batterySoc ?? null,
    totalWatts,
    powerpackLabel: formatPower(powerpackWatts ?? null),
    loadLabel: formatPower(loadWatts ?? null),
    batteryPowerLabel: formatBatteryFlow(batteryPowerWatts ?? null),
    batteryPowerFlowLabel: batteryFlowLabel(batteryPowerWatts ?? null),
    gridLabel: formatPower(gridWatts == null ? null : Math.abs(gridWatts)),
    batteryLabel: formatSoc(batterySoc ?? null),
    totalLabel: formatPower(totalWatts),
    shedUpdatedAtMs,
    shedCommunicating,
  }
}

function evaluateShedCommunicating(args: {
  mapped: boolean
  updatedAtMs: number | null
  unavailable: boolean
  now?: number
}): boolean | null {
  if (!args.mapped) return null
  if (args.unavailable) return false
  if (args.updatedAtMs == null) return true
  const now = args.now ?? Date.now()
  return now - args.updatedAtMs <= SHED_STALE_MS
}

function applyEnergyCaches(
  base: EnergySnapshot,
  pvCache: PvCacheSnapshot | null,
  shedCache: ShedCacheSnapshot | null,
): EnergySnapshot {
  return applyShedCache(applyPvCache(base, pvCache), shedCache)
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
  const powerpackSensor = energyMap.powerpackProduction
    ? sensorsById.get(energyMap.powerpackProduction) ?? null
    : null
  const socSensor = energyMap.powerpackBatterySoc
    ? sensorsById.get(energyMap.powerpackBatterySoc) ?? null
    : null
  const loadSensor = energyMap.powerpackLoad
    ? sensorsById.get(energyMap.powerpackLoad) ?? null
    : null
  const batteryPowerSensor = energyMap.powerpackBatteryPower
    ? sensorsById.get(energyMap.powerpackBatteryPower) ?? null
    : null
  const gridSensor = energyMap.powerpackGrid
    ? sensorsById.get(energyMap.powerpackGrid) ?? null
    : null

  const pvOnlyWatts = toWatts(pvOnlySensor)
  const pvOnlyLoadWatts = toWatts(pvOnlyLoadSensor)
  const pvOnlyGridWatts = toWatts(pvOnlyGridSensor)
  const { importWatts: pvOnlyGridImportWatts, exportWatts: pvOnlyGridExportWatts } =
    splitGridImportExport(pvOnlyGridWatts)
  const powerpackWatts = toWatts(powerpackSensor)
  const totalWatts = sumWatts(pvOnlyWatts, powerpackWatts)
  const batterySoc = toPercent(socSensor)
  const loadWatts = toWatts(loadSensor)
  const batteryPowerWatts = toWatts(batteryPowerSensor)
  const gridWatts = toWatts(gridSensor)
  const pvOnlyMonthKwh = toKwh(pvOnlyMonthSensor)
  const pvOnlyTodayKwh = toKwh(pvOnlyTodaySensor)
  const pvOnlyLifetimeKwh = toKwh(pvOnlyLifetimeSensor)

  const shedSensors = [
    powerpackSensor,
    socSensor,
    loadSensor,
    batteryPowerSensor,
    gridSensor,
  ]
  const shedMapped = Boolean(
    energyMap.powerpackProduction ||
      energyMap.powerpackBatterySoc ||
      energyMap.powerpackLoad ||
      energyMap.powerpackBatteryPower ||
      energyMap.powerpackGrid,
  )
  const shedUnavailable = shedSensors.some(
    (sensor) =>
      sensor != null && (sensor.state === 'unavailable' || sensor.state === 'unknown'),
  )
  const shedUpdatedAtMs = newestSensorUpdatedMs(shedSensors)
  const shedCommunicating = evaluateShedCommunicating({
    mapped: shedMapped,
    updatedAtMs: shedUpdatedAtMs,
    unavailable: shedUnavailable,
  })

  return {
    pvOnlyWatts,
    pvOnlyLoadWatts,
    pvOnlyGridWatts,
    powerpackWatts,
    totalWatts,
    batterySoc,
    loadWatts,
    batteryPowerWatts,
    gridWatts,
    pvOnlyLabel: formatPower(pvOnlyWatts),
    pvOnlyLoadLabel: formatPower(pvOnlyLoadWatts == null ? null : Math.abs(pvOnlyLoadWatts)),
    pvOnlyGridLabel: formatPower(pvOnlyGridImportWatts),
    pvOnlyExcessLabel: formatPower(pvOnlyGridExportWatts),
    pvOnlyMonthLabel: formatEnergyKwh(pvOnlyMonthKwh),
    pvOnlyTodayLabel: formatEnergyKwh(pvOnlyTodayKwh),
    pvOnlyLifetimeLabel: formatEnergyKwh(pvOnlyLifetimeKwh),
    powerpackLabel: formatPower(powerpackWatts),
    totalLabel: formatPower(totalWatts),
    batteryLabel: formatSoc(batterySoc),
    loadLabel: formatPower(loadWatts),
    batteryPowerLabel: formatBatteryFlow(batteryPowerWatts),
    batteryPowerFlowLabel: batteryFlowLabel(batteryPowerWatts),
    gridLabel: formatPower(gridWatts == null ? null : Math.abs(gridWatts)),
    shedUpdatedAtMs,
    shedCommunicating,
  }
}

function formatBatteryFlow(watts: number | null): string {
  if (watts == null) return '—'
  return formatPower(Math.abs(watts))
}

/** Negative = charging (Enlighten), positive = discharging. */
function batteryFlowLabel(watts: number | null): string {
  if (watts == null) return 'Battery'
  if (watts < 0) return 'Charging'
  if (watts > 0) return 'Discharging'
  return 'Idle'
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
  const [shedPowerOn, setShedPowerOn] = useState<boolean | null>(null)
  const [shedPowerSettings, setShedPowerSettings] = useState<ShedPowerSettings>(
    DEFAULT_SHED_POWER_SETTINGS,
  )
  const [poolPumpOffEmailEnabled, setPoolPumpOffEmailEnabledState] = useState(true)
  const [deviceCommFailureEmailEnabled, setDeviceCommFailureEmailEnabledState] = useState(false)
  const [deviceCommFailureMinutes, setDeviceCommFailureMinutesState] = useState(
    DEFAULT_DEVICE_COMM_FAILURE_MINUTES,
  )
  const [commandFailedEmailEnabled, setCommandFailedEmailEnabledState] = useState(false)
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
  const [pool, setPool] = useState<PoolSnapshot>(EMPTY_POOL)
  const [pond, setPond] = useState<PondSnapshot>(EMPTY_POND)
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
  const [crestronLights, setCrestronLights] = useState<CrestronLight[]>([])
  const [crestronScenes, setCrestronScenes] = useState<CrestronScene[]>([])
  const [crestronLightRooms, setCrestronLightRooms] = useState<CrestronLightRoomMap>({})
  const [outsideTransformers, setOutsideTransformers] = useState<OutsideTransformer[]>([])
  const [outsideMode, setOutsideMode] = useState<OutsideMode>('None')
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
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
  const shedCacheRef = useRef<ShedCacheSnapshot | null>(null)
  const shadesCacheRef = useRef<ShadesCacheSnapshot | null>(null)
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
    shedPowerOn: null as boolean | null,
    egauge: EMPTY_EGAUGE as EgaugeSnapshot,
  })
  /** Last known pool pump RPM for edge-detecting unexpected stops. */
  const previousPoolRpmRef = useRef<number | null>(null)
  const dashboardSettingsRef = useRef<DashboardSettings>(DEFAULT_DASHBOARD_SETTINGS)
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
    shedPowerOn,
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
    setDeviceCommStatus(deviceCommRowsFromHaStatus(file))
  }, [])

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
      setEgauge((previous) => {
        if (previous.gridWatts === cacheWatts) return previous
        return {
          ...previous,
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

    if (pickedWeather) {
      const currentEntityId = pickedWeather.entityId
      const forecastEntityIds = [
        currentEntityId,
        ...weatherEntities
          .map((entity) => entity.entityId)
          .filter((entityId) => entityId !== currentEntityId),
      ]
      for (const entityId of forecastEntityIds) {
        try {
          const forecast = await client.getWeatherForecasts(entityId)
          if (forecast.length > 0) {
            pickedWeather = { ...pickedWeather, forecast }
            break
          }
        } catch {
          /* try next weather entity */
        }
      }
    }

    const weatherSnap = weatherSnapshot(pickedWeather)
    setWeather(weatherSnap)

    const coversById = new Map(coverList.map((c) => [c.entityId, c]))
    setShades((prev) =>
      applyShadePositions(prev, entityMapRef.current, coversById, shadesCacheRef.current),
    )

    const sensorsById = new Map(sensorList.map((s) => [s.entityId, s]))
    const baseEnergy = snapshotFromSensors(energyMapRef.current, sensorsById)
    setEnergy(applyEnergyCaches(baseEnergy, pvCacheRef.current, shedCacheRef.current))

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
    const energySnap = applyEnergyCaches(
      snapshotFromSensors(energyMapRef.current, sensorsByIdForTrends),
      pvCacheRef.current,
      shedCacheRef.current,
    )
    recordAllTrendSamples({
      cisternPercent: cisternSnap.levelPercent,
      batterySoc: energySnap.batterySoc,
      powerpackPvWatts: energySnap.powerpackWatts,
      pvArrayWatts: energySnap.pvOnlyWatts,
      housePowerWatts: egaugeSnap.gridWatts,
      irrigationZone: activeIrrigationZone(irrigationSnap),
    })

    const mainGarageSnap = garageDoorFromStates(states, MAIN_GARAGE)
    const workshopGarageSnap = garageDoorFromStates(states, WORKSHOP_GARAGE)
    const gateSnap = gateFromStates(states)
    setMainGarage(mainGarageSnap)
    setWorkshopGarage(workshopGarageSnap)
    setGate(gateSnap)
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

    const shedPowerState = states.find((s) => s.entity_id === SHED_POWER_SWITCH_ENTITY)
    let nextShedPowerOn: boolean | null
    if (!shedPowerState || shedPowerState.state === 'unavailable' || shedPowerState.state === 'unknown') {
      nextShedPowerOn = null
      setShedPowerOn(null)
    } else {
      nextShedPowerOn = shedPowerState.state === 'on'
      setShedPowerOn(nextShedPowerOn)
    }
    const fileSettings = await fetchDashboardSettings()
    const haOnly = dashboardSettingsFromHaStates(states, DEFAULT_DASHBOARD_SETTINGS)
    const missingHelpers = missingDashboardSettingHelpers(states)
    const settingsEqual = (a: DashboardSettings, b: DashboardSettings) =>
      JSON.stringify(a) === JSON.stringify(b)

    let mergedSettings: DashboardSettings
    if (!fileSettings) {
      mergedSettings = missingHelpers.length === 0 ? haOnly : DEFAULT_DASHBOARD_SETTINGS
      if (clientRef.current && missingHelpers.length === 0) {
        void persistDashboardSettingsPatch(clientRef.current, mergedSettings).catch(() => undefined)
      }
    } else if (
      settingsEqual(fileSettings, DEFAULT_DASHBOARD_SETTINGS) &&
      missingHelpers.length === 0 &&
      !settingsEqual(haOnly, DEFAULT_DASHBOARD_SETTINGS)
    ) {
      // Seed file still at defaults — adopt existing HA helper values once.
      mergedSettings = haOnly
      if (clientRef.current) {
        void persistDashboardSettingsPatch(clientRef.current, haOnly).catch(() => undefined)
      }
    } else if (missingHelpers.length > 0) {
      mergedSettings = fileSettings
    } else {
      // Shared JSON is durable across local/remote; keep HA helpers aligned for automations.
      mergedSettings = fileSettings
      if (!settingsEqual(haOnly, fileSettings) && clientRef.current) {
        void pushDashboardSettingsToHelpers(clientRef.current, fileSettings).catch(() => undefined)
      }
    }
    dashboardSettingsRef.current = mergedSettings
    setShedPowerSettings({
      onBelow: mergedSettings.shedPowerOnBelow,
      offAbove: mergedSettings.shedPowerOffAbove,
    })
    setPoolPumpOffEmailEnabledState(mergedSettings.poolPumpOffEmailEnabled)
    setDeviceCommFailureEmailEnabledState(mergedSettings.deviceCommFailureEmailEnabled)
    setDeviceCommFailureMinutesState(mergedSettings.deviceCommFailureMinutes)
    setCommandFailedEmailEnabledState(mergedSettings.commandFailedEmailEnabled)
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
      shedPowerOn: nextShedPowerOn,
      egauge: egaugeSnap,
    }

    setLastSyncedAt(Date.now())
    setConnectionStatus('connected')
    setConnectionError(null)
  }, [applyCrestronStates, refreshSun])

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

  const refreshShedPowerState = useCallback(async () => {
    const client = clientRef.current
    if (!client) return

    const state = await client.getEntityState(SHED_POWER_SWITCH_ENTITY)
    const index = statesRef.current.findIndex((entry) => entry.entity_id === state.entity_id)
    if (index >= 0) {
      const nextStates = [...statesRef.current]
      nextStates[index] = state
      statesRef.current = nextStates
    } else {
      statesRef.current = [...statesRef.current, state]
    }

    if (state.state === 'unavailable' || state.state === 'unknown') {
      setShedPowerOn(null)
    } else {
      setShedPowerOn(state.state === 'on')
    }
  }, [])

  const pollUntilShedPowerConfirmed = useCallback(
    async (on: boolean) => {
      const client = clientRef.current
      if (!client) return false

      const isConfirmed = () =>
        entityIsOn(statesRef.current, SHED_POWER_SWITCH_ENTITY) === on

      await sleep(SHED_POWER_TOGGLE_INITIAL_DELAY_MS)

      const deadline = Date.now() + SHED_POWER_TOGGLE_POLL_MAX_MS
      let polls = 0
      let retried = false

      while (Date.now() < deadline) {
        await refreshShedPowerState().catch(() => undefined)
        if (isConfirmed()) return true

        polls += 1
        if (polls >= 4 && !retried) {
          retried = true
          await client.setSwitch(SHED_POWER_SWITCH_ENTITY, on)
        }

        await sleep(SHED_POWER_TOGGLE_POLL_MS)
      }

      await refreshShedPowerState().catch(() => undefined)
      return isConfirmed()
    },
    [refreshShedPowerState],
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
    [syncFromHa, syncSchedulesFromHa],
  )

  const disconnect = useCallback(() => {
    clientRef.current = null
    saveToken('')
    setCovers([])
    setSensors([])
    setWeather(null)
    setEnergy(EMPTY_ENERGY)
    setShedPowerOn(null)
    setPool(EMPTY_POOL)
    setPond(EMPTY_POND)
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
    setLastSyncedAt(null)
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
      const [pvCache, shedCache] = await Promise.all([fetchPvCache(), fetchShedCache()])
      pvCacheRef.current = pvCache
      shedCacheRef.current = shedCache
      setEnergy((prev) => {
        const next = applyEnergyCaches(prev, pvCache, shedCache)
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
    setEnergy(
      applyEnergyCaches(
        snapshotFromSensors(energyMap, byId),
        pvCacheRef.current,
        shedCacheRef.current,
      ),
    )
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
        next.powerpackProduction,
        next.powerpackBatterySoc,
        next.powerpackLoad,
        next.powerpackBatteryPower,
        next.powerpackGrid,
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
    if (!next.powerpackProduction) {
      const id = suggestPowerpackPowerSensor(sensorsRef.current, 'pv', used())
      if (id) {
        next.powerpackProduction = id
        added += 1
      }
    }
    if (!next.powerpackBatterySoc) {
      const id = suggestBatterySocSensor(sensorsRef.current, used())
      if (id) {
        next.powerpackBatterySoc = id
        added += 1
      }
    }
    if (!next.powerpackLoad) {
      const id = suggestPowerpackPowerSensor(sensorsRef.current, 'load', used())
      if (id) {
        next.powerpackLoad = id
        added += 1
      }
    }
    if (!next.powerpackBatteryPower) {
      const id = suggestPowerpackPowerSensor(sensorsRef.current, 'battery', used())
      if (id) {
        next.powerpackBatteryPower = id
        added += 1
      }
    }
    if (!next.powerpackGrid) {
      const id = suggestPowerpackPowerSensor(sensorsRef.current, 'grid', used())
      if (id) {
        next.powerpackGrid = id
        added += 1
      }
    }
    saveEnergyEntityMap(next)
    setEnergyMap(next)
    return added
  }, [])

  // Auto-map when empty, or when AlsoEnergy sensors appear and PV still points at Enphase.
  useEffect(() => {
    if (connectionStatus !== 'connected' || sensors.length === 0) return
    const alsoEnergy = matchAlsoEnergyPvSensors(sensors)
    const map = energyMapRef.current
    const pvIds = [map.pvOnlyProduction, map.pvOnlyMonthEnergy, map.pvOnlyLifetimeEnergy]
      .filter(Boolean)
      .join(' ')
    const stalePv = /5478356|enphase_powerpack/.test(pvIds)
    if (energyMapCount(map) > 0 && !(alsoEnergy.production && stalePv)) return
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

  const setShedPower = useCallback(
    async (on: boolean) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')

      try {
        await client.setSwitch(SHED_POWER_SWITCH_ENTITY, on)
        const confirmed = await pollUntilShedPowerConfirmed(on)
        if (!confirmed) {
          throw new Error('Shed Grid did not confirm — try again')
        }
        logControl(client, {
          actor: 'ui',
          action: on ? 'switch.turn_on' : 'switch.turn_off',
          entityId: SHED_POWER_SWITCH_ENTITY,
          detail: { label: 'Shed Grid' },
        })
      } catch (err) {
        logControl(client, {
          actor: 'ui',
          action: on ? 'switch.turn_on' : 'switch.turn_off',
          entityId: SHED_POWER_SWITCH_ENTITY,
          detail: { label: 'Shed Grid' },
          ok: false,
        })
        void refreshShedPowerState().catch(() => undefined)
        setConnectionError(err instanceof Error ? err.message : 'Failed to set Shed Power')
        throw err
      }
    },
    [pollUntilShedPowerConfirmed, refreshShedPowerState],
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
      if (currentMode === mode) return

      void (async () => {
        try {
          await client.setSelect(OUTSIDE_LIGHTS_MODE_ENTITY, mode)
          logControl(client, {
            actor: 'ui',
            action: 'input_select.select_option',
            entityId: OUTSIDE_LIGHTS_MODE_ENTITY,
            detail: { mode },
          })
          await syncFromHa()
        } catch (err) {
          logControl(client, {
            actor: 'ui',
            action: 'input_select.select_option',
            entityId: OUTSIDE_LIGHTS_MODE_ENTITY,
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

  const setShedPowerOnThreshold = useCallback(
    (value: number) => {
      const threshold = clampSocThreshold(value)
      setShedPowerSettings((current) => ({ ...current, onBelow: threshold }))
      saveDashboardSettingsPatch(
        { shedPowerOnBelow: threshold },
        'Failed to save Shed Power on threshold',
      )
    },
    [saveDashboardSettingsPatch],
  )

  const setShedPowerOffThreshold = useCallback(
    (value: number) => {
      const threshold = clampSocThreshold(value, DEFAULT_SHED_POWER_SETTINGS.offAbove)
      setShedPowerSettings((current) => ({ ...current, offAbove: threshold }))
      saveDashboardSettingsPatch(
        { shedPowerOffAbove: threshold },
        'Failed to save Shed Power off threshold',
      )
    },
    [saveDashboardSettingsPatch],
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

  const clearControlLog = useCallback(async () => {
    clearLocalControlLog()
    const client = clientRef.current
    if (!client) return
    try {
      await client.clearControlLog()
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
      crestronScenes,
      crestronLights,
      outsideTransformers,
      outsideMode,
      weather,
      sun,
      shedPowerOn,
      deviceCommStatus,
      shedPowerSettings,
      poolPumpOffEmailEnabled,
      deviceCommFailureEmailEnabled,
      deviceCommFailureMinutes,
      commandFailedEmailEnabled,
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
      setShedPower: readOnly ? noopAsync : setShedPower,
      setPoolLights: readOnly ? noopAsync : setPoolLights,
      turnPoolPumpOn: readOnly ? noopAsync : turnPoolPumpOn,
      setThermostatMode: readOnly ? noopAsync : setThermostatMode,
      setThermostatSetpoint: readOnly ? noopAsync : setThermostatSetpoint,
      setOutsideTransformer: readOnly ? noopAsync : setOutsideTransformer,
      setOutsideTransformerBrightness: readOnly ? noop : setOutsideTransformerBrightness,
      setOutsideMode: readOnly ? noop : setDesiredOutsideMode,
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
      setShedPowerOnThreshold: readOnly ? noop : setShedPowerOnThreshold,
      setShedPowerOffThreshold: readOnly ? noop : setShedPowerOffThreshold,
      setPoolPumpOffEmailEnabled: readOnly ? noop : setPoolPumpOffEmailEnabled,
      setDeviceCommFailureEmailEnabled: readOnly ? noop : setDeviceCommFailureEmailEnabled,
      setDeviceCommFailureMinutes: readOnly ? noop : setDeviceCommFailureMinutes,
      setCommandFailedEmailEnabled: readOnly ? noop : setCommandFailedEmailEnabled,
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
      crestronScenes,
      crestronLights,
      outsideTransformers,
      outsideMode,
      weather,
      sun,
      shedPowerOn,
      deviceCommStatus,
      shedPowerSettings,
      poolPumpOffEmailEnabled,
      deviceCommFailureEmailEnabled,
      deviceCommFailureMinutes,
      commandFailedEmailEnabled,
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
      setShedPower,
      setPoolLights,
      turnPoolPumpOn,
      setThermostatMode,
      setThermostatSetpoint,
      setOutsideTransformer,
      setOutsideTransformerBrightness,
      setDesiredOutsideMode,
      setMainGarageDoor,
      setWorkshopGarageDoor,
      setGateOpen,
      setCrestronLight,
      setCrestronLightBrightness,
      setCrestronLightRoom,
      activateCrestronScene,
      setShedPowerOnThreshold,
      setShedPowerOffThreshold,
      setPoolPumpOffEmailEnabled,
      setDeviceCommFailureEmailEnabled,
      setDeviceCommFailureMinutes,
      setCommandFailedEmailEnabled,
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
