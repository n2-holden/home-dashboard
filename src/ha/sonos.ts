import type { HaState } from './positions'
import type { EntityRegistryEntry } from './ws'

export type SonosUnit = {
  entityId: string
  label: string
  state: string
  playing: boolean
  paused: boolean
  mediaTitle: string | null
  mediaArtist: string | null
  /** Radio channel / configured source (station, playlist, etc.). */
  station: string | null
  source: string | null
  /** HA Sonos favorites / selectable sources. */
  favorites: string[]
  volumePercent: number | null
  muted: boolean
}

export type SonosSnapshot = {
  units: SonosUnit[]
  anyPlaying: boolean
  playingUnits: SonosUnit[]
}

export const EMPTY_SONOS: SonosSnapshot = {
  units: [],
  anyPlaying: false,
  playingUnits: [],
}

const ACTIVE_STATES = new Set(['playing', 'buffering', 'paused'])

function friendlyLabel(state: HaState): string {
  const friendly = String(state.attributes.friendly_name ?? '').trim()
  if (friendly) return friendly
  return state.entity_id
    .replace(/^media_player\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function isPlayingState(raw: string): boolean {
  return raw === 'playing' || raw === 'buffering'
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function volumePercentFromState(state: HaState): number | null {
  const raw = state.attributes.volume_level
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.max(0, Math.min(100, Math.round(raw * 100)))
}

function favoritesFromState(state: HaState): string[] {
  const raw = state.attributes.source_list
  if (!Array.isArray(raw)) return []
  const names = raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return [...new Set(names)]
}

/** Prefer registry platform=sonos; fall back to speaker-like media players. */
export function sonosSnapshotFromStates(
  states: HaState[],
  registry: EntityRegistryEntry[] = [],
): SonosSnapshot {
  const sonosIds = new Set(
    registry
      .filter((entry) => entry.platform === 'sonos' && entry.entity_id.startsWith('media_player.'))
      .map((entry) => entry.entity_id),
  )

  const candidates = states.filter((state) => {
    if (!state.entity_id.startsWith('media_player.')) return false
    if (sonosIds.size > 0) return sonosIds.has(state.entity_id)
    const deviceClass = String(state.attributes.device_class ?? '').toLowerCase()
    if (deviceClass && deviceClass !== 'speaker') return false
    const hay = `${state.entity_id} ${String(state.attributes.friendly_name ?? '')}`.toLowerCase()
    if (
      hay.includes('tv') ||
      hay.includes('roku') ||
      hay.includes('apple_tv') ||
      hay.includes('chromecast')
    ) {
      return false
    }
    return true
  })

  const units: SonosUnit[] = candidates
    .map((state) => {
      const raw = String(state.state ?? '').toLowerCase()
      const source = optionalString(state.attributes.source)
      const channel = optionalString(state.attributes.media_channel)
      const mediaTitle = optionalString(state.attributes.media_title)
      const mediaArtist = optionalString(state.attributes.media_artist)
      const station = channel ?? source
      return {
        entityId: state.entity_id,
        label: friendlyLabel(state),
        state: raw,
        playing: isPlayingState(raw),
        paused: raw === 'paused',
        mediaTitle,
        mediaArtist,
        station,
        source,
        favorites: favoritesFromState(state),
        volumePercent: volumePercentFromState(state),
        muted: state.attributes.is_volume_muted === true,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  const playingUnits = units.filter((unit) => unit.playing)
  return {
    units,
    anyPlaying: playingUnits.length > 0,
    playingUnits,
  }
}

export function sonosStopTargets(snapshot: SonosSnapshot): string[] {
  return snapshot.units
    .filter((unit) => ACTIVE_STATES.has(unit.state))
    .map((unit) => unit.entityId)
}

export function formatSonosState(unit: SonosUnit): string {
  if (unit.playing) return 'Playing'
  if (unit.paused) return 'Paused'
  if (unit.state === 'off') return 'Off'
  if (unit.state === 'idle' || unit.state === 'standby') return 'Idle'
  return unit.state ? unit.state.replace(/_/g, ' ') : 'Unknown'
}

const NON_MUSIC_SOURCES = new Set(['line-in', 'tv', 'tv audio', 'aux'])

/** Prefer current source/station if it's a favorite; else first music-like favorite. */
export function pickSonosFavorite(unit: SonosUnit): string | null {
  const current = (unit.source ?? unit.station ?? '').trim()
  if (current && unit.favorites.includes(current)) return current

  const music = unit.favorites.find((favorite) => {
    const key = favorite.trim().toLowerCase()
    return key && !NON_MUSIC_SOURCES.has(key)
  })
  return music ?? null
}

/** True for iPhone / iPad (including iPadOS desktop UA). */
export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Best-effort launch of the Sonos controller app.
 * Sonos does not publish rich deep links for search; S2 uses sonos-2://.
 */
export function openSonosApp(): void {
  if (typeof window === 'undefined') return
  const schemes = ['sonos-2://', 'sonos://', 'sonos-1://']
  // Sequential attempts: if one scheme is registered, iOS hands off to the app.
  let index = 0
  const tryNext = () => {
    if (index >= schemes.length) return
    const scheme = schemes[index]
    index += 1
    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    frame.src = scheme
    document.body.appendChild(frame)
    window.setTimeout(() => {
      frame.remove()
      tryNext()
    }, 250)
  }
  // Also set location for WebViews that ignore hidden iframes.
  window.location.href = schemes[0]
  window.setTimeout(tryNext, 400)
}
