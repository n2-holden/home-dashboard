export type ControlLogSource = 'dashboard' | 'automation' | 'system'

export type ControlLogKind = 'activity' | 'communication'

export type ControlLogEntry = {
  ts: string
  source: ControlLogSource | string
  actor: string
  action: string
  entity_id?: string | null
  detail?: unknown
  ok?: boolean
}

const LEGACY_LOG_URL = 'control-log.jsonl'
const LOG_URLS: Record<ControlLogKind, string> = {
  activity: 'activity-log.jsonl',
  communication: 'communication-log.jsonl',
}
const LOCAL_KEYS: Record<ControlLogKind, string> = {
  activity: 'activity-log-local-v1',
  communication: 'communication-log-local-v1',
}
/** Migrate older single-bucket local storage once. */
const LEGACY_LOCAL_KEY = 'control-log-local-v1'
const MAX_FETCH_CHARS = 1_500_000
const MAX_LOCAL = 300
/** Collapse local+remote (and accidental double-fires) for the same event. */
const DEDUPE_WINDOW_MS = 2500
/** Drop entries older than this (matches HA append_control_log trim). */
export const CONTROL_LOG_RETENTION_DAYS = 15
const CONTROL_LOG_RETENTION_MS = CONTROL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000

const COMM_ACTOR_RE = /internet|device[_\s-]?comm|command[_\s-]?failed|communication/i
const COMM_ACTION_RE = /^(device[_\s.-]?comm|internet[_\s.-]|comm[_\s.-])/i

export function classifyControlLogEntry(entry: ControlLogEntry): ControlLogKind {
  if (entry.ok === false) return 'communication'
  const action = entry.action ?? ''
  const actor = entry.actor ?? ''
  if (COMM_ACTION_RE.test(action)) return 'communication'
  if (action.toLowerCase() === 'notify.alert' && COMM_ACTOR_RE.test(actor)) {
    return 'communication'
  }
  return 'activity'
}

export function encodeControlLogDetail(detail: unknown): string {
  if (detail == null) return '-'
  try {
    const json = JSON.stringify(detail)
    const bytes = new TextEncoder().encode(json)
    let binary = ''
    bytes.forEach((b) => {
      binary += String.fromCharCode(b)
    })
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  } catch {
    return '-'
  }
}

