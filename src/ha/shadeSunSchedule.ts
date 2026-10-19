/** Today's sun-driven shade schedule, written by dashboard_sync/shade_sun.py on the HA host. */

import type { HaClient } from './client'

export const SHADE_SUN_AUTOMATION_ENTITY = 'input_boolean.shade_sun_automation'

export type ShadeSunInterval = {
  closeMs: number
  openMs: number
}

/** Per-shade sun geometry; same fields as the Homebridge CrestronLutronShades windows. */
export type ShadeSunSettings = {
  autoSun: boolean
  windowAzimuth: number
  left: number
  right: number
  minElevation: number
  maxElevation: number
  closedPosition: number
  openPosition: number
}

export type ShadeSunRow = {
  shadeId: number
  shadeKey: string | null
  entityId: string | null
  name: string
  autoSun: boolean
  closes: string[]
  opens: string[]
  intervals: ShadeSunInterval[]
  settings?: ShadeSunSettings
  defaults?: ShadeSunSettings
  customized?: boolean
  note?: string
}

export type ShadeSunSchedule = {
  generatedAt: string
  source: string
  date: string
  timeZone: string
  latitude: number
  longitude: number
  sunrise: string
  sunset: string
  sunriseMs?: number
  sunsetMs?: number
  preSunriseMinutes?: number
  minCloseMinutes?: number
  shades: ShadeSunRow[]
}

export type ShadeSunStatus = {
  updatedAt: string
  enabled: boolean
  manualHoldUntilMs: Record<string, number>
}

async function fetchDashboardJson<T>(file: string): Promise<T | null> {
  const url = new URL(file, new URL('./', location.href))
  url.searchParams.set('t', String(Date.now()))
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json()) as T
}

export async function loadShadeSunSchedule(): Promise<ShadeSunSchedule | null> {
  const data = await fetchDashboardJson<ShadeSunSchedule>('shade-schedule-today.json')
  if (!data || data.source !== 'home-assistant' || !Array.isArray(data.shades)) return null
  return data
}

export async function loadShadeSunStatus(): Promise<ShadeSunStatus | null> {
  const data = await fetchDashboardJson<ShadeSunStatus>('shade-sun-status.json')
  if (!data || typeof data !== 'object') return null
  return { ...data, manualHoldUntilMs: data.manualHoldUntilMs ?? {} }
}

/** Save one shade's settings on HA (null resets to defaults); HA regenerates today's schedule. */
export async function saveShadeSunWindow(
  client: HaClient,
  shadeId: number,
  settings: ShadeSunSettings | null,
): Promise<void> {
  await client.callService('shell_command', 'dashboard_shade_sun_window', undefined, {
    shade_id: String(shadeId),
    settings_b64: settings ? btoa(JSON.stringify(settings)) : 'reset',
  })
}

// SunCalc (https://github.com/mourner/suncalc) sun position, same math as shade_sun.py.
const RAD = Math.PI / 180
const DAY_MS = 86_400_000
const J1970 = 2440588
const J2000 = 2451545
const OBLIQUITY = RAD * 23.4397

function sunPosition(ms: number, lat: number, lng: number): { azimuth: number; elevation: number } {
  const lw = RAD * -lng
  const phi = RAD * lat
  const d = ms / DAY_MS - 0.5 + J1970 - J2000
  const m = RAD * (357.5291 + 0.98560028 * d)
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m))
  const l = m + c + RAD * 102.9372 + Math.PI
  const dec = Math.asin(Math.sin(l) * Math.sin(OBLIQUITY))
  const ra = Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l))
  const h = RAD * (280.16 + 360.9856235 * d) - lw - ra
  const azimuth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi))
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h),
  )
  return { azimuth: (180 + azimuth / RAD + 360) % 360, elevation: altitude / RAD }
}

function sunInWindow(azimuth: number, elevation: number, s: ShadeSunSettings): boolean {
  const lo = s.windowAzimuth - s.left
  const hi = s.windowAzimuth + s.right
  const inAzimuth = (azimuth >= lo && azimuth <= hi) || (azimuth - 360 >= lo && azimuth - 360 <= hi)
  return inAzimuth && elevation > s.minElevation && elevation <= s.maxElevation
}

/** Today's close/open intervals for draft settings (preview before saving). */
export function previewShadeSunIntervals(
  schedule: ShadeSunSchedule,
  settings: ShadeSunSettings,
): ShadeSunInterval[] | null {
  if (!settings.autoSun) return []
  if (schedule.sunriseMs == null || schedule.sunsetMs == null) return null
  const step = 60_000
  const minClose = (schedule.minCloseMinutes ?? 15) * step
  const spans: ShadeSunInterval[] = []
  let openStart: number | null = null
  for (
    let t = schedule.sunriseMs - (schedule.preSunriseMinutes ?? 60) * step;
    t <= schedule.sunsetMs;
    t += step
  ) {
    const { azimuth, elevation } = sunPosition(t, schedule.latitude, schedule.longitude)
    const inside = sunInWindow(azimuth, elevation, settings)
    if (inside && openStart == null) openStart = t
    else if (!inside && openStart != null) {
      spans.push({ closeMs: openStart, openMs: t })
      openStart = null
    }
  }
  if (openStart != null) spans.push({ closeMs: openStart, openMs: schedule.sunsetMs })
  return spans.filter((span) => span.openMs - span.closeMs > minClose)
}
