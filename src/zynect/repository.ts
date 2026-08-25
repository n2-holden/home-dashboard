import { ZynectApiClient } from './api'
import {
  ID_KEYS,
  MAX_KEYS,
  MIN_KEYS,
  NAME_KEYS,
  TIMESTAMP_KEYS,
  asDouble,
  asString,
  asTimestamp,
  extractBatteryPercent,
  extractTemperature,
  findArrays,
  findByKeys,
  findObjects,
} from './jsonHeuristics'
import type { HistoryPoint, SensorReading, ZynectConfig } from './types'

export class SensorRepository {
  private readonly api: ZynectApiClient

  constructor(config: ZynectConfig) {
    this.api = new ZynectApiClient(config)
  }

  async getCurrentReadings(): Promise<SensorReading[]> {
    const eggsResponse = await this.api.getAuthorizedEggs()
    let allTokens = extractAllTokens(eggsResponse)
    let eggIds = [...new Set(allTokens.filter(looksLikeEggId))]

    const groupsResponse = await this.api.getSensorGroups()
    if (eggIds.length === 0) {
      eggIds = extractEggIdsFromGroups(groupsResponse)
      allTokens = eggIds
    }
    if (eggIds.length === 0) return []

    const namesById = extractNamesById(groupsResponse)
    const readingsResponse = await this.api.getCurrentReadings(allTokens)
    let readings = buildReadings(eggIds, readingsResponse, namesById)

    if (readings.some((r) => !r.lastUpdatedUtc)) {
      const metaResponse = await this.api.getReadingsMeta(eggIds)
      backfillTimestamps(readings, metaResponse)
    }

    if (readings.some((r) => r.value == null)) {
      readings = await this.fillMissingFromHistory(readings)
    }

    return readings
  }

  async getHistory(eggId: string, start: Date, end: Date): Promise<HistoryPoint[]> {
    const response = await this.api.getHistory([eggId], start, end)
    return extractHistoryPoints(response)
  }

  private async fillMissingFromHistory(readings: SensorReading[]): Promise<SensorReading[]> {
    const end = new Date()
    const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000)
    const next = [...readings]
    for (let i = 0; i < next.length; i += 1) {
      if (next[i].value != null) continue
      try {
        const points = await this.getHistory(next[i].eggId, start, end)
        if (points.length === 0) continue
        const latest = points[points.length - 1]
        next[i] = {
          ...next[i],
          value: latest.value,
          lastUpdatedUtc: next[i].lastUpdatedUtc ?? latest.timestamp,
        }
      } catch {
        /* leave */
      }
    }
    return next
  }
}

function extractAllTokens(eggsResponse: unknown): string[] {
  const tokens: string[] = []
  if (eggsResponse == null) return tokens
  if (Array.isArray(eggsResponse)) {
    for (const value of eggsResponse) {
      if (typeof value === 'string') tokens.push(value)
      else if (value && typeof value === 'object') {
        const id = asString(findByKeys(value, ID_KEYS))
        if (id) tokens.push(id)
      }
    }
    return tokens
  }
  for (const arr of findArrays(eggsResponse)) {
    for (const value of arr) {
      if (typeof value === 'string') tokens.push(value)
      else if (value && typeof value === 'object') {
        const id = asString(findByKeys(value, ID_KEYS))
        if (id) tokens.push(id)
      }
    }
  }
  return tokens
}

function extractEggIdsFromGroups(groupsResponse: unknown): string[] {
  const ids: string[] = []
  for (const obj of findObjects(groupsResponse)) {
    const serials = obj.serial_numbers
    if (Array.isArray(serials)) {
      for (const s of serials) {
        if (typeof s === 'string' && looksLikeEggId(s)) ids.push(s)
      }
    }
    const id = asString(findByKeys(obj, ID_KEYS))
    if (id && looksLikeEggId(id)) ids.push(id)
  }
  return [...new Set(ids)]
}

