/** Convert a depth reading to inches using HA unit_of_measurement when present. */
export function toInches(value: number, unit: string | null): number {
  const u = (unit ?? 'ft').trim().toLowerCase()
  if (u === 'in' || u === 'inch' || u === 'inches') return value
  if (u === 'ft' || u === 'foot' || u === 'feet') return value * 12
  if (u === 'm' || u === 'meter' || u === 'meters') return value * 39.3701
  if (u === 'cm' || u === 'centimeter' || u === 'centimeters') return value / 2.54
  return value * 12
}

/** Inches with one decimal; optional leading + / − (zero is unsigned). */
export function formatInches(value: number, signed = false): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  const abs = Math.abs(rounded)
  const text = abs.toFixed(1)
  const sign = signed ? (rounded > 0 ? '+' : rounded < 0 ? '-' : '') : ''
  return `${sign}${text} in`
}

export function parseDepthOffsetInches(raw: unknown, unit: unknown): number {
  let n = 0
  if (typeof raw === 'number' && Number.isFinite(raw)) n = raw
  else if (typeof raw === 'string') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) n = parsed
  }
  if (unit === 'in') return n
  if (unit === 'ft') return n * 12
  // Legacy maps stored offset in feet before inches switch.
  if (n !== 0) return n * 12
  return 0
}

export function adjustedWaterLevelInches(
  measured: number | null,
  unit: string | null,
  offsetInches: number,
): number | null {
  if (measured == null || !Number.isFinite(measured)) return null
  const adjustedIn = toInches(measured, unit) - offsetInches
  if (!Number.isFinite(adjustedIn)) return null
  return Math.round(adjustedIn * 10) / 10
}

/** Offset-adjusted water level in inches (sensor − offset). */
export function formatAdjustedWaterLevelInches(
  measured: number | null,
  unit: string | null,
  offsetInches: number,
): string {
  const adjustedIn = adjustedWaterLevelInches(measured, unit, offsetInches)
  if (adjustedIn == null) return '—'
  return formatInches(adjustedIn, true)
}
