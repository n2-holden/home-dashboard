import type { HaState } from './positions'

export const SHED_POWER_ON_SOC_ENTITY = 'input_number.shed_power_on_soc_threshold'
export const SHED_POWER_OFF_SOC_ENTITY = 'input_number.shed_power_off_soc_threshold'

export type ShedPowerSettings = {
  onBelow: number
  offAbove: number
}

export const DEFAULT_SHED_POWER_SETTINGS: ShedPowerSettings = {
  onBelow: 20,
  offAbove: 80,
}

export function shedPowerSettingsFromStates(states: HaState[]): ShedPowerSettings {
  return {
    onBelow: stateNumber(states, SHED_POWER_ON_SOC_ENTITY) ?? DEFAULT_SHED_POWER_SETTINGS.onBelow,
    offAbove:
      stateNumber(states, SHED_POWER_OFF_SOC_ENTITY) ??
      DEFAULT_SHED_POWER_SETTINGS.offAbove,
  }
}

export function clampSocThreshold(
  value: number,
  fallback = DEFAULT_SHED_POWER_SETTINGS.onBelow,
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10))
}

function stateNumber(states: HaState[], entityId: string): number | null {
  const state = states.find((item) => item.entity_id === entityId)
  if (!state) return null
  const value = Number(state.state)
  return Number.isFinite(value) ? value : null
}
