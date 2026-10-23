import {
  isDeviceCommFailing,
  type DeviceCommRow,
} from './deviceCommunication'

/** Home / overview widgets that can show a communication-outage badge. */
export type CommOutageWidgetId =
  | 'solar'
  | 'solarShed'
  | 'solarPv'
  | 'solarThermal'
  | 'power'
  | 'shades'
  | 'pool'
  | 'pond'
  | 'outside'
  | 'weather'
  | 'irrigation'
  | 'audio'
  | 'hvac'
  | 'lights'
  | 'hotTub'

/** deviceCommStatus row keys that affect each widget. */
export const COMM_OUTAGE_WIDGET_KEYS: Record<CommOutageWidgetId, readonly string[]> = {
  solar: ['shed-inverter', 'alsoenergy-pv', 'solar-thermal'],
  solarShed: ['shed-inverter'],
  solarPv: ['alsoenergy-pv'],
  solarThermal: ['solar-thermal'],
  power: ['egauge-grid'],
  shades: ['shades'],
  pool: ['pool'],
  pond: ['pond', 'pond-temperature'],
  outside: [
    'gate-doorbird',
    'gate-sensor',
    'garage-main',
    'garage-workshop',
    'outside-lights',
    'ball-fountain',
  ],
  weather: ['weather'],
  irrigation: ['irrigation'],
  audio: ['sonos', 'receiver'],
  hvac: ['hvac', 'ac'],
  lights: ['crestron'],
  hotTub: ['hot-tub'],
}

/** Thin connectivity-rail groups on the home page. Every device-comm key must map here. */
export type CommStatusGroupId = 'solar' | 'poolPond' | 'outside' | 'house'

export const COMM_STATUS_GROUP_KEYS: Record<CommStatusGroupId, readonly string[]> = {
  solar: ['shed-inverter', 'alsoenergy-pv', 'solar-thermal'],
  poolPond: ['pool', 'pond', 'pond-temperature', 'hot-tub'],
  outside: [
    'gate-doorbird',
    'gate-sensor',
    'driveway-sensor-blocked',
    'outside-lights',
    'irrigation',
    'garage-main',
    'garage-workshop',
    'cistern',
    'ball-fountain',
  ],
  house: ['crestron', 'shades', 'sonos', 'receiver', 'hvac', 'ac', 'egauge-grid', 'weather'],
}

export type CommGroupStatus = 'ok' | 'bad' | 'unknown'

export const COMM_OUTAGE_SETTINGS_PATH = '/settings?tab=communication&comm=1'

const ALL_MAPPED_COMM_KEYS = new Set(
  Object.values(COMM_STATUS_GROUP_KEYS).flatMap((keys) => [...keys]),
)

export function widgetHasCommOutage(
  rows: DeviceCommRow[],
  widgetId: CommOutageWidgetId,
  now = Date.now(),
): boolean {
  const keys = new Set(COMM_OUTAGE_WIDGET_KEYS[widgetId])
  return rows.some(
    (row) => keys.has(row.key) && isDeviceCommFailing(row, 0, now),
  )
}

export function groupCommStatus(
  rows: DeviceCommRow[],
  groupId: CommStatusGroupId,
  now = Date.now(),
): CommGroupStatus {
  const keys = new Set(COMM_STATUS_GROUP_KEYS[groupId])
  // Unmapped failures fall through to the house icon so nothing is silent.
  const relevant = rows.filter(
    (row) =>
      keys.has(row.key) ||
      (groupId === 'house' && !ALL_MAPPED_COMM_KEYS.has(row.key)),
  )
  if (relevant.length === 0) return 'unknown'
  if (relevant.some((row) => isDeviceCommFailing(row, 0, now))) return 'bad'
  if (relevant.every((row) => row.succeeded == null)) return 'unknown'
  return 'ok'
}

/** Globe: WAN ping + local Home Assistant WebSocket/API reachability. */
export function networkCommStatus(
  internetOnline: boolean | null,
  connectionStatus: string,
): CommGroupStatus {
  if (connectionStatus !== 'connected') return 'bad'
  if (internetOnline === false) return 'bad'
  if (internetOnline == null) return 'unknown'
  return 'ok'
}
