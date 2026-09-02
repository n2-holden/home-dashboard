import { isMiniSplitAc } from './ac'
import { formatHvacModeLabel } from './climateFormat'
import type { HaState } from './positions'

export type HvacFloorId = 'upstairs' | 'main' | 'basement'

export type HvacFloorGroup = {
  id: HvacFloorId
  label: string
  rooms: Array<{
    id: string
    label: string
    match: RegExp
    hiddenUntilExpanded?: boolean
  }>
}

export const HVAC_FLOOR_GROUPS: HvacFloorGroup[] = [
  {
    id: 'upstairs',
    label: 'Upstairs',
    rooms: [
      { id: 'master-bedroom', label: 'Master Bedroom', match: /master.?bedroom/ },
      { id: 'master-bath', label: 'Master Bath', match: /master.?bath/ },
      { id: 'round-room', label: 'East Bedroom', match: /round.?room/ },
      { id: 'guest-bedroom', label: 'Guest Bedroom', match: /guest.?bedroom/ },
      { id: 'guest-bath', label: 'Guest Bath', match: /guest.?bath/ },
    ],
  },
  {
    id: 'main',
    label: 'Main floor',
    rooms: [
      { id: 'office', label: 'Office', match: /office/ },
      { id: 'living-room', label: 'Living Room', match: /living.?room/ },
      { id: 'dining-room', label: 'Dining Room', match: /dining.?room/ },
      { id: 'kitchen', label: 'Kitchen', match: /kitchen/ },
      { id: 'garage', label: 'Garage', match: /garage/, hiddenUntilExpanded: true },
      { id: 'pantry', label: 'Pantry', match: /pantry/ },
    ],
  },
  {
    id: 'basement',
    label: 'Basement',
    rooms: [
      { id: 'theater', label: 'Theater', match: /theater/ },
      { id: 'downstairs-hall', label: 'Downstairs Hall', match: /downstairs.?hall/ },
      { id: 'gym', label: 'Gym', match: /gym/ },
      { id: 'basement-east-bed', label: 'East Bedroom', match: /basement.?east.?bed/ },
      { id: 'basement-north-bed', label: 'North Bedroom', match: /basement.?north.?bed/ },
    ],
  },
]

export type ThermostatSnapshot = {
  entityId: string
  name: string
  roomId: string | null
  roomLabel: string | null
  floorId: HvacFloorId | null
  hiddenUntilExpanded: boolean
  mode: string
  hvacModes: string[]
  modeLabel: string
  currentTempF: number | null
  currentTempLabel: string
  setpointF: number | null
  setpointLabel: string
  minTemp: number
  maxTemp: number
  heating: boolean
}

export type HvacSnapshot = {
  thermostats: ThermostatSnapshot[]
  heatingCount: number
  totalCount: number
}

export const EMPTY_HVAC: HvacSnapshot = {
  thermostats: [],
  heatingCount: 0,
  totalCount: 0,
}

export function hvacSnapshotFromStates(states: HaState[]): HvacSnapshot {
  const thermostats = states
    .filter(isRoomThermostat)
    .map(thermostatFromState)
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    thermostats,
    heatingCount: thermostats.filter((item) => item.heating).length,
    totalCount: thermostats.length,
  }
}

export function thermostatsGroupedByFloor(
  thermostats: ThermostatSnapshot[],
): Array<{ floor: HvacFloorGroup; thermostats: ThermostatSnapshot[] }> {
  return HVAC_FLOOR_GROUPS.map((floor) => ({
    floor,
    thermostats: floor.rooms
      .map(
        (room) =>
          thermostats.find(
            (item) => item.floorId === floor.id && item.roomLabel === room.label,
          ) ?? null,
      )
      .filter((item): item is ThermostatSnapshot => item != null),
  }))
}

function isRoomThermostat(state: HaState): boolean {
  if (!state.entity_id.startsWith('climate.')) return false
  if (/pentair|screenlogic/.test(state.entity_id)) return false
  return !isMiniSplitAc(state)
}

function thermostatFromState(state: HaState): ThermostatSnapshot {
  const currentTempF = numericAttr(state, 'current_temperature')
  const setpointF = numericAttr(state, 'temperature')
  const assignment = assignThermostatRoom(state)
  const minTemp = numericAttr(state, 'min_temp') ?? 50
  const maxTemp = numericAttr(state, 'max_temp') ?? 90
  const hvacModes = stringListAttr(state, 'hvac_modes')
  const mode = state.state || 'off'

  return {
    entityId: state.entity_id,
    name: cleanThermostatName(state.attributes.friendly_name ?? state.entity_id),
    roomId: assignment?.roomId ?? null,
    roomLabel: assignment?.roomLabel ?? null,
    floorId: assignment?.floorId ?? null,
    hiddenUntilExpanded: assignment?.hiddenUntilExpanded ?? false,
    mode,
    hvacModes: hvacModes.length > 0 ? hvacModes : [mode],
    modeLabel: formatHvacModeLabel(mode, state),
    currentTempF,
    currentTempLabel: formatTempF(currentTempF),
    setpointF,
    setpointLabel: formatTempF(setpointF),
    minTemp,
    maxTemp,
    heating: state.attributes.hvac_action === 'heating',
  }
}

function assignThermostatRoom(state: HaState): {
  floorId: HvacFloorId
  roomId: string
  roomLabel: string
  hiddenUntilExpanded: boolean
} | null {
  const haystack = normalizeHaystack(
    `${state.entity_id} ${state.attributes.friendly_name ?? ''}`,
  )

  for (const floor of HVAC_FLOOR_GROUPS) {
    for (const room of floor.rooms) {
      if (room.match.test(haystack)) {
        return {
          floorId: floor.id,
          roomId: room.id,
          roomLabel: room.label,
          hiddenUntilExpanded: room.hiddenUntilExpanded ?? false,
        }
      }
    }
  }

  return null
}

function normalizeHaystack(value: string): string {
  return value.toLowerCase().replace(/[_\s]+/g, ' ')
}

function cleanThermostatName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

export { formatHvacModeLabel } from './climateFormat'

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
