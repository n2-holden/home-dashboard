import { GAUGE_LAYOUT, PREFERRED_GAUGE_ORDER, type SensorReading } from './types'

export function orderReadings(readings: SensorReading[]): SensorReading[] {
  return readings
    .map((reading, index) => ({ reading, index, rank: rankForName(reading.name) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.reading)
}

export function layoutSlotForName(name: string): { row: number; col: number } | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  let bestLength = -1
  let found: { row: number; col: number } | null = null
  for (const slot of GAUGE_LAYOUT) {
    const lower = trimmed.toLowerCase()
    const keyLower = slot.key.toLowerCase()
    if (lower !== keyLower && !lower.includes(keyLower)) continue
    if (slot.key.length > bestLength) {
      bestLength = slot.key.length
      found = { row: slot.row, col: slot.col }
    }
  }
  return found
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'unknown'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'unknown'
  const seconds = Math.floor((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.floor(hours / 24)} day(s) ago`
}

export function withCurrentReadingTip(
  history: Array<{ timestamp: string; value: number }>,
  reading: SensorReading,
): Array<{ timestamp: string; value: number }> {
  if (reading.value == null) return history
  const tip = {
    timestamp: reading.lastUpdatedUtc ?? new Date().toISOString(),
    value: reading.value,
  }
  if (history.length === 0) return [tip]
  const last = history[history.length - 1]
  if (tip.timestamp <= last.timestamp) {
    if (tip.timestamp === last.timestamp && tip.value !== last.value) {
      return [...history.slice(0, -1), tip]
    }
    return history
  }
  return [...history, tip]
}

function rankForName(name: string): number {
  const trimmed = name.trim()
  const fallback = PREFERRED_GAUGE_ORDER.length as number
  if (!trimmed) return fallback
  let bestRank = fallback
  let bestLength = -1
  for (let i = 0; i < PREFERRED_GAUGE_ORDER.length; i += 1) {
    const key = PREFERRED_GAUGE_ORDER[i]
    const lower = trimmed.toLowerCase()
    const keyLower = key.toLowerCase()
    if (lower !== keyLower && !lower.includes(keyLower)) continue
    if (key.length > bestLength) {
      bestLength = key.length
      bestRank = i
    }
  }
  return bestRank
}
