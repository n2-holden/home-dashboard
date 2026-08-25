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
  formatPower,
  formatSoc,
  suggestBatterySocSensor,
  suggestPowerpackPowerSensor,
  suggestPvSensor,
  sumWatts,
  toPercent,
  toWatts,
  type HaSensor,
} from '../ha/energy'
import type { HaCover } from '../ha/positions'
import { suggestCover } from '../ha/suggest'
import {
  downloadJson,
  exportHaConfigFile,
  hydrateEnergyEntityMap,
  hydrateHaConfig,
  hydrateShadeEntityMap,
  loadBaseUrl,
  loadEnergyEntityMap,
  loadShadeEntityMap,
  loadToken,
  mergeEnergyEntityMaps,
  energyMapCount,
  saveBaseUrl,
  saveEnergyEntityMap,
  saveShadeEntityMap,
  saveToken,
  type EnergyEntityMap,
  type ShadeEntityMap,
} from '../ha/storage'
import { loadShadeScheduleOverrides, setHaEntitySchedules } from './shadeSchedules'
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
  powerpackLabel: string
  totalLabel: string
  batteryLabel: string
  loadLabel: string
  batteryPowerLabel: string
  gridLabel: string
}

type HouseContextValue = {
  shades: Shade[]
  entityMap: ShadeEntityMap
  covers: HaCover[]
  sensors: HaSensor[]
  energyMap: EnergyEntityMap
  energy: EnergySnapshot
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
  exportShadeMap: () => void
  exportEnergyMap: () => void
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
  powerpackLabel: formatPower(null),
  totalLabel: formatPower(null),
  batteryLabel: formatSoc(null),
  loadLabel: formatPower(null),
  batteryPowerLabel: formatBatteryFlow(null),
  gridLabel: formatPower(null),
}

function clampPosition(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
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
  const powerpackWatts = toWatts(powerpackSensor)
  const totalWatts = sumWatts(pvOnlyWatts, powerpackWatts)
  const batterySoc = toPercent(socSensor)
  const loadWatts = toWatts(loadSensor)
  const batteryPowerWatts = toWatts(batteryPowerSensor)
  const gridWatts = toWatts(gridSensor)

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
    pvOnlyGridLabel: formatPower(pvOnlyGridWatts == null ? null : Math.abs(pvOnlyGridWatts)),
    powerpackLabel: formatPower(powerpackWatts),
    totalLabel: formatPower(totalWatts),
    batteryLabel: formatSoc(batterySoc),
    loadLabel: formatPower(loadWatts),
    batteryPowerLabel: formatBatteryFlow(batteryPowerWatts),
    gridLabel: formatPower(gridWatts == null ? null : Math.abs(gridWatts)),
  }
}

function formatBatteryFlow(watts: number | null): string {
  if (watts == null) return '—'
  return formatPower(Math.abs(watts))
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
  const [covers, setCovers] = useState<HaCover[]>([])
  const [sensors, setSensors] = useState<HaSensor[]>([])
  const [energy, setEnergy] = useState<EnergySnapshot>(EMPTY_ENERGY)
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
  const shadesRef = useRef(shades)
  const coversRef = useRef(covers)
  const sensorsRef = useRef(sensors)
  entityMapRef.current = entityMap
  energyMapRef.current = energyMap
  shadesRef.current = shades
  coversRef.current = covers
  sensorsRef.current = sensors

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

    const { covers: coverList, sensors: sensorList } = await client.listCoversAndSensors()
    setCovers(coverList)
    setSensors(sensorList)

    const coversById = new Map(coverList.map((c) => [c.entityId, c]))
    setShades((prev) => applyCoverPositions(prev, entityMapRef.current, coversById))

    const sensorsById = new Map(sensorList.map((s) => [s.entityId, s]))
    setEnergy(snapshotFromSensors(energyMapRef.current, sensorsById))

    setLastSyncedAt(Date.now())
    setConnectionStatus('connected')
    setConnectionError(null)
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
    setEnergy(EMPTY_ENERGY)
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
      const [nextShades, nextEnergy] = await Promise.all([
        hydrateShadeEntityMap(),
        hydrateEnergyEntityMap(),
      ])
      if (cancelled) return
      setEntityMap(nextShades)
      // Prefer hydrated map (includes energy-map.json + repairs). Only fill gaps from
      // whatever was set in this browser while hydrate was in flight.
      setEnergyMap((current) => {
        const merged = mergeEnergyEntityMaps(nextEnergy, current)
        saveEnergyEntityMap(merged)
        return merged
      })

      const token = loadToken()
      if (token) {
        await connect(token, loadBaseUrl()).catch(() => undefined)
      } else {
        setConnectionStatus('disconnected')
      }
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
    setShades((prev) => applyCoverPositions(prev, entityMap, byId))
  }, [entityMap, covers, connectionStatus])

  useEffect(() => {
    if (connectionStatus !== 'connected') return
    const byId = new Map(sensors.map((s) => [s.entityId, s]))
    setEnergy(snapshotFromSensors(energyMap, byId))
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
        next.powerpackProduction,
        next.powerpackBatterySoc,
        next.powerpackLoad,
        next.powerpackBatteryPower,
        next.powerpackGrid,
      ].filter(Boolean) as string[]

    if (!next.pvOnlyProduction) {
      const id = suggestPvSensor(sensorsRef.current, used())
      if (id) {
        next.pvOnlyProduction = id
        added += 1
      }
    }
    // Prefer house array production from site 5478356 when available
    if (!next.pvOnlyProduction || /5904582/.test(next.pvOnlyProduction)) {
      const housePv = sensorsRef.current.find(
        (s) =>
          /5478356/.test(s.entityId) &&
          /pv_production|production_power/.test(s.entityId),
      )
      if (housePv) {
        next.pvOnlyProduction = housePv.entityId
        added += 1
      }
    }
    if (!next.pvOnlyLoad) {
      const houseLoad = sensorsRef.current.find(
        (s) => /5478356/.test(s.entityId) && /load_power/.test(s.entityId),
      )
      if (houseLoad) {
        next.pvOnlyLoad = houseLoad.entityId
        added += 1
      }
    }
    if (!next.pvOnlyGrid) {
      const houseGrid = sensorsRef.current.find(
        (s) => /5478356/.test(s.entityId) && /grid_power/.test(s.entityId),
      )
      if (houseGrid) {
        next.pvOnlyGrid = houseGrid.entityId
        added += 1
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

  // Remote browsers often have empty localStorage — auto-map Shed Solar once sensors appear.
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
          await syncFromHa()
        } catch (err) {
          setConnectionError(err instanceof Error ? err.message : 'Failed to set shade')
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
      exportHaConfig,
    }),
    [
      shades,
      entityMap,
      covers,
      sensors,
      energyMap,
      energy,
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
