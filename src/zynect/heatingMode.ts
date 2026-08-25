import { solarElevationDegrees } from './solarPosition'
import type { SensorReading } from './types'

export type HeatingMode = 'standby' | 'warming' | 'heating-tank' | 'heating-pool'

export type HeatingModeResult = {
  mode: HeatingMode
  label: string
  detail: string
}

const EPSILON_F = 0.5
const WARMING_GAIN_F = 5
const RETURN_CLOSE_F = 5
const MIN_SOLAR_ELEVATION_DEG = 15

export function detectHeatingMode(
  readings: SensorReading[],
  atTime: Date,
  latitude: number,
  longitude: number,
): HeatingModeResult {
  const named = readings
    .filter((r) => r.name.trim() && r.value != null)
    .map((r) => [r.name.trim(), r.value!] as const)

  const collector = findValue(named, 'Collector out')
  const tankSupply = findValue(named, 'Tank supply')
  const poolSupply = findValue(named, 'Pool supply')
  const tankReturn = findValue(named, 'Tank return')
  const poolReturn = findValue(named, 'Pool return')
  const systemReturn = findValue(named, 'Return')

  const elevation = solarElevationDegrees(atTime, latitude, longitude)
  const detail = formatDetail(
    collector,
    tankSupply,
    poolSupply,
    tankReturn,
    poolReturn,
    systemReturn,
    elevation,
    atTime,
  )

  if (elevation < MIN_SOLAR_ELEVATION_DEG) {
    return {
      mode: 'standby',
      label: 'Standby',
      detail: `Sun elevation ${elevation.toFixed(1)}° is below ${MIN_SOLAR_ELEVATION_DEG}°.\n${detail}`,
    }
  }

  if (collector == null) {
    return {
      mode: 'standby',
      label: 'Standby',
      detail: `Collector out unavailable.\n${detail}`,
    }
  }

  const circulating =
    isClose(tankReturn, systemReturn) || isClose(poolReturn, systemReturn)
  const canHeatTank = tankSupply != null && collector + EPSILON_F >= tankSupply
  const canHeatPool = poolSupply != null && collector + EPSILON_F >= poolSupply
  const collGain = systemReturn != null ? collector - systemReturn : 0

  if (circulating || canHeatTank || canHeatPool) {
    if (preferTank(tankReturn, poolReturn, systemReturn)) {
      return { mode: 'heating-tank', label: 'Heating tank', detail }
    }
    return { mode: 'heating-pool', label: 'Heating pool', detail }
  }

  if (systemReturn != null && collGain >= WARMING_GAIN_F) {
    return { mode: 'warming', label: 'Warming up', detail }
  }

  return { mode: 'standby', label: 'Standby', detail }
}

function isClose(a: number | null, b: number | null): boolean {
  return a != null && b != null && Math.abs(a - b) <= RETURN_CLOSE_F
}

function preferTank(
  tankReturn: number | null,
  poolReturn: number | null,
  systemReturn: number | null,
): boolean {
  if (tankReturn == null && poolReturn == null) return true
  if (tankReturn == null) return false
  if (poolReturn == null) return true
  if (systemReturn == null) return tankReturn >= poolReturn
  const tankDist = Math.abs(tankReturn - systemReturn)
  const poolDist = Math.abs(poolReturn - systemReturn)
  if (Math.abs(tankDist - poolDist) >= EPSILON_F) return tankDist < poolDist
  return tankReturn >= poolReturn
}

function findValue(
  values: ReadonlyArray<readonly [string, number]>,
  key: string,
): number | null {
  for (const [name, value] of values) {
    if (name.trim().toLowerCase() === key.toLowerCase()) return value
  }
  return null
}

function formatDetail(
  collector: number | null,
  tankSupply: number | null,
  poolSupply: number | null,
  tankReturn: number | null,
  poolReturn: number | null,
  systemReturn: number | null,
  elevationDeg: number,
  atTime: Date,
): string {
  const f = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}°F`)
  const dist = (a: number | null, b: number | null) =>
    a != null && b != null ? `${Math.abs(a - b).toFixed(1)}°F` : '—'
  const delta = (a: number | null, b: number | null) =>
    a != null && b != null ? `${(a - b).toFixed(1)}°F` : '—'

  return [
    `At ${atTime.toLocaleString()}`,
    `Sun elevation: ${elevationDeg.toFixed(1)}° (standby below ${MIN_SOLAR_ELEVATION_DEG}°)`,
    `Collector out: ${f(collector)}`,
    `Tank supply: ${f(tankSupply)}`,
    `Pool supply: ${f(poolSupply)}`,
    `Tank return: ${f(tankReturn)}`,
    `Pool return: ${f(poolReturn)}`,
    `Return: ${f(systemReturn)}`,
    `Collector − tank supply: ${delta(collector, tankSupply)}`,
    `Collector − pool supply: ${delta(collector, poolSupply)}`,
    `|Tank return − Return|: ${dist(tankReturn, systemReturn)}`,
    `|Pool return − Return|: ${dist(poolReturn, systemReturn)}`,
    `Collector − return: ${delta(collector, systemReturn)}`,
  ].join('\n')
}
