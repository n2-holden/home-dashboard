import type { HaState } from './positions'
import { formatHvacModeLabel } from './climateFormat'

export type AcFloorId = 'upstairs' | 'main' | 'basement'

export type AcFloorGroup = {
  id: AcFloorId
  label: string
  rooms: Array<{
    id: string
    label: string
    match: RegExp
  }>
}

export const AC_FLOOR_GROUPS: AcFloorGroup[] = [
  {
    id: 'upstairs',
    label: 'Upstairs',
    rooms: [
      { id: 'master-bedroom', label: 'Master Bedroom', match: /master.?bed(room)?|master.?suite/ },
      { id: 'upstairs-hall', label: 'Upstairs Hall', match: /upstairs.?hall/ },
      { id: 'east-bedroom', label: 'East Bedroom', match: /east.?bed(room)?|round.?room/ },
      { id: 'north-bedroom', label: 'North Bedroom', match: /north.?bed(room)?/ },
      { id: 'guest-bedroom', label: 'Guest Bedroom', match: /guest.?bed(room)?/ },
    ],
  },
  {
    id: 'main',
    label: 'Main floor',
    rooms: [
      { id: 'office', label: 'Office', match: /office/ },
      { id: 'living-room', label: 'Living Room', match: /living.?room/ },
      { id: 'family-room', label: 'Family Room', match: /family.?room/ },
      { id: 'dining-room', label: 'Dining Room', match: /dining.?room/ },
      { id: 'kitchen', label: 'Kitchen', match: /kitchen/ },
      { id: 'pantry', label: 'Pantry', match: /pantry/ },
    ],
  },
  {
    id: 'basement',
    label: 'Basement',
    rooms: [
      { id: 'theater', label: 'Theater', match: /theater/ },
      { id: 'gym', label: 'Gym', match: /gym/ },
      {
        id: 'east-bedroom',
        label: 'East Bedroom',
        match: /base.?east.?bed|basement.?east.?bed/,
      },
      {
        id: 'north-bedroom',
        label: 'North Bedroom',
        match: /base.?north.?bed|basement.?north.?bed/,
      },
      { id: 'downstairs-hall', label: 'Downstairs Hall', match: /downstairs.?hall/ },
    ],
  },
]

/** First match wins — specific names before generic patterns. */
const AC_ROOM_RULES: Array<{
  floorId: AcFloorId
  roomId: string
  roomLabel: string
  match: RegExp
}> = [
  { floorId: 'upstairs', roomId: 'upstairs-hall', roomLabel: 'Upstairs Hall', match: /upstairs.?hall/ },
  { floorId: 'main', roomId: 'family-room', roomLabel: 'Family Room', match: /family.?room/ },
  {
    floorId: 'basement',
    roomId: 'east-bedroom',
    roomLabel: 'East Bedroom',
    match: /base.?east.?bed|basement.?east.?bed/,
  },
  {
    floorId: 'basement',
    roomId: 'north-bedroom',
    roomLabel: 'North Bedroom',
    match: /base.?north.?bed|basement.?north.?bed/,
  },
  { floorId: 'basement', roomId: 'downstairs-hall', roomLabel: 'Downstairs Hall', match: /downstairs.?hall/ },
  { floorId: 'basement', roomId: 'theater', roomLabel: 'Theater', match: /theater/ },
  { floorId: 'basement', roomId: 'gym', roomLabel: 'Gym', match: /gym/ },
  { floorId: 'upstairs', roomId: 'master-bedroom', roomLabel: 'Master Bedroom', match: /master.?bed(room)?|master.?suite/ },
  { floorId: 'upstairs', roomId: 'east-bedroom', roomLabel: 'East Bedroom', match: /east.?bed(room)?|round.?room/ },
  { floorId: 'upstairs', roomId: 'north-bedroom', roomLabel: 'North Bedroom', match: /north.?bed(room)?/ },
  { floorId: 'upstairs', roomId: 'guest-bedroom', roomLabel: 'Guest Bedroom', match: /guest.?bed(room)?/ },
  { floorId: 'main', roomId: 'office', roomLabel: 'Office', match: /office/ },
  { floorId: 'main', roomId: 'living-room', roomLabel: 'Living Room', match: /living.?room/ },
  { floorId: 'main', roomId: 'dining-room', roomLabel: 'Dining Room', match: /dining.?room/ },
  { floorId: 'main', roomId: 'kitchen', roomLabel: 'Kitchen', match: /kitchen/ },
  { floorId: 'main', roomId: 'pantry', roomLabel: 'Pantry', match: /pantry/ },
]

export type AcUnitSnapshot = {
  entityId: string
  name: string
  roomId: string | null
  roomLabel: string | null
  floorId: AcFloorId | null
  mode: string
  hvacModes: string[]
  modeLabel: string
  currentTempF: number | null
  currentTempLabel: string
  setpointNative: number | null
  setpointF: number | null
  setpointLabel: string
  minTempNative: number
  maxTempNative: number
  minTempF: number
  maxTempF: number
  temperatureUnit: 'C' | 'F'
  heating: boolean
  cooling: boolean
}

export type AcSnapshot = {
  units: AcUnitSnapshot[]
  coolingCount: number
  totalCount: number
}

export const EMPTY_AC: AcSnapshot = {
  units: [],
  coolingCount: 0,
  totalCount: 0,
}

