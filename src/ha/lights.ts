import type { EntityRegistryEntry } from './ws'
import type { HaState } from './positions'
import type { CrestronLightRoomMap } from './storage'

export const UNASSIGNED_ROOM_KEY = 'unassigned'

export const CRESTRON_ROOM_GROUPS = [
  {
    id: 'upstairs',
    name: 'Upstairs',
    rooms: [
      { id: 'master', name: 'Master' },
      { id: 'guest-north', name: 'Guest North' },
      { id: 'guest-east', name: 'Guest East' },
      { id: 'hall', name: 'Hall' },
      { id: 'bathroom', name: 'Bathroom' },
      { id: 'stairs', name: 'Stairs' },
    ],
  },
  {
    id: 'main',
    name: 'Main floor',
    rooms: [
      { id: 'kitchen', name: 'Kitchen' },
      { id: 'dining-room', name: 'Dining Room' },
      { id: 'living-room', name: 'Living Room' },
      { id: 'office', name: 'Office' },
      { id: 'garage', name: 'Garage' },
      { id: 'hall', name: 'Hall' },
      { id: 'powder-room', name: 'Powder Room' },
      { id: 'mudroom', name: 'Mudroom' },
      { id: 'pantry', name: 'Pantry' },
      { id: 'bathroom', name: 'Bathroom' },
    ],
  },
  {
    id: 'basement',
    name: 'Basement',
    rooms: [
      { id: 'game-room', name: 'Game Room' },
      { id: 'gym', name: 'Gym' },
      { id: 'hall', name: 'Hall' },
      { id: 'east-bedroom', name: 'East Bedroom' },
      { id: 'north-bedroom', name: 'North Bedroom' },
      { id: 'bathroom', name: 'Bathroom' },
    ],
  },
  {
    id: 'outside',
    name: 'Outside',
    rooms: [
      { id: 'workshop', name: 'Workshop' },
      { id: 'house', name: 'House' },
      { id: 'pool', name: 'Pool' },
      { id: 'utility', name: 'Utility' },
    ],
  },
] as const

export type CrestronRoomGroup = (typeof CRESTRON_ROOM_GROUPS)[number]
export type CrestronRoom = CrestronRoomGroup['rooms'][number]

const ROOM_KEY_SEPARATOR = '::'

export type CrestronLight = {
  entityId: string
  name: string
  roomKey: string
  floor: string
  room: string
  dimmable: boolean
  brightness: number | null
  on: boolean | null
}

export function crestronLightsFromStates(
  states: HaState[],
  registry: EntityRegistryEntry[],
  roomMap: CrestronLightRoomMap = {},
): CrestronLight[] {
  const homeKitLightIds = new Set(
    registry
      .filter(
        (entry) =>
          (entry.platform === 'crestron_home' || entry.platform === 'homekit_controller') &&
          entry.entity_id.startsWith('light.') &&
          !/fan|outlet|no[_ ]load/i.test(
            `${entry.entity_id} ${entry.original_name ?? ''}`,
          ),
      )
      .map((entry) => entry.entity_id),
  )

  return states
    .filter((state) => homeKitLightIds.has(state.entity_id))
    .map((state) => {
      const name = cleanCrestronLightName(state.attributes.friendly_name ?? state.entity_id)
      const roomKey = roomKeyFromAssignment(roomMap[state.entity_id]?.trim(), name)
      return {
        entityId: state.entity_id,
        name,
        roomKey,
        ...roomDetails(roomKey),
        dimmable: roomKey !== 'outside::utility' && isDimmable(state),
        brightness: brightnessFromState(state),
        on: lightState(state),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function isDimmable(state: HaState): boolean {
  const modes = state.attributes.supported_color_modes
  return Array.isArray(modes) && modes.includes('brightness')
}

function brightnessFromState(state: HaState): number | null {
  const brightness = state.attributes.brightness
  return typeof brightness === 'number' ? Math.max(0, Math.min(255, brightness)) : null
}

function cleanCrestronLightName(name: string): string {
  return name.replace(/^Crestron Home Processor\s+/i, '').trim()
}

function roomKeyFromLightName(name: string): string {
  const normalized = name.toLowerCase()
  const roomRules: Array<[string, RegExp]> = [
    ['main::kitchen', /kitchen|island/],
    ['main::pantry', /pantry/],
    ['main::office', /office/],
    ['main::mudroom', /mudroom/],
    ['main::powder-room', /powder/],
    ['outside::utility', /heat tape/],
    ['main::garage', /garage|mech/],
    ['outside::workshop', /shop/],
    ['main::living-room', /sitting rm|media rm|theater/],
    ['upstairs::stairs', /upper stair/],
    ['basement::stairs', /lower stair/],
    ['outside::house', /outside|front door|side door|floodlight|walkway|pond|pool|patio|pergola/],
  ]

  return roomRules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? UNASSIGNED_ROOM_KEY
}

function roomKeyFromAssignment(assignment: string | undefined, lightName: string): string {
  if (assignment === UNASSIGNED_ROOM_KEY) return UNASSIGNED_ROOM_KEY
  if (assignment && findRoom(assignment)) return assignment

  const legacyMatch = CRESTRON_ROOM_GROUPS.flatMap((floor) =>
    floor.rooms.map((room) => ({ key: `${floor.id}${ROOM_KEY_SEPARATOR}${room.id}`, name: room.name })),
  ).filter((room) => room.name.toLowerCase() === assignment?.toLowerCase())
  if (legacyMatch.length === 1) return legacyMatch[0].key

  return roomKeyFromLightName(lightName)
}

function findRoom(roomKey: string): { floor: CrestronRoomGroup; room: CrestronRoom } | null {
  const [floorId, roomId] = roomKey.split(ROOM_KEY_SEPARATOR)
  const floor = CRESTRON_ROOM_GROUPS.find((item) => item.id === floorId)
  const room = floor?.rooms.find((item) => item.id === roomId)
  return floor && room ? { floor, room } : null
}

function roomDetails(roomKey: string): {
  floor: string
  room: string
} {
  const details = findRoom(roomKey)
  return details
    ? { floor: details.floor.name, room: details.room.name }
    : { floor: 'Unassigned', room: 'Unassigned' }
}

function lightState(state: HaState): boolean | null {
  if (state.state === 'on') return true
  if (state.state === 'off') return false
  return null
}
