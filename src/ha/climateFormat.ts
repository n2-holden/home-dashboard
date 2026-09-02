import type { HaState } from './positions'

export function formatHvacModeLabel(mode: string, state?: HaState): string {
  const action = state?.attributes.hvac_action
  if (typeof action === 'string' && action === 'heating') return 'Heating'
  if (typeof action === 'string' && action === 'cooling') return 'Cooling'
  if (mode === 'heat') return 'Heat'
  if (mode === 'cool') return 'Cool'
  if (mode === 'auto') return 'Auto'
  if (mode === 'dry') return 'Dry'
  if (mode === 'heat_cool') return 'Auto'
  if (mode === 'fan_only') return 'Fan'
  if (mode === 'off') return 'Off'
  return mode ? capitalize(mode) : '—'
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
