import { formatPower, toWatts, type HaSensor, sensorFromState } from './energy'
import type { HaState } from './positions'
import type { EntityRegistryEntry } from './ws'

export type EgaugePowerReading = {
  entityId: string
  /** Register name, e.g. "Grid" or "Solar" */
  label: string
  watts: number | null
  formatted: string
}

export type EgaugeSnapshot = {
  readings: EgaugePowerReading[]
  gridWatts: number | null
  gridFormatted: string
}

export const EMPTY_EGAUGE: EgaugeSnapshot = {
  readings: [],
  gridWatts: null,
  gridFormatted: formatPower(null),
}

/** Force-refresh eGauge power sensors this often so the House Power widget stays live. */
export const EGAUGE_POLL_MS = 1_000

/** REST sensor that polls the eGauge XML API every second. */
export const EGAUGE_LIVE_GRID_ENTITY = 'sensor.egauge_grid_live'

/**
 * Emporia Vue 3 on the shed subpanel (shed generation plus small loads). The eGauge has
 * no CT on it, so its net power is otherwise buried in "Other"; negative when exporting.
 */
export const SHED_SUBPANEL_ENTITY = 'sensor.garage_power_minute_average_2'
export const SHED_SUBPANEL_LABEL = 'Detached garage'

/** Readings that aren't eGauge registers but are fed through the Grid CTs. */
export function extraReadingsFromStates(states: HaState[]): EgaugePowerReading[] {
  const state = states.find((entry) => entry.entity_id === SHED_SUBPANEL_ENTITY)
  if (!state) return []
  const watts = toWatts(sensorFromState(state))
  return [
    {
      entityId: SHED_SUBPANEL_ENTITY,
      label: SHED_SUBPANEL_LABEL,
      watts,
      formatted: formatPower(watts),
    },
  ]
}

/** One power register from the egauge_live poller, in device order. */
export type EgaugeRegister = { name: string; watts: number }

export function parseEgaugeRegisters(value: unknown): EgaugeRegister[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is EgaugeRegister =>
      item != null &&
      typeof item === 'object' &&
      typeof (item as EgaugeRegister).name === 'string' &&
      typeof (item as EgaugeRegister).watts === 'number' &&
      Number.isFinite((item as EgaugeRegister).watts),
  )
}

/** Grid first, the remaining registers in eGauge order, then `extra`, then "Other". */
export function readingsFromRegisters(
  registers: EgaugeRegister[],
  extra: EgaugePowerReading[] = [],
): EgaugePowerReading[] {
  const grid = registers.filter((register) => register.name.toLowerCase() === 'grid')
  const rest = registers.filter((register) => register.name.toLowerCase() !== 'grid')
  return withOtherReading([
    ...[...grid, ...rest].map((register) => ({
      entityId: `egauge:${register.name}`,
      label: register.name,
      watts: register.watts,
      formatted: formatPower(register.watts),
    })),
    ...extra,
  ])
}

/** Appends "Other" = Grid minus every other register (load not on a dedicated CT). */
function withOtherReading(readings: EgaugePowerReading[]): EgaugePowerReading[] {
  const grid = readings.find((reading) => reading.label.toLowerCase() === 'grid')
  if (grid?.watts == null) return readings
  let watts = grid.watts
  for (const reading of readings) {
    if (reading === grid) continue
    if (reading.watts == null) return readings
    watts -= reading.watts
  }
  return [
    ...readings,
    { entityId: 'egauge:other', label: 'Other', watts, formatted: formatPower(watts) },
  ]
}

function hay(state: HaState): string {
  return `${state.entity_id} ${String(state.attributes.friendly_name ?? '')}`.toLowerCase()
}

function isEgaugeEntity(
  state: HaState,
  egaugeIds: Set<string>,
): boolean {
  if (!state.entity_id.startsWith('sensor.')) return false
  return egaugeIds.has(state.entity_id) || hay(state).includes('egauge')
}

function isPowerState(state: HaState): boolean {
  const deviceClass =
    typeof state.attributes.device_class === 'string' ? state.attributes.device_class : ''
  const unit = String(state.attributes.unit_of_measurement ?? '').toLowerCase()
  if (deviceClass === 'energy' || deviceClass === 'voltage' || deviceClass === 'current') {
    return false
  }
  if (deviceClass === 'power') return true
  return unit === 'w' || unit === 'kw' || unit === 'watt' || unit === 'watts'
}

/** `sensor.egauge97490_grid_power` → `grid`; `sensor.egauge_grid` → `grid` */
function registerKey(entityId: string): string {
  return entityId
    .replace(/^sensor\./, '')
    .replace(/_power$/, '')
    .replace(/^egauge\d*_/, '')
}

function labelFromState(state: HaState): string {
  const key = registerKey(state.entity_id)
  if (key) {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  const friendly = String(state.attributes.friendly_name ?? '')
    .replace(/\begauge\b/gi, '')
    .replace(/\bpower\b/gi, '')
    .trim()
  return friendly || 'Power'
}

function gridScore(reading: EgaugePowerReading): number {
  const key = registerKey(reading.entityId).toLowerCase()
  const label = reading.label.toLowerCase()
  if (key === 'grid' || label === 'grid') return 10
  if (key === 'grid_in' || label === 'grid in') return 6
  if (/\bgrid\b/.test(key) || /\bgrid\b/.test(label)) {
    if (key.includes('out') || label.includes('out')) return 2
    return 5
  }
  return 0
}

export function egaugeSnapshotFromStates(
  states: HaState[],
  registry: EntityRegistryEntry[] = [],
): EgaugeSnapshot {
  const egaugeIds = new Set(
    registry.filter((entry) => entry.platform === 'egauge').map((entry) => entry.entity_id),
  )
  const liveGrid = states.find((state) => state.entity_id === EGAUGE_LIVE_GRID_ENTITY)
  const liveRegisters = parseEgaugeRegisters(liveGrid?.attributes.registers)
  const extra = extraReadingsFromStates(states)
  if (liveRegisters.length > 0) {
    const readings = readingsFromRegisters(liveRegisters, extra)
    const gridWatts = toWatts(sensorFromState(liveGrid!))
    return { readings, gridWatts, gridFormatted: formatPower(gridWatts) }
  }

  const readings: EgaugePowerReading[] = states
    .filter((state) => state.entity_id !== EGAUGE_LIVE_GRID_ENTITY)
    .filter((state) => state.entity_id !== SHED_SUBPANEL_ENTITY)
    .filter((state) => isEgaugeEntity(state, egaugeIds))
    .filter(isPowerState)
    .map((state) => {
      const sensor: HaSensor = sensorFromState(state)
      const watts = toWatts(sensor)
      return {
        entityId: state.entity_id,
        label: labelFromState(state),
        watts,
        formatted: formatPower(watts),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  const grid = [...readings].sort((a, b) => gridScore(b) - gridScore(a))[0]
  let gridWatts = grid && gridScore(grid) > 0 ? grid.watts : null

  if (liveGrid) {
    const liveWatts = toWatts(sensorFromState(liveGrid))
    if (liveWatts != null) gridWatts = liveWatts
  }

  return {
    readings: withOtherReading([...readings, ...extra]),
    gridWatts,
    gridFormatted: formatPower(gridWatts),
  }
}
