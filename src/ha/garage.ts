import type { HaState } from './positions'

export type GarageDoorIds = {
  cover: string
  /** Optional — commercial DGO / GDO White may not expose these. */
  motor?: string
  obstruction?: string
  synced?: string
  /**
   * Optional TOF distance sensor used as door position.
   * Workshop commercial DGO: finite meters = open, unknown/unavailable = closed.
   */
  distanceSensor?: string
}

/** ESPHome / GDO Blaq Main Garage door. */
export const MAIN_GARAGE: GarageDoorIds = {
  cover: 'cover.gdo_blaq_e67e04_garage_door',
  motor: 'binary_sensor.gdo_blaq_e67e04_motor',
  obstruction: 'binary_sensor.gdo_blaq_e67e04_obstruction',
  synced: 'binary_sensor.gdo_blaq_e67e04_synced',
}

/** ESPHome commercial DGO on GDO White (Workshop). */
export const WORKSHOP_GARAGE: GarageDoorIds = {
  cover: 'cover.garage_door_opener_5172e8_garage_door',
  distanceSensor: 'sensor.garage_door_opener_5172e8_sensor_distance',
}

/** @deprecated Use MAIN_GARAGE.cover */
export const MAIN_GARAGE_COVER_ENTITY = MAIN_GARAGE.cover

export type GarageDoorStatus = 'open' | 'opening' | 'closing' | 'closed' | 'stuck'

export type GarageDoorSnapshot = {
  entityId: string | null
  /** true = open / opening, false = closed / closing, null = unknown / missing */
  isOpen: boolean | null
  status: GarageDoorStatus | null
  state: string | null
  position: number | null
  motorOn: boolean | null
  obstructed: boolean | null
  /** false = opener not synced / offline */
  synced: boolean | null
  offline: boolean
  /** Raw distance meters when a distance sensor is configured. */
  distanceMeters: number | null
}

export const EMPTY_GARAGE: GarageDoorSnapshot = {
  entityId: null,
  isOpen: null,
  status: null,
  state: null,
  position: null,
  motorOn: null,
  obstructed: null,
  synced: null,
  offline: true,
  distanceMeters: null,
}

function binaryOn(states: HaState[], entityId: string): boolean | null {
  const state = states.find((entry) => entry.entity_id === entityId)
  if (!state) return null
  if (state.state === 'on') return true
  if (state.state === 'off') return false
  return null
}

/**
 * Workshop TOF: a numeric reading means the door is open (sensor sees the door leaf / path).
 * `unknown` / `unavailable` means closed (sensor blocked or out of range).
 */
export function distanceSensorIsOpen(states: HaState[], entityId: string): boolean | null {
  const state = states.find((entry) => entry.entity_id === entityId)
  if (!state) return null
  const raw = String(state.state ?? '').trim().toLowerCase()
  if (raw === 'unknown' || raw === 'unavailable' || raw === '') return false
  const meters = Number(state.state)
  if (!Number.isFinite(meters)) return null
  return true
}

export function distanceSensorMeters(states: HaState[], entityId: string): number | null {
  const state = states.find((entry) => entry.entity_id === entityId)
  if (!state) return null
  const meters = Number(state.state)
  return Number.isFinite(meters) ? meters : null
}

export function garageStatusLabel(status: GarageDoorStatus | null): string {
  switch (status) {
    case 'open':
      return 'Open'
    case 'opening':
      return 'Opening'
    case 'closing':
      return 'Closing'
    case 'closed':
      return 'Closed'
    case 'stuck':
      return 'Stuck'
    default:
      return 'Unavailable'
  }
}

export function garageDoorFromStates(
  states: HaState[],
  ids: GarageDoorIds = MAIN_GARAGE,
): GarageDoorSnapshot {
  const state = states.find((entry) => entry.entity_id === ids.cover)
  if (!state) return EMPTY_GARAGE

  const raw = state.state.toLowerCase()
  const position =
    typeof state.attributes.current_position === 'number'
      ? state.attributes.current_position
      : null
  const motorOn = ids.motor ? binaryOn(states, ids.motor) : null
  const obstructed = ids.obstruction ? binaryOn(states, ids.obstruction) : null
  const synced = ids.synced ? binaryOn(states, ids.synced) : null
  const distanceMeters = ids.distanceSensor
    ? distanceSensorMeters(states, ids.distanceSensor)
    : null
  const distanceOpen = ids.distanceSensor
    ? distanceSensorIsOpen(states, ids.distanceSensor)
    : null
  const coverUnavailable = raw === 'unavailable' || raw === 'unknown'
  // Blaq: require synced=on. Commercial DGO: online whenever the cover entity is available.
  const offline = ids.synced ? synced !== true : coverUnavailable

  let status: GarageDoorStatus
  // Distance sensor is authoritative for this commercial DGO (cover often lies).
  if (distanceOpen === true) status = 'open'
  else if (distanceOpen === false) status = 'closed'
  else if (raw === 'opening') status = 'opening'
  else if (raw === 'closing') status = 'closing'
  else if (raw === 'open') status = 'open'
  else if (raw === 'closed') status = 'closed'
  else if (obstructed === true) status = 'stuck'
  else if (
    position != null &&
    position > 5 &&
    position < 95 &&
    motorOn === false &&
    raw !== 'open' &&
    raw !== 'closed'
  ) {
    status = 'stuck'
  } else if (position != null && position >= 50) status = 'open'
  else if (position != null) status = 'closed'
  else status = 'stuck'

  const isOpen =
    status === 'open' || status === 'opening'
      ? true
      : status === 'closed' || status === 'closing'
        ? false
        : position != null
          ? position >= 50
          : null

  return {
    entityId: state.entity_id,
    isOpen,
    status,
    state: state.state,
    position,
    motorOn,
    obstructed,
    synced: ids.synced ? synced : coverUnavailable ? false : true,
    offline,
    distanceMeters,
  }
}

/** Confirm open/closed for pending UI / polls. Prefer distance sensor when configured. */
export function garageIsOpen(
  states: HaState[],
  entityIdOrIds: string | GarageDoorIds,
): boolean | null {
  if (typeof entityIdOrIds !== 'string') {
    if (entityIdOrIds.distanceSensor) {
      const fromDistance = distanceSensorIsOpen(states, entityIdOrIds.distanceSensor)
      if (fromDistance != null) return fromDistance
    }
    return garageIsOpen(states, entityIdOrIds.cover)
  }

  const state = states.find((entry) => entry.entity_id === entityIdOrIds)
  if (!state) return null
  const raw = state.state.toLowerCase()
  if (raw === 'open') return true
  if (raw === 'closed') return false
  // opening/closing are transitional — not confirmed yet
  return null
}