function looksLikeEggId(s: string): boolean {
  return s.toLowerCase().startsWith('egg') || s.length > 8
}

function extractNamesById(groupsNode: unknown): Record<string, string> {
  const map: Record<string, string> = {}
  for (const obj of findObjects(groupsNode)) {
    const id = asString(findByKeys(obj, ID_KEYS))
    const name = asString(findByKeys(obj, NAME_KEYS))
    if (id && name && !map[id]) map[id] = name
  }
  return map
}

function buildReadings(
  eggIds: string[],
  readingsResponse: unknown,
  namesById: Record<string, string>,
): SensorReading[] {
  if (readingsResponse == null) {
    return eggIds.map((id) => emptyReading(id, namesById[id] ?? id))
  }

  if (
    readingsResponse &&
    typeof readingsResponse === 'object' &&
    !Array.isArray(readingsResponse) &&
    eggIds.some((id) => id in (readingsResponse as Record<string, unknown>))
  ) {
    const top = readingsResponse as Record<string, unknown>
    return eggIds.map((id) => parseReading(id, top[id], namesById))
  }

  const objects = findObjects(readingsResponse)
  return eggIds.map((id) => {
    const match = objects.find((o) => {
      const candidate =
        asString(findByKeys(o, ID_KEYS)) ?? asString(o.serial_number) ?? asString(o.shortcode)
      return candidate?.toLowerCase() === id.toLowerCase()
    })
    return parseReading(id, match, namesById)
  })
}

function emptyReading(eggId: string, name: string): SensorReading {
  return {
    eggId,
    name,
    value: null,
    unit: '°F',
    lastUpdatedUtc: null,
    batteryPercent: null,
    minScale: null,
    maxScale: null,
  }
}

function parseReading(
  id: string,
  node: unknown,
  namesById: Record<string, string>,
): SensorReading {
  const reading = emptyReading(id, namesById[id] ?? id)
  if (!node || typeof node !== 'object') return reading

  const temp = extractTemperature(node)
  reading.value = temp.value
  if (temp.unit) reading.unit = temp.unit
  reading.batteryPercent = extractBatteryPercent(node)
  reading.lastUpdatedUtc = asTimestamp(findByKeys(node, TIMESTAMP_KEYS))
  reading.minScale = asDouble(findByKeys(node, MIN_KEYS))
  reading.maxScale = asDouble(findByKeys(node, MAX_KEYS))
  const nameOverride = asString(findByKeys(node, NAME_KEYS))
  if (nameOverride) reading.name = nameOverride.trim()
  return reading
}

function backfillTimestamps(readings: SensorReading[], metaResponse: unknown): void {
  if (metaResponse == null) return
  for (const reading of readings) {
    if (reading.lastUpdatedUtc) continue
    const match = findObjects(metaResponse).find((o) => {
      const candidate = asString(findByKeys(o, ID_KEYS))
      return candidate?.toLowerCase() === reading.eggId.toLowerCase()
    })
    if (!match) continue
    reading.lastUpdatedUtc = asTimestamp(findByKeys(match, TIMESTAMP_KEYS))
  }
}

function extractHistoryPoints(response: unknown): HistoryPoint[] {
  let best: unknown[] | null = null
  let bestCount = 0
  for (const array of findArrays(response)) {
    let candidate = 0
    for (const item of array) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const t = asTimestamp(findByKeys(item, TIMESTAMP_KEYS))
      const v = asDouble(findByKeys(item, ['value', 'v', 'temperature', 'temp', 'reading']))
      if (t && v != null) candidate += 1
    }
    if (candidate > bestCount) {
      bestCount = candidate
      best = array
    }
  }
  if (!best) return []
  const points: HistoryPoint[] = []
  for (const item of best) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const t = asTimestamp(findByKeys(item, TIMESTAMP_KEYS))
    const v = asDouble(findByKeys(item, ['value', 'v', 'temperature', 'temp', 'reading']))
    if (t && v != null) points.push({ timestamp: t, value: v })
  }
  return points.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}
