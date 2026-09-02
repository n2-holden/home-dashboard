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
  sensorFromState,
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
  discoverPoolSamLightEntityIds,
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
  SHED_POWER_OFF_SOC_ENTITY,
  SHED_POWER_ON_SOC_ENTITY,
  shedPowerSettingsFromStates,
  type ShedPowerSettings,
} from '../ha/shedPowerSettings'
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
  crestronScenes: CrestronScene[]
  outsideTransformers: OutsideTransformer[]
  outsideMode: OutsideMode
  weather: WeatherSnapshot | null
  sun: SunSnapshot | null
  /** Shed Power Kasa plug; null when unknown / unavailable */
  shedPowerOn: boolean | null
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
  setThermostatMode: (entityId: string, mode: string) => Promise<void>
  setThermostatSetpoint: (entityId: string, temperature: number) => Promise<void>
  setOutsideTransformer: (key: OutsideControlKey, on: boolean) => Promise<void>
  setOutsideTransformerBrightness: (key: OutsideControlKey, percent: number) => void
  setOutsideMode: (mode: OutsideMode) => void
  setShedPowerOnThreshold: (value: number) => void
  setShedPowerOffThreshold: (value: number) => void
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
  }
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
  const [pool, setPool] = useState<PoolSnapshot>(EMPTY_POOL)
  const [pond, setPond] = useState<PondSnapshot>(EMPTY_POND)
  const [hvac, setHvac] = useState<HvacSnapshot>(EMPTY_HVAC)
  const [ac, setAc] = useState<AcSnapshot>(EMPTY_AC)
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
  const outsideBrightnessSetAtRef = useRef<Partial<Record<OutsideControlKey, number>>>({})
  const pvCacheRef = useRef<PvCacheSnapshot | null>(null)
  const shedCacheRef = useRef<ShedCacheSnapshot | null>(null)
  const shadesCacheRef = useRef<ShadesCacheSnapshot | null>(null)
  const statesRef = useRef<HaState[]>([])
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

    setWeather(weatherSnapshot(pickedWeather))

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
    setPool(poolSnapshotFromStates(nextPoolMap, states))

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
    setPond(pondSnapshotFromStates(nextPondMap, states))
    setHvac(hvacSnapshotFromStates(states))
    setAc(acSnapshotFromStates(states))
    setOutsideTransformers((previous) => {
      const previousByKey = new Map(
        previous.flatMap((transformer) =>
          transformer.controls.map((control) => [control.key, control] as const),
        ),
      )
      return outsideTransformersFromStates(states).map((transformer) => ({
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

    const syncedMaps = await syncPoolPondMapsFromShared(
      poolMapRef.current,
      pondMapRef.current,
    )
    if (syncedMaps.changed) {
      poolMapRef.current = syncedMaps.pool
      pondMapRef.current = syncedMaps.pond
      setPoolMap(syncedMaps.pool)
      setPondMap(syncedMaps.pond)
      setPool(poolSnapshotFromStates(syncedMaps.pool, states))
      setPond(pondSnapshotFromStates(syncedMaps.pond, states))
    }

    const shedPowerState = states.find((s) => s.entity_id === SHED_POWER_SWITCH_ENTITY)
    if (!shedPowerState || shedPowerState.state === 'unavailable' || shedPowerState.state === 'unknown') {
      setShedPowerOn(null)
    } else {
      setShedPowerOn(shedPowerState.state === 'on')
    }
    setShedPowerSettings(shedPowerSettingsFromStates(states))

    refreshSun()

    setLastSyncedAt(Date.now())
    setConnectionStatus('connected')
    setConnectionError(null)
  }, [applyCrestronStates, refreshSun])

  const pollUntilToggleConfirmed = useCallback(
    async (isConfirmed: () => boolean) => {
      const deadline = Date.now() + PENDING_TOGGLE_POLL_MAX_MS
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
    const id = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [connectionStatus, refresh])

  useEffect(() => {
    if (connectionStatus !== 'connected') return
    void syncCrestronFromHa().catch(() => undefined)
    const id = window.setInterval(() => {
      void syncCrestronFromHa().catch(() => undefined)
    }, CRESTRON_POLL_MS)
    return () => window.clearInterval(id)
  }, [connectionStatus, syncCrestronFromHa])

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
      setEnergy((prev) => applyEnergyCaches(prev, pvCache, shedCache))
    }
    void sync()
    const id = window.setInterval(() => void sync(), POLL_MS)
    return () => window.clearInterval(id)
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
    const id = window.setInterval(() => refreshSun(), 30_000)
    return () => window.clearInterval(id)
  }, [refreshSun])

  useEffect(() => {
    const sync = async () => {
      const cache = await fetchShadesCache()
      shadesCacheRef.current = cache
      setShades((prev) => applyShadesCache(prev, cache))
    }
    void sync()
    const id = window.setInterval(() => void sync(), POLL_MS)
    return () => window.clearInterval(id)
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
          await syncFromHa()
        } catch (err) {
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
      } catch (err) {
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
      } catch (err) {
        void syncFromHa().catch(() => undefined)
        setConnectionError(err instanceof Error ? err.message : 'Failed to set pool lights')
        throw err
      }
    },
    [pollUntilToggleConfirmed, syncFromHa],
  )

  const setThermostatMode = useCallback(
    async (entityId: string, mode: string) => {
      const client = clientRef.current
      if (!client) throw new Error('Not connected to Home Assistant')

      try {
        await client.setClimateMode(entityId, mode)
        await syncFromHa()
      } catch (err) {
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
      } catch (err) {
        void syncFromHa().catch(() => undefined)
        setConnectionError(
          err instanceof Error ? err.message : `Failed to set ${control.label}`,
        )
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
          await syncFromHa()
        } catch (err) {
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
      } catch (err) {
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

  const activateCrestronScene = useCallback(
    (entityId: string) => {
      const client = clientRef.current
      if (!client || !crestronScenes.some((scene) => scene.entityId === entityId)) return
      void (async () => {
        try {
          await client.activateScene(entityId)
          await syncFromHa()
        } catch (err) {
          setConnectionError(
            err instanceof Error ? err.message : 'Failed to activate Crestron scene',
          )
        }
      })()
    },
    [crestronScenes, syncFromHa],
  )

  const setShedPowerOnThreshold = useCallback(
    (value: number) => {
      const threshold = clampSocThreshold(value)
      setShedPowerSettings((current) => ({ ...current, onBelow: threshold }))
      const client = clientRef.current
      if (!client) return
      void client.setNumber(SHED_POWER_ON_SOC_ENTITY, threshold).catch((err) => {
        setConnectionError(
          err instanceof Error ? err.message : 'Failed to save Shed Power on threshold',
        )
      })
    },
    [],
  )

  const setShedPowerOffThreshold = useCallback(
    (value: number) => {
      const threshold = clampSocThreshold(value, DEFAULT_SHED_POWER_SETTINGS.offAbove)
      setShedPowerSettings((current) => ({ ...current, offAbove: threshold }))
      const client = clientRef.current
      if (!client) return
      void client.setNumber(SHED_POWER_OFF_SOC_ENTITY, threshold).catch((err) => {
        setConnectionError(
          err instanceof Error ? err.message : 'Failed to save Shed Power off threshold',
        )
      })
    },
    [],
  )

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
      crestronScenes,
      crestronLights,
      outsideTransformers,
      outsideMode,
      weather,
      sun,
      shedPowerOn,
      shedPowerSettings,
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
      setThermostatMode: readOnly ? noopAsync : setThermostatMode,
      setThermostatSetpoint: readOnly ? noopAsync : setThermostatSetpoint,
      setOutsideTransformer: readOnly ? noopAsync : setOutsideTransformer,
      setOutsideTransformerBrightness: readOnly ? noop : setOutsideTransformerBrightness,
      setOutsideMode: readOnly ? noop : setDesiredOutsideMode,
      setCrestronLight: readOnly ? noopAsync : setCrestronLight,
      setCrestronLightBrightness: readOnly ? noop : setCrestronLightBrightness,
      setCrestronLightRoom: readOnly ? noop : setCrestronLightRoom,
      activateCrestronScene: readOnly ? noop : activateCrestronScene,
      setShedPowerOnThreshold: readOnly ? noop : setShedPowerOnThreshold,
      setShedPowerOffThreshold: readOnly ? noop : setShedPowerOffThreshold,
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
      crestronScenes,
      crestronLights,
      outsideTransformers,
      outsideMode,
      weather,
      sun,
      shedPowerOn,
      shedPowerSettings,
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
      setThermostatMode,
      setThermostatSetpoint,
      setOutsideTransformer,
      setOutsideTransformerBrightness,
      setDesiredOutsideMode,
      setCrestronLight,
      setCrestronLightBrightness,
      setCrestronLightRoom,
      activateCrestronScene,
      setShedPowerOnThreshold,
      setShedPowerOffThreshold,
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
