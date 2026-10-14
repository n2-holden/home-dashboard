import type { HaState } from './positions'

/** DoorBird A1081 relay — press toggles hold-open latch. */
export const GATE_RELAY_BUTTON = 'button.doorstation_1ccae375bf98_relay_ghlkha_1'

/** DoorBird live camera (same physical doorstation as the relay). */
export const GATE_DOORBIRD_CAMERA = 'camera.doorstation_1ccae375bf98_live'

/** Shelly Pro input — on means gate is fully closed. */
export const GATE_CLOSED_SENSOR = 'binary_sensor.outside_gate_i_o_input_1'

/** Shelly Pro input 0 — driveway alarm contact (same device as {@link GATE_CLOSED_SENSOR}). */
export const GATE_DRIVEWAY_ALARM_SENSOR = 'binary_sensor.outside_gate_i_o_input_0'

/** UI / poll give-up while waiting for a slow close (~1 min travel). */
export const GATE_CLOSE_PENDING_MS = 90_000

/** Faster open travel. */
export const GATE_OPEN_PENDING_MS = 30_000

/** How long the driveway alarm sensor may stay Off before “blocked”. */
export const DRIVEWAY_SENSOR_BLOCKED_MS = 30 * 60 * 1000

/** @deprecated Use {@link DRIVEWAY_SENSOR_BLOCKED_MS}. */
export const GATE_SENSOR_BLOCKED_MS = DRIVEWAY_SENSOR_BLOCKED_MS

export type GateStatus = 'open' | 'opening' | 'closing' | 'closed'

export type GateSnapshot = {
  relayEntityId: string
  sensorEntityId: string
  /** true = open / opening, false = closed / closing, null = unknown */
  isOpen: boolean | null
  status: GateStatus | null
  /** DoorBird offline — gate icon shows red X / control disabled. */
  doorbirdOffline: boolean
  /** Shelly gate I/O offline — driveway alarm icon shows red X. */
  sensorOffline: boolean
  /**
   * Driveway alarm sensor has been Off for ≥ {@link DRIVEWAY_SENSOR_BLOCKED_MS}.
   * Shows “Gate - Sensor (driveway blocked)” in Last Communication + no-symbol by driveway icon.
   */
  sensorBlocked: boolean
  /** When the driveway sensor went Off (start of blocked window), if known. */
  sensorBlockedSinceMs: number | null
  /** Same as {@link doorbirdOffline} (gate control / red X). */
  offline: boolean
}

export const EMPTY_GATE: GateSnapshot = {
  relayEntityId: GATE_RELAY_BUTTON,
  sensorEntityId: GATE_CLOSED_SENSOR,
  isOpen: null,
  status: null,
  doorbirdOffline: true,
  sensorOffline: true,
  sensorBlocked: false,
  sensorBlockedSinceMs: null,
  offline: true,
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

function entityIsBad(states: HaState[], entityId: string): boolean {
  const state = states.find((entry) => entry.entity_id === entityId)
  if (!state) return true
  const raw = String(state.state ?? '').toLowerCase()
  return raw === 'unavailable' || raw === 'unknown' || raw === ''
}

/**
 * Driveway alarm contact Off for ≥ 30 minutes → treated as blocked.
 */
export function drivewaySensorBlocked(
  states: HaState[],
  sensorEntityId = GATE_DRIVEWAY_ALARM_SENSOR,
  now = Date.now(),
  blockedAfterMs = DRIVEWAY_SENSOR_BLOCKED_MS,
): { blocked: boolean; sinceMs: number | null } {
  const state = states.find((entry) => entry.entity_id === sensorEntityId)
  if (!state) return { blocked: false, sinceMs: null }
  const raw = String(state.state ?? '').toLowerCase()
  if (raw !== 'off') return { blocked: false, sinceMs: null }
  const sinceMs = parseIsoMs(state.last_changed ?? state.last_updated)
  if (sinceMs == null) return { blocked: false, sinceMs: null }
  return { blocked: now - sinceMs >= blockedAfterMs, sinceMs }
}

/** @deprecated Use {@link drivewaySensorBlocked}. */
export const gateClosedSensorBlocked = drivewaySensorBlocked

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
  ids: { relay: string; closedSensor: string; drivewaySensor?: string } = {
    relay: GATE_RELAY_BUTTON,
    closedSensor: GATE_CLOSED_SENSOR,
    drivewaySensor: GATE_DRIVEWAY_ALARM_SENSOR,
  },
): GateSnapshot {
  const drivewayId = ids.drivewaySensor ?? GATE_DRIVEWAY_ALARM_SENSOR
  const sensorOffline =
    entityIsBad(states, ids.closedSensor) || entityIsBad(states, drivewayId)

  // DoorBird is down when the relay is gone, or the live camera reports unavailable.
  const relayBad = entityIsBad(states, ids.relay)
  const cameraState = states.find((entry) => entry.entity_id === GATE_DOORBIRD_CAMERA)
  const cameraBad =
    cameraState != null &&
    (() => {
      const raw = String(cameraState.state ?? '').toLowerCase()
      return raw === 'unavailable' || raw === 'unknown'
    })()
  const doorbirdOffline = relayBad || cameraBad

  const isOpen = gateIsOpen(states, ids.closedSensor)
  const blocked = drivewaySensorBlocked(states, drivewayId)

  return {
    relayEntityId: ids.relay,
    sensorEntityId: ids.closedSensor,
    isOpen: sensorOffline ? null : isOpen,
    status: sensorOffline || isOpen == null ? null : isOpen ? 'open' : 'closed',
    doorbirdOffline,
    sensorOffline,
    sensorBlocked: blocked.blocked,
    sensorBlockedSinceMs: blocked.blocked ? blocked.sinceMs : null,
    offline: doorbirdOffline,
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
