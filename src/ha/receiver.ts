import type { HaState } from './positions'
import type { EntityRegistryEntry } from './ws'

/** Prefer this entity when present (Family Room Marantz NR1510). */
export const PREFERRED_RECEIVER_ENTITY_ID = 'media_player.family_room_tv_receiver'

/** Receiver input used while Family Room Sonos is playing (analog/CD). */
export const RECEIVER_SOURCE_SONOS = 'CD'

/** Receiver input restored when Family Room Sonos stops. */
export const RECEIVER_SOURCE_TV = 'TV Audio'

export type ReceiverSnapshot = {
  entityId: string | null
  label: string
  /** Powered on (includes playing/paused/idle while on). */
  on: boolean
  source: string | null
  /** Inputs from HA `source_list` (e.g. TV Audio, CD). */
  sources: string[]
  volumePercent: number | null
  muted: boolean
  available: boolean
}

export const EMPTY_RECEIVER: ReceiverSnapshot = {
  entityId: null,
  label: 'TV receiver',
  on: false,
  source: null,
  sources: [],
  volumePercent: null,
  muted: false,
  available: false,
}

/** Family Room Sonos speaker (not the TV receiver media player). */
export function isFamilyRoomSonos(entityId: string, label = ''): boolean {
  const hay = `${entityId} ${label}`.toLowerCase()
  if (
    hay.includes('tv_receiver') ||
    hay.includes('receiver') ||
    hay.includes('marantz') ||
    hay.includes('denon')
  ) {
    return false
  }
  return /family[_\s-]?room/.test(hay)
}

function friendlyLabel(state: HaState): string {
  const friendly = String(state.attributes.friendly_name ?? '').trim()
  if (friendly) return friendly
  return state.entity_id
    .replace(/^media_player\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function sourcesFromState(state: HaState): string[] {
  const raw = state.attributes.source_list
  if (!Array.isArray(raw)) return []
  const names = raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return [...new Set(names)]
}

function volumePercentFromState(state: HaState): number | null {
  const raw = state.attributes.volume_level
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.max(0, Math.min(100, Math.round(raw * 100)))
}

function looksLikeAvReceiver(state: HaState, platform: string | null): boolean {
  if (state.entity_id === PREFERRED_RECEIVER_ENTITY_ID) return true
  if (platform === 'denonavr') return true
  const hay = `${state.entity_id} ${String(state.attributes.friendly_name ?? '')} ${String(
    state.attributes.manufacturer ?? '',
  )} ${String(state.attributes.model ?? '')}`.toLowerCase()
  if (hay.includes('sonos')) return false
  return (
    hay.includes('marantz') ||
    hay.includes('denon') ||
    hay.includes('nr1510') ||
    hay.includes('avr') ||
    hay.includes('receiver') ||
    hay.includes('cinema')
  )
}

function isPoweredOn(raw: string): boolean {
  return raw !== 'off' && raw !== 'unavailable' && raw !== 'unknown'
}

/** Prefer Denon/Marantz AVR media players (e.g. Marantz NR1510 via denonavr). */
export function receiverSnapshotFromStates(
  states: HaState[],
  registry: EntityRegistryEntry[] = [],
): ReceiverSnapshot {
  const platformById = new Map(
    registry.map((entry) => [entry.entity_id, entry.platform] as const),
  )

  const candidates = states.filter((state) => {
    if (!state.entity_id.startsWith('media_player.')) return false
    const platform = platformById.get(state.entity_id) ?? null
    if (platform === 'sonos') return false
    return looksLikeAvReceiver(state, platform)
  })

  candidates.sort((a, b) => {
    const score = (state: HaState) => {
      const platform = platformById.get(state.entity_id) ?? ''
      let s = 0
      if (state.entity_id === PREFERRED_RECEIVER_ENTITY_ID) s += 100
      if (platform === 'denonavr') s += 40
      const hay = `${state.entity_id} ${state.attributes.friendly_name ?? ''} ${state.attributes.model ?? ''}`.toLowerCase()
      if (hay.includes('nr1510')) s += 50
      if (hay.includes('family_room') && hay.includes('tv')) s += 45
      if (hay.includes('marantz')) s += 25
      if (hay.includes('denon')) s += 15
      if (hay.includes('receiver') || hay.includes('avr')) s += 10
      return s
    }
    return score(b) - score(a)
  })

  const state = candidates[0]
  if (!state) return EMPTY_RECEIVER

  const raw = String(state.state ?? '').toLowerCase()
  const source = state.attributes.source
  const sources = sourcesFromState(state)
  const current =
    typeof source === 'string' && source.trim() ? source.trim() : null
  // Ensure current source appears in the list even if HA omitted it briefly.
  const sourcesWithCurrent =
    current && !sources.includes(current) ? [current, ...sources] : sources

  return {
    entityId: state.entity_id,
    label: friendlyLabel(state),
    on: isPoweredOn(raw),
    source: current,
    sources: sourcesWithCurrent,
    volumePercent: volumePercentFromState(state),
    muted: state.attributes.is_volume_muted === true,
    available: raw !== 'unavailable' && raw !== 'unknown',
  }
}
