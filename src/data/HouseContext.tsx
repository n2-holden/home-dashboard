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
import { HaClient } from '../ha/client'
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
import { fetchPvCache, type PvCacheSnapshot } from '../ha/pvCache'
import { fetchShedCache, type ShedCacheSnapshot } from '../ha/shedCache'
import { fetchShadesCache, type ShadesCacheSnapshot } from '../ha/shadesCache'
import {
  EMPTY_POOL,
  poolMapCount,
  poolSnapshotFromStates,
  suggestPoolEntityMap,
  type PoolEntityMap,
  type PoolSnapshot,
} from '../ha/pool'
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
  loadBaseUrl,
  loadEnergyEntityMap,
  loadPondEntityMap,
  loadPoolEntityMap,
  loadShadeEntityMap,
  loadToken,
  mergeEnergyEntityMaps,
  energyMapCount,
  saveBaseUrl,
  saveEnergyEntityMap,
  savePondEntityMap,
  savePoolEntityMap,
  saveShadeEntityMap,
  saveToken,
  syncPoolPondMapsFromShared,
  type EnergyEntityMap,
  type ShadeEntityMap,
} from '../ha/storage'
import { loadShadeScheduleOverrides, setHaEntitySchedules } from './shadeSchedules'
import { sunSnapshotFromStates, type SunSnapshot } from '../ha/sunPosition'
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
  weather: WeatherSnapshot | null
  sun: SunSnapshot | null
  /** Shed Power Kasa plug; null when unknown / unavailable */
  shedPowerOn: boolean | null
  connectionStatus: ConnectionStatus
  connectionError: string | null
  lastSyncedAt: number | null
  scheduleRevision: number
  scheduledCoverCount: number
  scheduleDebug: ScheduleDebugInfo | null
  scheduleUsesSunDefault: boolean
  scheduleHomebridgeSource: 'homebridge' | 'cache' | null
  mappedCount: number
  setShadePosition: (id: string, position: number) => void
  setShedPower: (on: boolean) => void
  openAllShades: () => void
  closeAllShades: () => void
  setFloorPosition: (floorId: FloorId, position: number) => void
  connect: (token: string, baseUrl?: string) => Promise<void>
  disconnect: () => void
  refresh: () => Promise<void>
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

export function HouseProvider({ children }: { children: ReactNode }) {
  const [shades, setShades] = useState<Shade[]>(INITIAL_SHADES)
  const [entityMap, setEntityMap] = useState<ShadeEntityMap>(() => loadShadeEntityMap())
  const [energyMap, setEnergyMap] = useState<EnergyEntityMap>(() => loadEnergyEntityMap())
  const [poolMap, setPoolMap] = useState<PoolEntityMap>(() => loadPoolEntityMap())
  const [pondMap, setPondMap] = useState<PondEntityMap>(() => loadPondEntityMap())
  const [covers, setCovers] = useState<HaCover[]>([])
  const [sensors, setSensors] = useState<HaSensor[]>([])
  const [energy, setEnergy] = useState<EnergySnapshot>(EMPTY_ENERGY)
  const [shedPowerOn, setShedPowerOn] = useState<boolean | null>(null)
  const [pool, setPool] = useState<PoolSnapshot>(EMPTY_POOL)
  const [pond, setPond] = useState<PondSnapshot>(EMPTY_POND)
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

  const syncFromHa = useCallback(async () => {
    const client = clientRef.current
    if (!client) return

    const states = await client.getStates()
    statesRef.current = states
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

    refreshSun()

    setLastSyncedAt(Date.now())
    setConnectionStatus('connected')
    setConnectionError(null)
  }, [refreshSun])

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
      await syncSchedulesFromHa()
      await syncFromHa()
    } catch (err) {
      setConnectionStatus('error')
      setConnectionError(err instanceof Error ? err.message : 'Refresh failed')
    }
  }, [syncFromHa, syncSchedulesFromHa])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.all([
        hydrateHaConfig(),
        loadShadeScheduleOverrides(),
        loadShadeScheduleMap(),
        loadHomebridgeScheduleConfig(),
      ])
      const [nextShades, nextEnergy, nextPool, nextPond] = await Promise.all([
        hydrateShadeEntityMap(),
        hydrateEnergyEntityMap(),
        hydratePoolEntityMap(),
        hydratePondEntityMap(),
      ])
      if (cancelled) return
      setEntityMap(nextShades)
      setPoolMap(nextPool)
      setPondMap(nextPond)
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
    (on: boolean) => {
      const client = clientRef.current
      if (!client) return
      setShedPowerOn(on)
      void (async () => {
        try {
          await client.setSwitch(SHED_POWER_SWITCH_ENTITY, on)
          await syncFromHa()
        } catch (err) {
          setConnectionError(err instanceof Error ? err.message : 'Failed to set Shed Power')
          await syncFromHa().catch(() => undefined)
        }
      })()
    },
    [syncFromHa],
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
      weather,
      sun,
      shedPowerOn,
      connectionStatus,
      connectionError,
      lastSyncedAt,
      scheduleRevision,
      scheduledCoverCount,
      scheduleDebug,
      scheduleUsesSunDefault,
      scheduleHomebridgeSource,
      mappedCount,
      setShadePosition,
      setShedPower,
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
      weather,
      sun,
      shedPowerOn,
      connectionStatus,
      connectionError,
      lastSyncedAt,
      scheduleRevision,
      scheduledCoverCount,
      scheduleDebug,
      scheduleUsesSunDefault,
      scheduleHomebridgeSource,
      mappedCount,
      setShadePosition,
      setShedPower,
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
