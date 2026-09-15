import {
  isDeviceCommFailing,
  type DeviceCommRow,
} from './deviceCommunication'

/** Home / overview widgets that can show a communication-outage badge. */
export type CommOutageWidgetId =
  | 'solar'
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

/** deviceCommStatus row keys that affect each widget. */
export const COMM_OUTAGE_WIDGET_KEYS: Record<CommOutageWidgetId, readonly string[]> = {
  solar: ['shed-powerpack', 'alsoenergy-pv', 'shed-power-outlet'],
  power: ['egauge-grid'],
  shades: ['shades'],
  pool: ['pool'],
  pond: ['pond'],
  outside: ['gate', 'garage-main', 'garage-workshop', 'outside-lights'],
  weather: ['weather'],
  irrigation: ['irrigation'],
  audio: ['sonos', 'receiver'],
  hvac: ['hvac', 'ac'],
  lights: ['crestron', 'outside-lights'],
}

export const COMM_OUTAGE_SETTINGS_PATH = '/settings?tab=notification&comm=1'

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
