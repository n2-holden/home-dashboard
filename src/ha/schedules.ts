import type { ShadeScheduleEvent } from '../data/shadeSchedules'

export type HaAutomationConfig = {
  id?: string
  alias?: string
  trigger?: unknown
  triggers?: unknown
  action?: unknown
  actions?: unknown
}

type EntityState = {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
}

type ParsedCoverAction = {
  entityIds: string[]
  action: 'Open' | 'Closed'
}

export type ScheduleParseContext = {
  statesById: Map<string, EntityState>
  coversByDeviceId?: Map<string, string[]>
  coversByAreaId?: Map<string, string[]>
  scriptSequences?: Record<string, unknown>
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/** Build today's open/close schedule per cover entity from HA automations and helpers. */
export function buildCoverSchedules(
  configs: HaAutomationConfig[],
  states: EntityState[],
  scriptSequences: Record<string, unknown> = {},
  coversByAreaId: Map<string, string[]> = new Map(),
  mappedCoverEntityIds: string[] = [],
): Record<string, ShadeScheduleEvent[]> {
  const context: ScheduleParseContext = {
    statesById: new Map(states.map((state) => [state.entity_id, state])),
    coversByDeviceId: coversByDeviceIdFromStates(states),
    coversByAreaId,
    scriptSequences,
  }

  const byEntity = new Map<string, ShadeScheduleEvent[]>()
  mergeScheduleMap(byEntity, schedulesFromAutomations(configs, context))
  mergeScheduleMap(byEntity, schedulesFromScheduleEntities(configs, context))
  mergeScheduleMap(byEntity, schedulesFromCoverAttributes(states))
  mergeScheduleMap(byEntity, schedulesFromHelperEntities(states, mappedCoverEntityIds))
  mergeScheduleMap(byEntity, schedulesFromStandaloneScheduleEntities(states, mappedCoverEntityIds))
  mergeScheduleMap(byEntity, schedulesFromLinkedDatetimeAutomations(configs, context))

  const result: Record<string, ShadeScheduleEvent[]> = {}
  for (const [entityId, events] of byEntity) {
    result[entityId] = sortEvents(dedupeEvents(events))
  }
  return result
}

export type ScheduleDebugInfo = {
  automationCount: number
  automationEntityCount: number
  automationIdsListed: number
  scheduleEntityCount: number
  datetimeHelperCount: number
  automationsWithCoverAction: number
  automationsWithTimeTrigger: number
  automationsWithBoth: number
  scheduledCoverCount: number
  scheduleMapCoverCount: number
  homebridgeCoverCount: number
  homebridgeSource: string | null
  homebridgeParsedCount: number
  homebridgeMatchedCount: number
  homebridgeUnmatched: string[]
  helperMatches: number
  sampleAutomationAliases: string[]
  errors: string[]
}

export function analyzeScheduleLoad(
  configs: HaAutomationConfig[],
  states: EntityState[],
  schedules: Record<string, ShadeScheduleEvent[]>,
  mappedCoverEntityIds: string[],
  loadMeta: {
    automationEntityCount: number
    listedIds: number
    errors: string[]
    scheduleMapCoverCount: number
    homebridgeCoverCount?: number
    homebridgeSource?: string | null
    homebridgeParsedCount?: number
    homebridgeMatchedCount?: number
    homebridgeUnmatched?: string[]
  },
): ScheduleDebugInfo {
  const context: ScheduleParseContext = {
    statesById: new Map(states.map((state) => [state.entity_id, state])),
    coversByDeviceId: coversByDeviceIdFromStates(states),
    coversByAreaId: new Map(),
    scriptSequences: {},
  }
  const sunTimes = sunTimesFromStates(states) ?? undefined

  let withCover = 0
  let withTime = 0
  let withBoth = 0
  for (const config of configs) {
    const hasCover = extractCoverActions(config.action ?? config.actions, context).length > 0
    const hasTime = extractTriggerTimes(config.trigger ?? config.triggers, context, sunTimes).length > 0
    if (hasCover) withCover += 1
    if (hasTime) withTime += 1
    if (hasCover && hasTime) withBoth += 1
  }

  const helperOnly = schedulesFromHelperEntities(states, mappedCoverEntityIds)
  let helperMatches = 0
  for (const events of Object.values(helperOnly)) helperMatches += events.length

  return {
    automationCount: configs.length,
    automationEntityCount: loadMeta.automationEntityCount,
    automationIdsListed: loadMeta.listedIds,
    scheduleEntityCount: states.filter((state) => state.entity_id.startsWith('schedule.')).length,
    datetimeHelperCount: states.filter((state) => state.entity_id.startsWith('input_datetime.')).length,
    automationsWithCoverAction: withCover,
    automationsWithTimeTrigger: withTime,
    automationsWithBoth: withBoth,
    scheduledCoverCount: countScheduledCovers(schedules),
    scheduleMapCoverCount: loadMeta.scheduleMapCoverCount,
    homebridgeCoverCount: loadMeta.homebridgeCoverCount ?? 0,
    homebridgeSource: loadMeta.homebridgeSource ?? null,
    homebridgeParsedCount: loadMeta.homebridgeParsedCount ?? 0,
    homebridgeMatchedCount: loadMeta.homebridgeMatchedCount ?? 0,
    homebridgeUnmatched: loadMeta.homebridgeUnmatched ?? [],
    helperMatches,
    sampleAutomationAliases: configs
      .map((config) => config.alias)
      .filter((alias): alias is string => typeof alias === 'string')
      .slice(0, 5),
    errors: loadMeta.errors,
  }
}

export function schedulesFromAutomations(
  configs: HaAutomationConfig[],
  context: ScheduleParseContext,
): Record<string, ShadeScheduleEvent[]> {
  const byEntity = new Map<string, ShadeScheduleEvent[]>()
  const sunTimes = sunTimesFromStates([...context.statesById.values()]) ?? undefined

  for (const config of configs) {
    const times = extractTriggerTimes(config.trigger ?? config.triggers, context, sunTimes)
    if (times.length === 0) continue

    const coverActions = extractCoverActions(config.action ?? config.actions, context)
    if (coverActions.length === 0) continue

    for (const time of times) {
      for (const coverAction of coverActions) {
        for (const entityId of coverAction.entityIds) {
          appendEvent(byEntity, entityId, { time, action: coverAction.action })
        }
      }
    }
  }

  return mapToRecord(byEntity)
}

/** Match input_datetime / sensor helpers to covers by name similarity. */
function schedulesFromHelperEntities(
  states: EntityState[],
  coverEntityIds: string[],
): Record<string, ShadeScheduleEvent[]> {
  if (coverEntityIds.length === 0) return {}

  const helpers = states.filter(
    (state) =>
      state.entity_id.startsWith('input_datetime.') || state.entity_id.startsWith('sensor.'),
  )
  const byEntity = new Map<string, ShadeScheduleEvent[]>()

  for (const coverId of coverEntityIds) {
    const coverState = states.find((state) => state.entity_id === coverId)
    const coverKey = matchKey([
      coverId.replace(/^cover\./, ''),
      typeof coverState?.attributes.friendly_name === 'string'
        ? coverState.attributes.friendly_name
        : '',
    ])

    for (const helper of helpers) {
      const helperSlug = helper.entity_id.split('.').slice(1).join('.')
      const helperKey = matchKey([
        helperSlug,
        typeof helper.attributes.friendly_name === 'string' ? helper.attributes.friendly_name : '',
      ])
      const action = classifyScheduleHelper(helperKey)
      if (!action) continue
      if (nameMatchScore(coverKey, helperKey) < 0.25) continue

      const time = timeFromEntityState(helper)
      if (!time) continue
      appendEvent(byEntity, coverId, { time, action })
    }
  }

  return mapToRecord(byEntity)
}

/** Link input_datetime triggers in one automation to cover actions in another via shared alias tokens. */
function schedulesFromLinkedDatetimeAutomations(
  configs: HaAutomationConfig[],
  context: ScheduleParseContext,
): Record<string, ShadeScheduleEvent[]> {
  const byEntity = new Map<string, ShadeScheduleEvent[]>()

  const coverAutomations = configs.flatMap((config) => {
    const coverActions = extractCoverActions(config.action ?? config.actions, context)
    if (coverActions.length === 0) return []
    return [{ alias: config.alias ?? '', coverActions }]
  })

  for (const config of configs) {
    const datetimeIds = extractDatetimeTriggerRefs(config.trigger ?? config.triggers)
    if (datetimeIds.length === 0) continue

    const coverActions = extractCoverActions(config.action ?? config.actions, context)
    if (coverActions.length > 0) {
      for (const datetimeId of datetimeIds) {
        const time = timeFromEntityState(context.statesById.get(datetimeId))
        if (!time) continue
        const action = classifyScheduleHelper(datetimeId) ?? 'Open'
        for (const coverAction of coverActions) {
          for (const entityId of coverAction.entityIds) {
            appendEvent(byEntity, entityId, { time, action: coverAction.action ?? action })
          }
        }
      }
      continue
    }

    const aliasKey = matchKey([config.alias ?? ''])
    if (!aliasKey) continue

    for (const datetimeId of datetimeIds) {
      const time = timeFromEntityState(context.statesById.get(datetimeId))
      if (!time) continue
      const action = classifyScheduleHelper(datetimeId) ?? classifyScheduleHelper(config.alias ?? '')
      if (!action) continue

      for (const entry of coverAutomations) {
        if (nameMatchScore(aliasKey, matchKey([entry.alias])) < 0.35) continue
        for (const coverAction of entry.coverActions) {
          for (const entityId of coverAction.entityIds) {
            appendEvent(byEntity, entityId, { time, action })
          }
        }
      }
    }
  }

  return mapToRecord(byEntity)
}

function extractDatetimeTriggerRefs(trigger: unknown): string[] {
  const refs: string[] = []
  for (const node of asArray(trigger)) {
    if (!isRecord(node)) continue
    const triggerType = String(node.trigger ?? node.platform ?? '')
    if (triggerType !== 'time' && triggerType !== 'state') continue
    if (triggerType === 'time') {
      const at = node.at
      if (typeof at === 'string' && at.includes('.')) refs.push(at)
      if (isRecord(at) && typeof at.entity_id === 'string') refs.push(at.entity_id)
    }
    if (triggerType === 'state') {
      const entityId = readTriggerEntityId(node)
      if (entityId?.startsWith('input_datetime.')) refs.push(entityId)
    }
  }
  return refs
}

function classifyScheduleHelper(text: string): 'Open' | 'Closed' | null {
  if (/\b(open|opening|sunrise|raise|up|morning)\b/.test(text)) return 'Open'
  if (/\b(close|closed|closing|sunset|lower|down|evening|night)\b/.test(text)) return 'Closed'
  return null
}

function matchKey(parts: string[]): string {
  return parts
    .join(' ')
    .toLowerCase()
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function nameMatchScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.85
  const aParts = a.split(' ').filter(Boolean)
  const bParts = new Set(b.split(' ').filter(Boolean))
  if (aParts.length === 0) return 0
  return aParts.filter((part) => bParts.has(part)).length / aParts.length
}

/** Apply schedule.* entity windows to covers — no automation config required. */
function schedulesFromStandaloneScheduleEntities(
  states: EntityState[],
  coverEntityIds: string[],
): Record<string, ShadeScheduleEvent[]> {
  if (coverEntityIds.length === 0) return {}

  const schedules = states.filter((state) => state.entity_id.startsWith('schedule.'))
  if (schedules.length === 0) return {}

  const byEntity = new Map<string, ShadeScheduleEvent[]>()

  for (const scheduleState of schedules) {
    const blocks = todayScheduleBlocks(scheduleState.attributes)
    if (blocks.length === 0) continue

    const scheduleKey = matchKey([
      scheduleState.entity_id.replace(/^schedule\./, ''),
      typeof scheduleState.attributes.friendly_name === 'string'
        ? scheduleState.attributes.friendly_name
        : '',
    ])
    const wholeHouse = /\b(shade|shades|blind|blinds|window|cover|home|house)\b/.test(scheduleKey)

    for (const coverId of coverEntityIds) {
      const coverState = states.find((state) => state.entity_id === coverId)
      const coverKey = matchKey([
        coverId.replace(/^cover\./, ''),
        typeof coverState?.attributes.friendly_name === 'string'
          ? coverState.attributes.friendly_name
          : '',
      ])

      if (!wholeHouse && nameMatchScore(scheduleKey, coverKey) < 0.25) continue

      for (const block of blocks) {
        if (block.from) appendEvent(byEntity, coverId, { time: block.from, action: 'Open' })
        if (block.to) appendEvent(byEntity, coverId, { time: block.to, action: 'Closed' })
      }
    }
  }

  return mapToRecord(byEntity)
}

function schedulesFromScheduleEntities(
  configs: HaAutomationConfig[],
  context: ScheduleParseContext,
): Record<string, ShadeScheduleEvent[]> {
  const byEntity = new Map<string, ShadeScheduleEvent[]>()
  const scheduleLinks = collectScheduleCoverLinks(configs, context)

  for (const [scheduleId, links] of scheduleLinks) {
    const state = context.statesById.get(scheduleId)
    if (!state) continue
    const blocks = todayScheduleBlocks(state.attributes)
    for (const block of blocks) {
      for (const coverId of links.open) {
        if (block.from) appendEvent(byEntity, coverId, { time: block.from, action: 'Open' })
      }
      for (const coverId of links.close) {
        if (block.to) appendEvent(byEntity, coverId, { time: block.to, action: 'Closed' })
      }
    }
  }

  return mapToRecord(byEntity)
}

function schedulesFromCoverAttributes(states: EntityState[]): Record<string, ShadeScheduleEvent[]> {
  const byEntity = new Map<string, ShadeScheduleEvent[]>()

  for (const state of states) {
    if (!state.entity_id.startsWith('cover.')) continue
    const attrs = state.attributes

    for (const key of [
      'open_time',
      'close_time',
      'next_open',
      'next_close',
      'scheduled_open',
      'scheduled_close',
    ]) {
      const value = attrs[key]
      if (!value) continue
      const time = timeFromValue(value)
      if (!time) continue
      appendEvent(byEntity, state.entity_id, {
        time,
        action: key.includes('close') ? 'Closed' : 'Open',
      })
    }
  }

  return mapToRecord(byEntity)
}

function collectScheduleCoverLinks(
  configs: HaAutomationConfig[],
  context: ScheduleParseContext,
): Map<string, { open: Set<string>; close: Set<string> }> {
  const links = new Map<string, { open: Set<string>; close: Set<string> }>()

  for (const config of configs) {
    const scheduleTriggers = asArray(config.trigger ?? config.triggers).filter(isScheduleStateTrigger)
    if (scheduleTriggers.length === 0) continue

    const coverActions = extractCoverActions(config.action ?? config.actions, context)
    if (coverActions.length === 0) continue

    for (const trigger of scheduleTriggers) {
      const scheduleId = scheduleEntityId(trigger)
      if (!scheduleId) continue
      const entry = links.get(scheduleId) ?? { open: new Set<string>(), close: new Set<string>() }
      const toState = String(trigger.to ?? trigger.from ?? '').toLowerCase()

      for (const coverAction of coverActions) {
        for (const coverId of coverAction.entityIds) {
          if (coverAction.action === 'Open' || toState === 'on') entry.open.add(coverId)
          if (coverAction.action === 'Closed' || toState === 'off') entry.close.add(coverId)
          if (!toState) {
            entry.open.add(coverId)
            entry.close.add(coverId)
          }
        }
      }

      links.set(scheduleId, entry)
    }
  }

  return links
}

function isScheduleStateTrigger(node: unknown): node is Record<string, unknown> {
  if (!isRecord(node)) return false
  const triggerType = String(node.trigger ?? node.platform ?? '')
  if (triggerType !== 'state') return false
  const entityId = readTriggerEntityId(node)
  return Boolean(entityId?.startsWith('schedule.'))
}

function scheduleEntityId(trigger: Record<string, unknown>): string | null {
  const entityId = readTriggerEntityId(trigger)
  return entityId?.startsWith('schedule.') ? entityId : null
}

function readTriggerEntityId(trigger: Record<string, unknown>): string | null {
  if (typeof trigger.entity_id === 'string') return trigger.entity_id
  if (Array.isArray(trigger.entity_id)) {
    const first = trigger.entity_id.find((item) => typeof item === 'string')
    return typeof first === 'string' ? first : null
  }
  return null
}

function todayScheduleBlocks(attributes: Record<string, unknown>): Array<{ from: string | null; to: string | null }> {
  const day = WEEKDAYS[new Date().getDay()]
  const blocks = attributes[day]
  if (!Array.isArray(blocks)) return []

  return blocks
    .filter(isRecord)
    .map((block) => ({
      from: timeFromValue(block.from),
      to: timeFromValue(block.to),
    }))
    .filter((block) => block.from || block.to)
}

export function collectScriptIdsFromConfigs(configs: HaAutomationConfig[]): string[] {
  const ids = new Set<string>()
  for (const config of configs) {
    collectScriptIds(config.action ?? config.actions, ids)
  }
  return [...ids]
}

function collectScriptIds(action: unknown, ids: Set<string>): void {
  walkActions(action, (node) => {
    const service = readService(node)
    if (service !== 'script.turn_on') return
    for (const scriptId of readScriptEntityIds(node)) ids.add(scriptId)
  })
}

export function sunTimesFromStates(states: EntityState[]): { sunrise: string; sunset: string } | null {
  const sun = states.find((state) => state.entity_id === 'sun.sun')
  if (!sun) return null

  const sunrise = pickTodayTime(sun.attributes.next_rising, sun.attributes.previous_rising)
  const sunset = pickTodayTime(sun.attributes.next_setting, sun.attributes.previous_setting)
  if (!sunrise || !sunset) return null
  return { sunrise, sunset }
}

export function coversByDeviceIdFromStates(states: EntityState[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const state of states) {
    if (!state.entity_id.startsWith('cover.')) continue
    const deviceId = state.attributes.device_id
    if (typeof deviceId !== 'string') continue
    const list = map.get(deviceId) ?? []
    list.push(state.entity_id)
    map.set(deviceId, list)
  }
  return map
}

export function coversByAreaIdFromRegistry(
  entries: Array<{ entity_id: string; area_id: string | null }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const entry of entries) {
    if (!entry.entity_id.startsWith('cover.')) continue
    if (!entry.area_id) continue
    const list = map.get(entry.area_id) ?? []
    list.push(entry.entity_id)
    map.set(entry.area_id, list)
  }
  return map
}

