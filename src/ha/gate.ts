import type { HaState } from './positions'

/** DoorBird A1081 relay — press toggles hold-open latch. */
export const GATE_RELAY_BUTTON = 'button.doorstation_1ccae375bf98_relay_ghlkha_1'

/** Shelly Pro input — on means gate is fully closed. */
export const GATE_CLOSED_SENSOR = 'binary_sensor.outside_gate_i_o_input_1'

/** UI / poll give-up while waiting for a slow close (~1 min travel). */
export const GATE_CLOSE_PENDING_MS = 90_000

/** Faster open travel. */
export const GATE_OPEN_PENDING_MS = 30_000

export type GateStatus = 'open' | 'opening' | 'closing' | 'closed'

export type GateSnapshot = {
  relayEntityId: string
  sensorEntityId: string
  /** true = open / opening, false = closed / closing, null = unknown */
  isOpen: boolean | null
  status: GateStatus | null
  offline: boolean
}

export const EMPTY_GATE: GateSnapshot = {
  relayEntityId: GATE_RELAY_BUTTON,
  sensorEntityId: GATE_CLOSED_SENSOR,
  isOpen: null,
  status: null,
  offline: true,
}

/** Shelly on = closed → isOpen false. */
export function gateIsOpen(states: HaState[], sensorEntityId = GATE_CLOSED_SENSOR): boolean | null {
  const state = states.find((entry) => entry.entity_id === sensorEntityId)
  if (!state) return null
  const raw = String(state.state ?? '').toLowerCase()
  if (raw === 'unavailable' || raw === 'unknown' || raw === '') return null
  if (raw === 'on') return false
  if (raw === 'off') return true
  return null
}

export function gateFromStates(
  states: HaState[],
  ids: { relay: string; closedSensor: string } = {
    relay: GATE_RELAY_BUTTON,
    closedSensor: GATE_CLOSED_SENSOR,
  },
): GateSnapshot {
  const sensor = states.find((entry) => entry.entity_id === ids.closedSensor)
  const relay = states.find((entry) => entry.entity_id === ids.relay)
  const isOpen = gateIsOpen(states, ids.closedSensor)
  const sensorMissing = !sensor
  const sensorBad =
    sensor != null &&
    (sensor.state === 'unavailable' || sensor.state === 'unknown')
  const relayMissing = !relay
  const offline = sensorMissing || sensorBad || relayMissing || isOpen == null

  return {
    relayEntityId: ids.relay,
    sensorEntityId: ids.closedSensor,
    isOpen: offline ? null : isOpen,
    status: offline ? null : isOpen ? 'open' : 'closed',
    offline,
  }
}

export function gateStatusLabel(status: GateStatus | null): string {
  switch (status) {
    case 'open':
      return 'Open'
    case 'opening':
      return 'Opening'
    case 'closing':
      return 'Closing'
    case 'closed':
      return 'Closed'
    default:
      return 'Unavailable'
  }
}
