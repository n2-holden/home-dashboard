export const ID_KEYS = [
  'serial_number',
  'id',
  'eggId',
  'egg_id',
  '_id',
  'deviceId',
  'device_id',
]
export const NAME_KEYS = [
  'alias',
  'name',
  'label',
  'displayName',
  'sensorName',
  'title',
  'nickname',
]
export const VALUE_KEYS = [
  'value',
  'temperature',
  'temp',
  'reading',
  'currentValue',
  'lastValue',
  'val',
  'v',
  'lastData',
  'data',
]
export const UNIT_KEYS = ['unit', 'units', 'uom', 'u']
export const TIMESTAMP_KEYS = [
  'dataLastUpdated',
  'updated',
  'lastUpdate',
  'lastUpdated',
  'timestamp',
  'time',
  'lastReading',
  'last_reading',
  't',
]
export const MIN_KEYS = ['min', 'minimum', 'minScale', 'rangeMin', 'lowThreshold', 'alertLow']
export const MAX_KEYS = ['max', 'maximum', 'maxScale', 'rangeMax', 'highThreshold', 'alertHigh']

export function findByKeys(node: unknown, candidates: string[]): unknown {
  if (!node || typeof node !== 'object') return undefined

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findByKeys(item, candidates)
      if (found !== undefined) return found
    }
    return undefined
  }

  const obj = node as Record<string, unknown>
  const lower = candidates.map((c) => c.toLowerCase())

  for (const [key, value] of Object.entries(obj)) {
    if (lower.includes(key.toLowerCase())) return value
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const found = findByKeys(value, candidates)
      if (found !== undefined) return found
    }
  }

  return undefined
}

export function asString(node: unknown): string | null {
  if (typeof node === 'string') return node
  if (typeof node === 'number' && Number.isFinite(node)) return String(node)
  return null
}

export function asDouble(node: unknown): number | null {
  if (typeof node === 'number' && Number.isFinite(node)) return node
  if (typeof node === 'string') {
    const parsed = Number(node)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>
    return asDouble(obj.v) ?? asDouble(obj.value) ?? asDouble(obj.temperature)
  }
  return null
}

export function asTimestamp(node: unknown): string | null {
  const s = asString(node)
  if (!s) return null
  if (!Number.isNaN(Date.parse(s))) return new Date(s).toISOString()

  const epoch = Number(s)
  if (!Number.isFinite(epoch)) return null
  try {
    const ms = epoch > 1_000_000_000_000 ? epoch : epoch * 1000
    return new Date(ms).toISOString()
  } catch {
    return null
  }
}

export function batteryVoltageToPercent(volts: number): number {
  if (volts >= 4.6) return 100
  if (volts >= 4.45) return 90
  if (volts >= 4.35) return 80
  if (volts >= 4.26) return 70
  if (volts >= 4.16) return 60
  if (volts >= 4.03) return 50
  if (volts >= 3.97) return 40
  if (volts >= 3.88) return 30
  if (volts >= 3.75) return 20
  if (volts >= 3.39) return 10
  return 0
}

export function extractBatteryPercent(node: unknown): number | null {
  if (!node || typeof node !== 'object') return null
  const root = node as Record<string, unknown>
  const mostRecent = root.mostRecentData
  if (mostRecent && typeof mostRecent === 'object') {
    const battery = (mostRecent as Record<string, unknown>).battery
    if (battery && typeof battery === 'object') {
      const volts = asDouble((battery as Record<string, unknown>).v)
      if (volts != null) return batteryVoltageToPercent(volts)
    }
  }

  if (root.battery && typeof root.battery === 'object') {
    const volts = asDouble((root.battery as Record<string, unknown>).v)
    if (volts != null) return batteryVoltageToPercent(volts)
  }

  const flat = asDouble(
    findByKeys(node, ['batteryPercent', 'batteryLevel', 'batteryPct', 'battery']),
  )
  if (flat == null) return null
  if (flat >= 2.5 && flat <= 5.5) return batteryVoltageToPercent(flat)
  return Math.max(0, Math.min(100, flat))
}

export function extractTemperature(node: unknown): {
  value: number | null
  unit: string | null
} {
  if (!node || typeof node !== 'object') return { value: null, unit: null }
  const root = node as Record<string, unknown>
  const mostRecent = root.mostRecentData
  if (mostRecent && typeof mostRecent === 'object') {
    const temp = (mostRecent as Record<string, unknown>).temperature
    if (temp && typeof temp === 'object') {
      const t = temp as Record<string, unknown>
      return {
        value: asDouble(t.v) ?? asDouble(t.value),
        unit: asString(t.u) ?? asString(t.unit),
      }
    }
  }

  const found = findByKeys(node, VALUE_KEYS)
  return {
    value: asDouble(found),
    unit: asString(findByKeys(node, UNIT_KEYS)),
  }
}

export function findObjects(node: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  walkObjects(node, out)
  return out
}

function walkObjects(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walkObjects(item, out)
    return
  }
  out.push(node as Record<string, unknown>)
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (value && typeof value === 'object') walkObjects(value, out)
  }
}

export function findArrays(node: unknown): unknown[][] {
  const out: unknown[][] = []
  walkArrays(node, out)
  return out
}

function walkArrays(node: unknown, out: unknown[][]): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    out.push(node)
    for (const item of node) walkArrays(item, out)
    return
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    walkArrays(value, out)
  }
}
