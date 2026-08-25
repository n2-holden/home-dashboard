import type { Shade } from '../data/types'
import type { ShadeScheduleEvent } from '../data/shadeSchedules'

export type HomebridgeScheduleConfig = {
  url: string
  jsonUrl: string
  cachePath: string
  aliases: Record<string, string>
}

export type HomebridgeScheduleCache = {
  generatedAt?: string
  source?: string
  shadeCount?: number
  shades: ParsedHomebridgeShade[]
}

export type ParsedHomebridgeShade = {
  name: string
  closes: string[]
  opens: string[]
  note?: string
}

const DEFAULT_CONFIG: HomebridgeScheduleConfig = {
  url: 'http://homebridge.local:8787/',
  jsonUrl: 'http://homebridge.local:8787/schedule.json',
  cachePath: 'shade-schedule-today.json',
  aliases: {},
}

let config: HomebridgeScheduleConfig = DEFAULT_CONFIG

export function getHomebridgeScheduleConfig(): HomebridgeScheduleConfig {
  return config
}

export function setHomebridgeScheduleConfig(next: HomebridgeScheduleConfig): void {
  config = next
}

export async function loadHomebridgeScheduleConfig(): Promise<void> {
  try {
    const url = new URL('homebridge-schedule.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return
    const parsed = (await res.json()) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    const raw = parsed as Record<string, unknown>
    config = {
      url: typeof raw.url === 'string' ? raw.url : DEFAULT_CONFIG.url,
      jsonUrl:
        typeof raw.jsonUrl === 'string'
          ? raw.jsonUrl
          : scheduleJsonUrl(typeof raw.url === 'string' ? raw.url : DEFAULT_CONFIG.url),
      cachePath: typeof raw.cachePath === 'string' ? raw.cachePath : DEFAULT_CONFIG.cachePath,
      aliases:
        raw.aliases && typeof raw.aliases === 'object' && !Array.isArray(raw.aliases)
          ? (raw.aliases as Record<string, string>)
          : {},
    }
  } catch {
    config = DEFAULT_CONFIG
  }
}

export async function fetchHomebridgeSchedules(): Promise<{
  parsed: ParsedHomebridgeShade[]
  source: 'homebridge' | 'cache'
  attempts: string[]
}> {
  const cfg = getHomebridgeScheduleConfig()
  const attempts: string[] = []

  try {
    attempts.push(cfg.jsonUrl)
    const res = await fetch(cfg.jsonUrl, { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as HomebridgeScheduleCache
      if (Array.isArray(data.shades) && data.shades.length > 0) {
        return { parsed: data.shades, source: 'homebridge', attempts }
      }
    }
  } catch {
    /* try HTML page */
  }

  try {
    attempts.push(cfg.url)
    const res = await fetch(cfg.url, { cache: 'no-store' })
    if (res.ok) {
      const html = await res.text()
      if (html.includes("Today's shade schedule") || html.includes('CLOSE')) {
        const parsed = parseHomebridgeScheduleHtml(html)
        if (parsed.length > 0) {
          return { parsed, source: 'homebridge', attempts }
        }
      }
    }
  } catch {
    /* try cache */
  }

  const cacheUrl = assetUrl(cfg.cachePath)
  attempts.push(cacheUrl)
  try {
    const cached = await fetch(cacheUrl, { cache: 'no-store' })
    if (cached.ok) {
      const contentType = cached.headers.get('content-type') ?? ''
      if (contentType.includes('json') || cfg.cachePath.endsWith('.json')) {
        const data = (await cached.json()) as HomebridgeScheduleCache
        if (Array.isArray(data.shades) && data.shades.length > 0) {
          return { parsed: data.shades, source: 'cache', attempts }
        }
      }
      const html = await cached.text()
      const parsed = parseHomebridgeScheduleHtml(html)
      if (parsed.length > 0) {
        return { parsed, source: 'cache', attempts }
      }
    }
  } catch {
    /* fall through */
  }

  const htmlCacheUrl = assetUrl('shade-schedule-today.html')
  if (cfg.cachePath !== 'shade-schedule-today.html') {
    attempts.push(htmlCacheUrl)
    try {
      const cached = await fetch(htmlCacheUrl, { cache: 'no-store' })
      if (cached.ok) {
        const parsed = parseHomebridgeScheduleHtml(await cached.text())
        if (parsed.length > 0) {
          return { parsed, source: 'cache', attempts }
        }
      }
    } catch {
      /* fall through */
    }
  }

  throw new Error(
    `Could not load shade schedule. Tried: ${attempts.join(', ')}. Re-deploy with npm run build:ha (syncs schedules) or copy shade-schedule-today.json to config/www/home-dashboard/.`,
  )
}

export function parseHomebridgeScheduleHtml(html: string): ParsedHomebridgeShade[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rows = doc.querySelectorAll('table tbody tr')
  const parsed: ParsedHomebridgeShade[] = []

  rows.forEach((row) => {
    const name = row.querySelector('td b')?.textContent?.trim()
    if (!name || name === 'undefined') return

    const scheduleCell = row.querySelectorAll('td')[1]
    if (!scheduleCell) return

    const muted = scheduleCell.querySelector('.muted')?.textContent?.trim()
    if (muted?.includes('no sun through window')) {
      parsed.push({ name, closes: [], opens: [], note: muted })
      return
    }

    const closes: string[] = []
    const opens: string[] = []
    const blocks = scheduleCell.querySelectorAll('div')
    blocks.forEach((block) => {
      const text = block.textContent?.trim() ?? ''
      const match = /CLOSE\s+(\d{1,2}:\d{2})\s*→\s*OPEN\s+(\d{1,2}:\d{2})/i.exec(text)
      if (!match) return
      closes.push(normalizeTime(match[1]))
      opens.push(normalizeTime(match[2]))
    })

    parsed.push({ name, closes, opens })
  })

  return parsed
}

export function homebridgeSchedulesForShades(
  parsed: ParsedHomebridgeShade[],
  shades: Shade[],
  shadeToCoverEntity: Record<string, string>,
): Record<string, ShadeScheduleEvent[]> {
  const byCover = new Map<string, ShadeScheduleEvent[]>()
  const aliases = getHomebridgeScheduleConfig().aliases

  for (const entry of parsed) {
    const shadeId = aliases[entry.name] ?? matchHomebridgeName(entry.name, shades)
    if (!shadeId) continue
    const coverEntityId = shadeToCoverEntity[shadeId]
    if (!coverEntityId) continue

    for (const time of entry.closes) {
      appendEvent(byCover, coverEntityId, { time, action: 'Closed' })
    }
    for (const time of entry.opens) {
      appendEvent(byCover, coverEntityId, { time, action: 'Open' })
    }
  }

  const result: Record<string, ShadeScheduleEvent[]> = {}
  for (const [entityId, events] of byCover) {
    result[entityId] = events.sort((a, b) => a.time.localeCompare(b.time))
  }
  return result
}

function matchHomebridgeName(name: string, shades: Shade[]): string | null {
  const normalized = normalizeName(name)
  let best: { id: string; score: number } | null = null

  for (const shade of shades) {
    const candidates = [
      `${shade.group} ${shade.name}`,
      `${mapGroupAlias(shade.group)} ${mapShadeAlias(shade.name, shade.group)}`,
      `${mapGroupAlias(shade.group)} ${shade.name}`,
      shade.name,
    ].map(normalizeName)

    for (const candidate of candidates) {
      const score = nameMatchScore(normalized, candidate)
      if (!best || score > best.score) best = { id: shade.id, score }
    }
  }

  return best && best.score >= 0.45 ? best.id : null
}

function mapGroupAlias(group: string): string {
  if (group === 'East bedroom') return 'Upstairs East'
  if (group === 'North bedroom') return 'Upstairs North'
  return group
}

function mapShadeAlias(name: string, group: string): string {
  if (group === 'Master Suite') {
    return name
      .replace(/East 1-3/i, 'Shade Group 1')
      .replace(/^Southwest$/i, 'South SouthWest')
      .replace(/^South$/i, 'South South')
  }

  return name
    .replace(/^Southwest$/i, 'S/W')
    .replace(/^Southeast$/i, 'S/E')
    .replace(/^Northeast$/i, 'N/E')
    .replace(/^East #2$/i, 'East#4')
    .replace(/^East (\d+)$/i, 'East#$1')
    .replace(/^South #(\d+)$/i, 'South#$1')
    .replace(/^West #(\d+)$/i, 'West#$1')
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bs\s*\/\s*w\b/g, 'southwest')
    .replace(/\bs\s*\/\s*e\b/g, 'southeast')
    .replace(/\bn\s*\/\s*e\b/g, 'northeast')
    .replace(/#/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bs w\b/g, 'southwest')
    .replace(/\bs e\b/g, 'southeast')
    .replace(/\bn e\b/g, 'northeast')
    .trim()
}

function nameMatchScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9
  const aParts = a.split(' ').filter(Boolean)
  const bParts = new Set(b.split(' ').filter(Boolean))
  if (aParts.length === 0) return 0
  return aParts.filter((part) => bParts.has(part)).length / aParts.length
}

function normalizeTime(value: string): string {
  const [h, m] = value.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function appendEvent(
  map: Map<string, ShadeScheduleEvent[]>,
  entityId: string,
  event: ShadeScheduleEvent,
): void {
  const list = map.get(entityId) ?? []
  list.push(event)
  map.set(entityId, list)
}

function assetUrl(relativePath: string): string {
  const url = new URL(relativePath, new URL('./', location.href))
  url.searchParams.set('t', String(Date.now()))
  return url.toString()
}

function scheduleJsonUrl(baseUrl: string): string {
  return new URL('schedule.json', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

export function countMatchedHomebridgeShades(
  parsed: ParsedHomebridgeShade[],
  shades: Shade[],
  shadeToCoverEntity: Record<string, string>,
): { matched: number; unmatched: string[] } {
  const aliases = getHomebridgeScheduleConfig().aliases
  const unmatched: string[] = []
  let matched = 0

  for (const entry of parsed) {
    const shadeId = aliases[entry.name] ?? matchHomebridgeName(entry.name, shades)
    if (!shadeId || !shadeToCoverEntity[shadeId]) {
      unmatched.push(entry.name)
      continue
    }
    matched += 1
  }

  return { matched, unmatched }
}
