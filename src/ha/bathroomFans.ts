/** Bathroom fan auto-off + Shed Power automation enable helpers. */

export const BATHROOM_FAN_SLOT_COUNT = 6

export const BATHROOM_FAN_AUTO_OFF_ENABLED_ENTITY =
  'input_boolean.bathroom_fan_auto_off_enabled'
export const BATHROOM_FAN_AUTO_OFF_MINUTES_ENTITY =
  'input_number.bathroom_fan_auto_off_minutes'
export const SHED_POWER_AUTO_ENABLED_ENTITY = 'input_boolean.shed_power_auto_enabled'

export const DEFAULT_BATHROOM_FAN_AUTO_OFF_MINUTES = 30

export type BathroomFanSlots = [string, string, string, string, string, string]

export const EMPTY_BATHROOM_FAN_SLOTS: BathroomFanSlots = ['', '', '', '', '', '']

export function normalizeBathroomFanSlots(raw: unknown): BathroomFanSlots {
  const source = Array.isArray(raw) ? raw : []
  const slots: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < BATHROOM_FAN_SLOT_COUNT; i += 1) {
    const value = String(source[i] ?? '').trim()
    if (!value || seen.has(value)) {
      slots.push('')
      continue
    }
    seen.add(value)
    slots.push(value)
  }
  return slots as BathroomFanSlots
}
