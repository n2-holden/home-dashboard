import type { HaState } from './positions'
import { solarAzimuthDegrees, solarElevationDegrees } from '../zynect/solarPosition'

const HORIZON_ELEVATION_DEG = -0.833

export type SunSnapshot = {
  elevation: number
  azimuth: number
  elevationLabel: string
  azimuthLabel: string
  sunriseLabel: string
  sunsetLabel: string
  sunriseMs: number
  sunsetMs: number
  /** 0 at sunrise, 1 at sunset, clamped. */
  progress: number
}

export function sunSnapshotFromStates(
  states: HaState[],
  latitudeDeg: number,
  longitudeDeg: number,
  when = new Date(),
): SunSnapshot {
  const sun = states.find((state) => state.entity_id === 'sun.sun')

  let elevation = sun ? numericAttr(sun, 'elevation') : null
  let azimuth = sun ? numericAttr(sun, 'azimuth') : null

  let sunrise = pickTodayDate(sun?.attributes.next_rising, sun?.attributes.previous_rising, when)
  let sunset = pickTodayDate(sun?.attributes.next_setting, sun?.attributes.previous_setting, when)

  if (!sunrise || !sunset) {
    const calculated = calculateSunriseSunset(when, latitudeDeg, longitudeDeg)
    sunrise = calculated.sunrise
    sunset = calculated.sunset
  }

  if (elevation == null) elevation = solarElevationDegrees(when, latitudeDeg, longitudeDeg)
  if (azimuth == null) azimuth = solarAzimuthDegrees(when, latitudeDeg, longitudeDeg)

  const span = sunset.getTime() - sunrise.getTime()
  let progress = span > 0 ? (when.getTime() - sunrise.getTime()) / span : 0
  if (!Number.isFinite(progress)) progress = 0
  progress = Math.max(0, Math.min(1, progress))

  return {
    elevation,
    azimuth,
    elevationLabel: `${elevation.toFixed(1)}°`,
    azimuthLabel: `${Math.round(azimuth)}°`,
    sunriseLabel: formatLocalTime(sunrise),
    sunsetLabel: formatLocalTime(sunset),
    sunriseMs: sunrise.getTime(),
    sunsetMs: sunset.getTime(),
    progress,
  }
}

export function sunArcCoordinates(progress: number): { x: number; y: number } {
  const cx = 66
  const cy = 54
  const r = 46
  const angle = Math.PI - progress * Math.PI
  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  }
}

export function calculateSunriseSunset(
  when: Date,
  latitudeDeg: number,
  longitudeDeg: number,
): { sunrise: Date; sunset: Date } {
  const dayStart = startOfLocalDay(when)
  let sunrise: Date | null = null
  let sunset: Date | null = null
  let prevEl = solarElevationDegrees(dayStart, latitudeDeg, longitudeDeg)

  for (let minute = 1; minute <= 24 * 60; minute++) {
    const sample = new Date(dayStart.getTime() + minute * 60_000)
    const el = solarElevationDegrees(sample, latitudeDeg, longitudeDeg)
    if (!sunrise && prevEl < HORIZON_ELEVATION_DEG && el >= HORIZON_ELEVATION_DEG) {
      sunrise = sample
    }
    if (sunrise && prevEl >= HORIZON_ELEVATION_DEG && el < HORIZON_ELEVATION_DEG) {
      sunset = sample
      break
    }
    prevEl = el
  }

  if (!sunrise) sunrise = new Date(dayStart.getTime() + 6 * 60 * 60_000)
  if (!sunset) sunset = new Date(dayStart.getTime() + 18 * 60 * 60_000)
  return { sunrise, sunset }
}

function numericAttr(state: HaState, key: string): number | null {
  const raw = state.attributes[key]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function pickTodayDate(nextValue: unknown, previousValue: unknown, now: Date): Date | null {
  for (const value of [nextValue, previousValue]) {
    const date = parseIsoDate(value)
    if (date && isSameLocalDay(date, now)) return date
  }
  return null
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfLocalDay(when: Date): Date {
  const d = new Date(when.getTime())
  d.setHours(0, 0, 0, 0)
  return d
}

function formatLocalTime(when: Date): string {
  return when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
