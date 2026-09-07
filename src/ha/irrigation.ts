import type { HaState } from './positions'

export type IrrigationZone = {
  entityId: string
  zoneNum: number
  label: string
  /** true = running, false = idle, null = unknown */
  active: boolean | null
  /** seconds remaining in current run, or null */
  timeRemaining: number | null
}

export type IrrigationSnapshot = {
  zones: IrrigationZone[]
  /** true if any zone is currently active */
  anyActive: boolean
}

export const EMPTY_IRRIGATION: IrrigationSnapshot = {
  zones: [],
  anyActive: false,
}

/** Rain Bird zone switches.
 *
 *  The HA Rain Bird integration creates one switch per zone named:
 *    switch.rain_bird_sprinkler_1, switch.rain_bird_sprinkler_2, …
 *
 *  We match any switch whose entity_id OR friendly_name matches one of:
 *    • contains "sprinkler"
 *    • contains "zone"
 *    • matches the pattern "rain_bird_*_N" (number suffix)
 *
 *  We exclude the controller-level switch if it exists (it would have no
 *  numeric suffix and typically appears as a separate device).
 */
function isZoneState(state: HaState): boolean {
  if (!state.entity_id.startsWith('switch.')) return false
  const id = state.entity_id.toLowerCase()
  const name = String(state.attributes.friendly_name ?? '').toLowerCase()
  return (
    id.includes('sprinkler') ||
    id.includes('zone') ||
    name.includes('sprinkler') ||
    name.includes('zone')
  )
}

/** Custom zone names keyed by zone number. */
export const IRRIGATION_ZONE_NAMES: Record<number, string> = {
  1: 'Garden W Courtyard',
  2: 'Garden SW Courtyard',
  3: 'Native NW Garage 2',
  4: 'Native W of Courtyard',
  5: 'Native N Garage 2',
  6: 'Native SW of Patio',
  7: 'Garden W of Driveway',
  8: 'Driveway House Drip',
  9: 'Native S of Kitchen',
  10: 'Native W of Patio',
  11: 'Pond Fill',
  12: 'Lawn E of Pool',
  13: 'Pond Garden Spray',
  14: 'Gardens N & W of Pool',
  15: 'Lawn NE of Pool',
  16: 'Lawn E of Driveway',
  17: 'Garden all East',
  18: 'Lawn N of Pond',
  19: 'Lawn Pool path',
  20: 'Gardens N Driveway',
  21: 'Water feature',
}

const MAX_ZONE = 21

export function irrigationZoneName(zoneNum: number): string {
  const named = IRRIGATION_ZONE_NAMES[zoneNum]
  return named ?? `Zone ${zoneNum}`
}

function zoneNumber(state: HaState): number | null {
  const m =
    state.entity_id.match(/sprinkler_?(\d+)$/i) ??
    String(state.attributes.friendly_name ?? '').match(/sprinkler\s+(\d+)/i)
  return m ? Number(m[1]) : null
}

function labelFromState(state: HaState): string {
  const num = zoneNumber(state)
  if (num != null && IRRIGATION_ZONE_NAMES[num]) return IRRIGATION_ZONE_NAMES[num]
  if (num != null) return `Zone ${num}`
  const friendly = String(state.attributes.friendly_name ?? '')
  if (friendly) return friendly
  return state.entity_id
    .replace(/^switch\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function irrigationSnapshotFromStates(states: HaState[]): IrrigationSnapshot {
  const zones: IrrigationZone[] = states
    .filter(isZoneState)
    .filter((s) => {
      const num = zoneNumber(s)
      return num != null && num >= 1 && num <= MAX_ZONE
    })
    .sort((a, b) => (zoneNumber(a) ?? 0) - (zoneNumber(b) ?? 0))
    .map((state) => {
      const active = state.state === 'on' ? true : state.state === 'off' ? false : null
      // Rain Bird integration puts remaining seconds in attributes
      const remaining = state.attributes.time_remaining
      return {
        entityId: state.entity_id,
        zoneNum: zoneNumber(state) ?? 0,
        label: labelFromState(state),
        active,
        timeRemaining: typeof remaining === 'number' ? remaining : null,
      }
    })

  return {
    zones,
    anyActive: zones.some((z) => z.active === true),
  }
}

export function formatTimeRemaining(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}