function pickTodayTime(nextValue: unknown, previousValue: unknown): string | null {
  const next = isoToLocalTime(nextValue)
  if (next && isToday(nextValue)) return next
  const previous = isoToLocalTime(previousValue)
  if (previous && isToday(previousValue)) return previous
  return next ?? previous
}

function isToday(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function isoToLocalTime(value: unknown): string | null {
  return timeFromValue(value)
}

function timeFromValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000
    const date = new Date(ms)
    if (Number.isNaN(date.getTime())) return null
    return formatLocalTime(date)
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  const literal = parseClockTime(trimmed)
  if (literal) return literal

  const date = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'))
  if (!Number.isNaN(date.getTime())) return formatLocalTime(date)

  return null
}

function timeFromEntityState(state?: EntityState): string | null {
  if (!state) return null

  const fromState = timeFromValue(state.state)
  if (fromState) return fromState

  if (typeof state.attributes.timestamp === 'number') {
    return timeFromValue(state.attributes.timestamp)
  }

  if (
    typeof state.attributes.hour === 'number' &&
    typeof state.attributes.minute === 'number'
  ) {
    return `${String(state.attributes.hour).padStart(2, '0')}:${String(state.attributes.minute).padStart(2, '0')}`
  }

  return null
}

function formatLocalTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function dedupeEvents(events: ShadeScheduleEvent[]): ShadeScheduleEvent[] {
  const seen = new Set<string>()
  const deduped: ShadeScheduleEvent[] = []
  for (const event of events) {
    const key = `${event.time}|${event.action}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(event)
  }
  return deduped
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

function sortEvents(events: ShadeScheduleEvent[]): ShadeScheduleEvent[] {
  return [...events].sort((a, b) => a.time.localeCompare(b.time))
}

function mapToRecord(map: Map<string, ShadeScheduleEvent[]>): Record<string, ShadeScheduleEvent[]> {
  const result: Record<string, ShadeScheduleEvent[]> = {}
  for (const [entityId, events] of map) {
    result[entityId] = sortEvents(dedupeEvents(events))
  }
  return result
}

function mergeScheduleMap(
  target: Map<string, ShadeScheduleEvent[]>,
  source: Record<string, ShadeScheduleEvent[]>,
): void {
  for (const [entityId, events] of Object.entries(source)) {
    for (const event of events) appendEvent(target, entityId, event)
  }
}

function extractTriggerTimes(
  trigger: unknown,
  context: ScheduleParseContext,
  sunTimes?: { sunrise: string; sunset: string },
): string[] {
  const nodes = asArray(trigger)
  const times: string[] = []

  for (const node of nodes) {
    if (!isRecord(node)) continue
    const triggerType = String(node.trigger ?? node.platform ?? '')

    if (triggerType === 'time') {
      const resolved = resolveAtTime(node.at, context)
      if (resolved) times.push(resolved)
      continue
    }

    if (triggerType === 'sun' && sunTimes) {
      const event = String(node.event ?? 'sunrise')
      const base = event === 'sunset' ? sunTimes.sunset : sunTimes.sunrise
      const offsetMinutes = parseOffsetMinutes(node.offset)
      const shifted = addMinutes(base, offsetMinutes)
      if (shifted) times.push(shifted)
      continue
    }

    if (triggerType === 'state') {
      const entityId = readTriggerEntityId(node)
      if (!entityId) continue
      if (entityId.startsWith('input_datetime.') || entityId.startsWith('sensor.')) {
        const resolved = timeFromEntityState(context.statesById.get(entityId))
        if (resolved) times.push(resolved)
      }
    }
  }

  return times
}

function resolveAtTime(at: unknown, context: ScheduleParseContext): string | null {
  if (at == null) return null

  if (typeof at === 'string') {
    const literal = parseClockTime(at)
    if (literal) return literal
    if (at.includes('.')) return timeFromEntityState(context.statesById.get(at))
    return null
  }

  if (isRecord(at)) {
    const entityId = typeof at.entity_id === 'string' ? at.entity_id : null
    if (!entityId) return null
    const state = context.statesById.get(entityId)
    if (!state) return null
    if (typeof at.attribute === 'string') {
      return timeFromValue(state.attributes[at.attribute]) ?? timeFromValue(state.state)
    }
    return timeFromEntityState(state)
  }

  return null
}

function parseOffsetMinutes(value: unknown): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0

  const trimmed = value.trim()
  const numeric = Number(trimmed)
  if (Number.isFinite(numeric) && !trimmed.includes(':')) return numeric

  const match = /^(-)?(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (!match) return 0

  const sign = match[1] ? -1 : 1
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3])
  const seconds = Number(match[4])
  return sign * (hours * 60 + minutes + Math.round(seconds / 60))
}

function addMinutes(time: string, deltaMinutes: number): string | null {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const total = h * 60 + m + deltaMinutes
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(wrapped / 60)
  const minutes = wrapped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function parseClockTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function extractCoverActions(
  action: unknown,
  context: ScheduleParseContext,
): ParsedCoverAction[] {
  const results: ParsedCoverAction[] = []
  walkActions(action, (node) => {
    const service = readService(node)
    if (service === 'script.turn_on') {
      for (const scriptId of readScriptEntityIds(node)) {
        const sequence = context.scriptSequences?.[scriptId]
        if (sequence) results.push(...extractCoverActions(sequence, context))
      }
      return
    }

    if (service === 'homeassistant.turn_on' || service === 'homeassistant.turn_off') {
      const entityIds = readEntityIds(node, context)
      if (entityIds.length === 0) return
      results.push({
        entityIds,
        action: service === 'homeassistant.turn_on' ? 'Open' : 'Closed',
      })
      return
    }

    if (!service?.startsWith('cover.')) return

    const entityIds = readEntityIds(node, context)
    if (entityIds.length === 0) return

    const parsed = coverActionFromService(service, node)
    if (!parsed) return
    results.push({ entityIds, action: parsed })
  })
  return results
}

function coverActionFromService(
  service: string,
  node: Record<string, unknown>,
): 'Open' | 'Closed' | null {
  if (service === 'cover.open_cover') return 'Open'
  if (service === 'cover.close_cover') return 'Closed'
  if (service !== 'cover.set_cover_position') return null

  const position = readPosition(node)
  if (position == null) return null
  if (position >= 90) return 'Open'
  if (position <= 10) return 'Closed'
  return null
}

function readService(node: Record<string, unknown>): string | null {
  const service = node.service ?? node.action
  if (typeof service === 'string') return service

  const domain = node.domain
  const type = node.type
  if (typeof domain === 'string' && typeof type === 'string') {
    return `${domain}.${type}`
  }
  if (typeof type === 'string' && type.includes('.')) return type

  return null
}

function readPosition(node: Record<string, unknown>): number | null {
  const data = isRecord(node.data) ? node.data : node
  const raw = data.position
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readScriptEntityIds(node: Record<string, unknown>): string[] {
  const ids = new Set<string>()
  const target = isRecord(node.target) ? node.target : null
  if (target) collectScriptIdsFromValue(target.entity_id, ids)
  collectScriptIdsFromValue(node.entity_id, ids)
  const data = isRecord(node.data) ? node.data : null
  if (data) collectScriptIdsFromValue(data.entity_id, ids)
  return [...ids]
}

function collectScriptIdsFromValue(value: unknown, ids: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith('script.')) ids.add(value)
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (typeof item === 'string' && item.startsWith('script.')) ids.add(item)
  }
}

function readEntityIds(node: Record<string, unknown>, context: ScheduleParseContext): string[] {
  const ids = new Set<string>()

  const target = isRecord(node.target) ? node.target : null
  if (target) {
    collectEntityIds(target.entity_id, ids)
    collectDeviceIds(target.device_id, ids, context.coversByDeviceId)
    collectAreaIds(target.area_id, ids, context.coversByAreaId)
    collectLabelIds(target.label_id, ids, context)
  }

  collectEntityIds(node.entity_id, ids)
  collectDeviceIds(node.device_id, ids, context.coversByDeviceId)
  collectAreaIds(node.area_id, ids, context.coversByAreaId)

  const data = isRecord(node.data) ? node.data : null
  if (data) {
    collectEntityIds(data.entity_id, ids)
    collectDeviceIds(data.device_id, ids, context.coversByDeviceId)
    collectAreaIds(data.area_id, ids, context.coversByAreaId)
  }

  return [...ids]
}

function collectLabelIds(
  value: unknown,
  ids: Set<string>,
  context: ScheduleParseContext,
): void {
  // Label targeting needs the label registry; skip unless we add it later.
  void value
  void ids
  void context
}

function collectEntityIds(value: unknown, ids: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith('cover.')) ids.add(value)
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (typeof item === 'string' && item.startsWith('cover.')) ids.add(item)
  }
}

function collectDeviceIds(
  value: unknown,
  ids: Set<string>,
  coversByDeviceId?: Map<string, string[]>,
): void {
  if (!coversByDeviceId) return
  for (const deviceId of asStringArray(value)) {
    for (const entityId of coversByDeviceId.get(deviceId) ?? []) ids.add(entityId)
  }
}

function collectAreaIds(
  value: unknown,
  ids: Set<string>,
  coversByAreaId?: Map<string, string[]>,
): void {
  if (!coversByAreaId) return
  for (const areaId of asStringArray(value)) {
    for (const entityId of coversByAreaId.get(areaId) ?? []) ids.add(entityId)
  }
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function walkActions(action: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (action == null) return

  if (Array.isArray(action)) {
    for (const item of action) walkActions(item, visit)
    return
  }

  if (!isRecord(action)) return

  if ('parallel' in action) {
    walkActions(action.parallel, visit)
    return
  }
  if ('sequence' in action) {
    walkActions(action.sequence, visit)
    return
  }
  if ('repeat' in action && isRecord(action.repeat)) {
    walkActions(action.repeat.sequence, visit)
    return
  }
  if ('choose' in action && Array.isArray(action.choose)) {
    for (const branch of action.choose) {
      if (!isRecord(branch)) continue
      walkActions(branch.sequence, visit)
    }
    return
  }
  if ('if' in action) {
    walkActions(action.then, visit)
    walkActions(action.else, visit)
    return
  }

  visit(action)
}

function asArray(value: unknown): unknown[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function countScheduledCovers(map: Record<string, ShadeScheduleEvent[]>): number {
  return Object.values(map).filter((events) => events.length > 0).length
}
