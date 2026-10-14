import type { HaState } from './positions'

/** TP-Link outlet (formerly "Shed power") that feeds the Crestron processor. */
export const CRESTRON_POWER_SWITCH = 'switch.shed_power'
export const CRESTRON_POWER_CYCLE_ENABLED = 'input_boolean.crestron_power_cycle_enabled'
export const CRESTRON_POWER_CYCLE_MINUTES = 'input_number.crestron_power_cycle_minutes'
export const DEFAULT_CRESTRON_POWER_CYCLE_MINUTES = 5

export type CrestronPowerSnapshot = {
  /** Outlet state; null when the outlet is missing or unavailable. */
  on: boolean | null
  /** Auto power-cycle helper; null until the HA package is loaded. */
  cycleEnabled: boolean | null
  cycleMinutes: number
}

export const EMPTY_CRESTRON_POWER: CrestronPowerSnapshot = {
  on: null,
  cycleEnabled: null,
  cycleMinutes: DEFAULT_CRESTRON_POWER_CYCLE_MINUTES,
}

function onOff(state: HaState | undefined): boolean | null {
  if (state?.state === 'on') return true
  if (state?.state === 'off') return false
  return null
}

export function crestronPowerFromStates(states: HaState[]): CrestronPowerSnapshot {
  const byId = (id: string) => states.find((state) => state.entity_id === id)
  const minutes = Number(byId(CRESTRON_POWER_CYCLE_MINUTES)?.state)
  return {
    on: onOff(byId(CRESTRON_POWER_SWITCH)),
    cycleEnabled: onOff(byId(CRESTRON_POWER_CYCLE_ENABLED)),
    cycleMinutes:
      Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_CRESTRON_POWER_CYCLE_MINUTES,
  }
}