export function isMiniSplitAc(state: HaState): boolean {
  if (!state.entity_id.startsWith('climate.')) return false
  if (/pentair|screenlogic/.test(state.entity_id)) return false

  if (typeof state.attributes.serial === 'string') return true
  if (Array.isArray(state.attributes.swing_modes) && state.attributes.swing_modes.length > 0) {
    return true
  }

  const hvacModes = stringListAttr(state, 'hvac_modes')
  if (hvacModes.includes('dry')) return true

  const fanModes = stringListAttr(state, 'fan_modes')
  if (fanModes.some((mode) => /superquiet|superpowerful/i.test(mode))) return true

  return false
}

export function acSnapshotFromStates(states: HaState[]): AcSnapshot {
  const units = states
    .filter(isMiniSplitAc)
    .map(acUnitFromState)
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    units,
    coolingCount: units.filter((item) => item.cooling).length,
    totalCount: units.length,
  }
}

export function acGroupedByFloor(
  units: AcUnitSnapshot[],
): Array<{ floor: AcFloorGroup; units: AcUnitSnapshot[] }> {
  return AC_FLOOR_GROUPS.map((floor) => ({
    floor,
    units: floor.rooms
      .map(
        (room) =>
          units.find(
            (item) => item.floorId === floor.id && item.roomLabel === room.label,
          ) ?? null,
      )
      .filter((item): item is AcUnitSnapshot => item != null),
  }))
}

export function acUnitsForFloor(floorId: AcFloorId, units: AcUnitSnapshot[]): AcUnitSnapshot[] {
  const grouped =
    acGroupedByFloor(units).find((group) => group.floor.id === floorId)?.units ?? []
  if (floorId !== 'basement') return grouped
  return [...grouped, ...acUnassignedUnits(units)]
}

function acUnitFromState(state: HaState): AcUnitSnapshot {
  const temperatureUnit = temperatureUnitFromState(state)
  const currentNative = numericAttr(state, 'current_temperature')
  const setpointNative = numericAttr(state, 'temperature')
  const assignment = assignAcRoom(state)
  const minTempNative = numericAttr(state, 'min_temp') ?? (temperatureUnit === 'C' ? 16 : 60)
  const maxTempNative = numericAttr(state, 'max_temp') ?? (temperatureUnit === 'C' ? 31 : 88)
  const hvacModes = stringListAttr(state, 'hvac_modes')
  const mode = state.state || 'off'
  const currentTempF = toDisplayF(currentNative, temperatureUnit)
  const setpointF = toDisplayF(setpointNative, temperatureUnit)

  return {
    entityId: state.entity_id,
    name: cleanName(state.attributes.friendly_name ?? state.entity_id),
    roomId: assignment?.roomId ?? null,
    roomLabel: assignment?.roomLabel ?? null,
    floorId: assignment?.floorId ?? null,
    mode,
    hvacModes: hvacModes.length > 0 ? hvacModes : [mode],
    modeLabel: formatHvacModeLabel(mode, state),
    currentTempF,
    currentTempLabel: formatTempF(currentTempF),
    setpointNative,
    setpointF,
    setpointLabel: formatTempF(setpointF),
    minTempNative,
    maxTempNative,
    minTempF: toDisplayF(minTempNative, temperatureUnit) ?? 60,
    maxTempF: toDisplayF(maxTempNative, temperatureUnit) ?? 88,
    temperatureUnit,
    heating: state.attributes.hvac_action === 'heating',
    cooling: state.attributes.hvac_action === 'cooling',
  }
}

function assignAcRoom(state: HaState): {
  floorId: AcFloorId
  roomId: string
  roomLabel: string
} | null {
  const haystack = normalizeHaystack(
    `${state.entity_id} ${state.attributes.friendly_name ?? ''}`,
  )

  for (const room of AC_ROOM_RULES) {
    if (room.match.test(haystack)) {
      return {
        floorId: room.floorId,
        roomId: room.roomId,
        roomLabel: room.roomLabel,
      }
    }
  }

  return null
}

export function acUnassignedUnits(units: AcUnitSnapshot[]): AcUnitSnapshot[] {
  const assigned = new Set(
    acGroupedByFloor(units).flatMap((group) => group.units.map((item) => item.entityId)),
  )
  return units.filter((item) => !assigned.has(item.entityId))
}

function normalizeHaystack(value: string): string {
  return value.toLowerCase().replace(/[_\s]+/g, ' ')
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

function temperatureUnitFromState(state: HaState): 'C' | 'F' {
  const minTemp = numericAttr(state, 'min_temp')
  const maxTemp = numericAttr(state, 'max_temp')
  const currentTemp = numericAttr(state, 'current_temperature')

  // Mitsubishi via ha_kumo_ws often reports °C in attributes but values are already °F.
  if (minTemp != null && minTemp >= 40) return 'F'
  if (maxTemp != null && maxTemp >= 90) return 'F'
  if (currentTemp != null && currentTemp >= 40 && currentTemp <= 100) return 'F'

  const raw = state.attributes.temperature_unit ?? state.attributes.unit_of_measurement
  if (typeof raw === 'string' && raw.toUpperCase().includes('F')) return 'F'
  return 'C'
}

function toDisplayF(value: number | null, unit: 'C' | 'F'): number | null {
  if (value == null || !Number.isFinite(value)) return null
  if (unit === 'F') return value
  return (value * 9) / 5 + 32
}

export function toNativeTemp(valueF: number, unit: 'C' | 'F'): number {
  if (unit === 'F') return valueF
  return ((valueF - 32) * 5) / 9
}

function stringListAttr(state: HaState, key: string): string[] {
  const raw = state.attributes[key]
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string')
}

function numericAttr(state: HaState, key: string): number | null {
  const raw = state.attributes[key]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  }
  return null
}

function formatTempF(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}°`
}
