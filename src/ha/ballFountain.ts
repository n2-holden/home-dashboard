import type { HaState } from './positions'
import { adjustedWaterLevelInches, formatAdjustedWaterLevelInches } from './depthFormat'
import { pondFillIsOn } from './pond'

/** YoLink depth sensor (same model as the pool's Water Depth Sensor). */
export const BALL_FOUNTAIN_DEPTH_ENTITY = 'sensor.ball_fountain_distance'
/** Tuya valve named "Ball fountain filler". */
export const BALL_FOUNTAIN_FILL_VALVE_ENTITY = 'valve.valve_controller_2_valve'
export const BALL_FOUNTAIN_FILL_AUTO_ENABLED_ENTITY = 'input_boolean.ball_fountain_fill_auto_enabled'
export const BALL_FOUNTAIN_FILL_LOW_INCHES_ENTITY = 'input_number.ball_fountain_fill_low_inches'
export const BALL_FOUNTAIN_FILL_FULL_INCHES_ENTITY = 'input_number.ball_fountain_fill_full_inches'
export const BALL_FOUNTAIN_OFFSET_ENTITY = 'input_number.ball_fountain_water_level_offset'
/** Set by the fill controller when filling didn't raise the level; pauses auto fill. */
export const BALL_FOUNTAIN_FILL_ERROR_ENTITY = 'input_boolean.ball_fountain_fill_error'

export const DEFAULT_BALL_FOUNTAIN_FILL_LOW_INCHES = -1
export const DEFAULT_BALL_FOUNTAIN_FILL_FULL_INCHES = 0

export type BallFountainSnapshot = {
  /** Offset-adjusted water level in inches. */
  levelInches: number | null
  levelLabel: string
  /** null when the filler valve is missing / unavailable */
  fillOn: boolean | null
  fillError: boolean
  fillAutoEnabled: boolean
  fillLowInches: number
  fillFullInches: number
  offsetInches: number
}

export type BallFountainSettings = Pick<
  BallFountainSnapshot,
  'fillAutoEnabled' | 'fillLowInches' | 'fillFullInches' | 'offsetInches'
>

export const EMPTY_BALL_FOUNTAIN: BallFountainSnapshot = {
  levelInches: null,
  levelLabel: '—',
  fillOn: null,
  fillError: false,
  fillAutoEnabled: false,
  fillLowInches: DEFAULT_BALL_FOUNTAIN_FILL_LOW_INCHES,
  fillFullInches: DEFAULT_BALL_FOUNTAIN_FILL_FULL_INCHES,
  offsetInches: 0,
}

function numberOf(state: HaState | undefined): number | null {
  if (!state) return null
  const n = Number(state.state)
  return Number.isFinite(n) ? n : null
}

export function ballFountainFromStates(states: HaState[]): BallFountainSnapshot {
  const byId = new Map(states.map((s) => [s.entity_id, s]))
  const depthState = byId.get(BALL_FOUNTAIN_DEPTH_ENTITY)
  const measured = numberOf(depthState)
  const rawUnit = depthState?.attributes.unit_of_measurement
  const unit = typeof rawUnit === 'string' ? rawUnit : 'ft'
  const offsetInches = numberOf(byId.get(BALL_FOUNTAIN_OFFSET_ENTITY)) ?? 0

  return {
    levelInches: adjustedWaterLevelInches(measured, unit, offsetInches),
    levelLabel: formatAdjustedWaterLevelInches(measured, unit, offsetInches),
    fillOn: pondFillIsOn(states, BALL_FOUNTAIN_FILL_VALVE_ENTITY),
    fillError: byId.get(BALL_FOUNTAIN_FILL_ERROR_ENTITY)?.state === 'on',
    fillAutoEnabled: byId.get(BALL_FOUNTAIN_FILL_AUTO_ENABLED_ENTITY)?.state === 'on',
    fillLowInches:
      numberOf(byId.get(BALL_FOUNTAIN_FILL_LOW_INCHES_ENTITY)) ??
      DEFAULT_BALL_FOUNTAIN_FILL_LOW_INCHES,
    fillFullInches:
      numberOf(byId.get(BALL_FOUNTAIN_FILL_FULL_INCHES_ENTITY)) ??
      DEFAULT_BALL_FOUNTAIN_FILL_FULL_INCHES,
    offsetInches,
  }
}