function detailKey(detail: unknown): string {
  if (detail == null) return ''
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

function entryFingerprint(entry: Pick<ControlLogEntry, 'source' | 'actor' | 'action' | 'entity_id' | 'detail' | 'ok'>): string {
  return [
    entry.source ?? '',
    entry.actor ?? '',
    entry.action ?? '',
    entry.entity_id ?? '',
    entry.ok === false ? '0' : '1',
    detailKey(entry.detail),
  ].join('|')
}

function isNearDuplicate(
  a: ControlLogEntry,
  b: ControlLogEntry,
  windowMs: number = DEDUPE_WINDOW_MS,
): boolean {
  if (entryFingerprint(a) !== entryFingerprint(b)) return false
  const ta = Date.parse(a.ts)
  const tb = Date.parse(b.ts)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false
  return Math.abs(ta - tb) <= windowMs
}

/** True if `entry` matches an existing row within the dedupe window. */
export function hasRecentControlLogDuplicate(
  entry: ControlLogEntry,
  existing: ControlLogEntry[],
  windowMs: number = DEDUPE_WINDOW_MS,
): boolean {
  return existing.some((row) => isNearDuplicate(entry, row, windowMs))
}

export function filterControlLogByAge(
  entries: ControlLogEntry[],
  now = Date.now(),
  retentionMs: number = CONTROL_LOG_RETENTION_MS,
): ControlLogEntry[] {
  const cutoff = now - retentionMs
  return entries.filter((entry) => {
    const ts = Date.parse(entry.ts)
    return Number.isFinite(ts) && ts >= cutoff
  })
}

function localKey(kind: ControlLogKind): string {
  return LOCAL_KEYS[kind]
}

export function appendLocalControlLog(entry: ControlLogEntry): void {
  const kind = classifyControlLogEntry(entry)
  try {
    const key = localKey(kind)
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as ControlLogEntry[]) : []
    const list = Array.isArray(parsed) ? parsed : []
    if (hasRecentControlLogDuplicate(entry, list)) return
    list.push(entry)
    const trimmed = filterControlLogByAge(list).slice(-MAX_LOCAL)
    localStorage.setItem(key, JSON.stringify(trimmed))
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearLocalControlLog(kind?: ControlLogKind): void {
  try {
    if (kind) {
      localStorage.removeItem(localKey(kind))
      return
    }
    localStorage.removeItem(LOCAL_KEYS.activity)
    localStorage.removeItem(LOCAL_KEYS.communication)
    localStorage.removeItem(LEGACY_LOCAL_KEY)
  } catch {
    /* ignore */
  }
}

function loadLocalControlLog(kind: ControlLogKind): ControlLogEntry[] {
  try {
    migrateLegacyLocalLog()
    const raw = localStorage.getItem(localKey(kind))
    if (!raw) return []
    const parsed = JSON.parse(raw) as ControlLogEntry[]
    const list = Array.isArray(parsed) ? parsed : []
    const trimmed = filterControlLogByAge(list).filter(
      (entry) => classifyControlLogEntry(entry) === kind,
    )
    if (trimmed.length !== list.length) {
      localStorage.setItem(localKey(kind), JSON.stringify(trimmed.slice(-MAX_LOCAL)))
    }
    return trimmed
  } catch {
    return []
  }
}

function migrateLegacyLocalLog(): void {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as ControlLogEntry[]
    const list = Array.isArray(parsed) ? parsed : []
    const buckets: Record<ControlLogKind, ControlLogEntry[]> = {
      activity: [],
      communication: [],
    }
    for (const entry of list) {
      if (!entry?.ts || !entry.action) continue
      buckets[classifyControlLogEntry(entry)].push(entry)
    }
    for (const kind of Object.keys(buckets) as ControlLogKind[]) {
      if (buckets[kind].length === 0) continue
      const existingRaw = localStorage.getItem(localKey(kind))
      const existingParsed = existingRaw ? (JSON.parse(existingRaw) as ControlLogEntry[]) : []
      const existing = Array.isArray(existingParsed) ? existingParsed : []
      const merged = filterControlLogByAge([...existing, ...buckets[kind]]).slice(-MAX_LOCAL)
      localStorage.setItem(localKey(kind), JSON.stringify(merged))
    }
    localStorage.removeItem(LEGACY_LOCAL_KEY)
  } catch {
    /* ignore */
  }
}

function mergeEntries(...groups: ControlLogEntry[][]): ControlLogEntry[] {
  const all = groups
    .flat()
    .filter((entry): entry is ControlLogEntry => Boolean(entry?.ts && entry.action))
  // Oldest first so the first write wins and near-duplicates are dropped.
  all.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))

  const kept: ControlLogEntry[] = []
  for (const entry of all) {
    if (hasRecentControlLogDuplicate(entry, kept)) continue
    kept.push(entry)
  }

  return filterControlLogByAge(kept).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
}

async function fetchJsonl(urlPath: string): Promise<ControlLogEntry[]> {
  const remote: ControlLogEntry[] = []
  try {
    const url = new URL(urlPath, new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return remote
    let text = await res.text()
    if (text.length > MAX_FETCH_CHARS) {
      text = text.slice(text.length - MAX_FETCH_CHARS)
      const firstNl = text.indexOf('\n')
      if (firstNl >= 0) text = text.slice(firstNl + 1)
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed) as ControlLogEntry
        if (parsed && typeof parsed === 'object' && typeof parsed.ts === 'string') {
          remote.push(parsed)
        }
      } catch {
        /* skip bad lines */
      }
    }
  } catch {
    /* keep local */
  }
  return remote
}

export async function fetchControlLog(kind: ControlLogKind = 'activity'): Promise<ControlLogEntry[]> {
  const local = loadLocalControlLog(kind)
  const [primary, legacy] = await Promise.all([
    fetchJsonl(LOG_URLS[kind]),
    fetchJsonl(LEGACY_LOG_URL),
  ])
  const classifiedPrimary = primary.filter((entry) => classifyControlLogEntry(entry) === kind)
  const classifiedLegacy = legacy.filter((entry) => classifyControlLogEntry(entry) === kind)
  return mergeEntries(classifiedPrimary, classifiedLegacy, local)
}

export function formatControlLogTime(ts: string): string {
  const ms = Date.parse(ts)
  if (!Number.isFinite(ms)) return ts
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

export type CommLogStatus = 'Failed' | 'Resumed'

/** Every communication-log entry is either an outage/failure or a recovery. */
export function commLogStatus(entry: ControlLogEntry): CommLogStatus {
  const detail = entry.detail
  if (detail && typeof detail === 'object' && 'event' in detail) {
    const event = String((detail as { event?: unknown }).event ?? '').toLowerCase()
    if (event === 'resumed') return 'Resumed'
    if (event === 'failed') return 'Failed'
  }
  return /resumed|restored/i.test(`${entry.action} ${entry.actor}`) ? 'Resumed' : 'Failed'
}

export function formatControlLogDetail(detail: unknown): string {
  if (detail == null) return '—'
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}
