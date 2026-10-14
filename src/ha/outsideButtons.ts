import {
  normalizeDashboardActionList,
  resolveNamedDashboardAction,
  type DashboardActionSelection,
  type DashboardServiceOp,
} from './dashboardActions'
import type { HaState } from './positions'
import type { SonosSnapshot } from './sonos'

/** User-defined button shown on the Outside widget. */
export type OutsideCustomButton = {
  id: string
  name: string
  /** Label shown on the red Active control (defaults to "Active"). */
  activeName: string
  /** Actions run when the idle (named) button is pressed. */
  actions: DashboardActionSelection[]
  /**
   * When true, clicking Active restores each entity touched by `actions`
   * to the state captured just before the idle press.
   */
  restore: boolean
  /** Actions run when the red Active button is pressed (after optional restore). */
  activeActions: DashboardActionSelection[]
}

/** Captured HA entity state used for Restore. */
export type OutsideEntitySnapshot = {
  entityId: string
  state: string
  attributes: Record<string, unknown>
}

export function newOutsideButtonId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `outside-btn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeOutsideCustomButton(raw: unknown): OutsideCustomButton | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!id || !name) return null
  const activeNameRaw = typeof value.activeName === 'string' ? value.activeName.trim() : ''
  return {
    id,
    name: name.slice(0, 64),
    activeName: (activeNameRaw || 'Active').slice(0, 64),
    actions: normalizeDashboardActionList(value.actions),
    restore: value.restore === true,
    activeActions: normalizeDashboardActionList(value.activeActions),
  }
}

export function normalizeOutsideCustomButtons(raw: unknown): OutsideCustomButton[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeOutsideCustomButton)
    .filter((button): button is OutsideCustomButton => button != null)
}

function resolveActionOps(
  action: DashboardActionSelection,
  states: HaState[],
  audio?: SonosSnapshot,
): DashboardServiceOp[] {
  if (action.named != null) {
    return resolveNamedDashboardAction(action.named, states, audio)
  }
  return action.ops
}

/** Entity IDs that will be touched when running the given actions. */
export function entityIdsAffectedByActions(
  actions: DashboardActionSelection[],
  states: HaState[],
  audio?: SonosSnapshot,
): string[] {
  const ids = new Set<string>()
  for (const action of actions) {
    for (const op of resolveActionOps(action, states, audio)) {
      for (const entityId of op.entityIds) {
        if (entityId) ids.add(entityId)
      }
    }
  }
  return [...ids]
}

const SNAPSHOT_ATTR_KEYS = [
  'brightness',
  'brightness_pct',
  'color_temp',
  'color_temp_kelvin',
  'rgb_color',
  'hs_color',
  'current_position',
  'percentage',
  'volume_level',
] as const

export function snapshotEntities(
  states: HaState[],
  entityIds: string[],
): OutsideEntitySnapshot[] {
  const byId = new Map(states.map((state) => [state.entity_id, state]))
  const snapshots: OutsideEntitySnapshot[] = []
  for (const entityId of entityIds) {
    const state = byId.get(entityId)
    if (!state) continue
    const attributes: Record<string, unknown> = {}
    for (const key of SNAPSHOT_ATTR_KEYS) {
      const value = state.attributes[key]
      if (value !== undefined) attributes[key] = value
    }
    snapshots.push({
      entityId,
      state: state.state,
      attributes,
    })
  }
  return snapshots
}

function domainOf(entityId: string): string {
  const dot = entityId.indexOf('.')
  return dot > 0 ? entityId.slice(0, dot) : ''
}

/** Build service ops that put entities back to their captured snapshots. */
export function restoreOpsFromSnapshots(snapshots: OutsideEntitySnapshot[]): DashboardServiceOp[] {
  const ops: DashboardServiceOp[] = []
  for (const snap of snapshots) {
    const domain = domainOf(snap.entityId)
    const state = snap.state.toLowerCase()
    if (!domain || state === 'unavailable' || state === 'unknown') continue

    if (
      domain === 'light' ||
      domain === 'switch' ||
      domain === 'fan' ||
      domain === 'input_boolean'
    ) {
      if (state === 'on') {
        const data: Record<string, unknown> = {}
        if (domain === 'light') {
          if (typeof snap.attributes.brightness === 'number') {
            data.brightness = snap.attributes.brightness
          } else if (typeof snap.attributes.brightness_pct === 'number') {
            data.brightness_pct = snap.attributes.brightness_pct
          }
          if (typeof snap.attributes.color_temp_kelvin === 'number') {
            data.color_temp_kelvin = snap.attributes.color_temp_kelvin
          } else if (typeof snap.attributes.color_temp === 'number') {
            data.color_temp = snap.attributes.color_temp
          }
        }
        if (domain === 'fan' && typeof snap.attributes.percentage === 'number') {
          data.percentage = snap.attributes.percentage
        }
        ops.push({
          domain,
          service: 'turn_on',
          entityIds: [snap.entityId],
          ...(Object.keys(data).length > 0 ? { data } : {}),
        })
      } else if (state === 'off') {
        ops.push({ domain, service: 'turn_off', entityIds: [snap.entityId] })
      }
      continue
    }

    if (domain === 'media_player') {
      if (state === 'off') {
        ops.push({ domain, service: 'turn_off', entityIds: [snap.entityId] })
      } else if (state === 'playing') {
        ops.push({ domain, service: 'media_play', entityIds: [snap.entityId] })
      } else if (state === 'paused') {
        ops.push({ domain, service: 'media_pause', entityIds: [snap.entityId] })
      } else if (state === 'idle' || state === 'standby' || state === 'on') {
        ops.push({ domain, service: 'turn_on', entityIds: [snap.entityId] })
      }
      continue
    }

    if (domain === 'cover') {
      if (typeof snap.attributes.current_position === 'number') {
        ops.push({
          domain,
          service: 'set_cover_position',
          entityIds: [snap.entityId],
          data: { position: snap.attributes.current_position },
        })
      } else if (state === 'open' || state === 'opening') {
        ops.push({ domain, service: 'open_cover', entityIds: [snap.entityId] })
      } else if (state === 'closed' || state === 'closing') {
        ops.push({ domain, service: 'close_cover', entityIds: [snap.entityId] })
      }
      continue
    }

    if (domain === 'valve') {
      if (state === 'open' || state === 'opening') {
        ops.push({ domain, service: 'open_valve', entityIds: [snap.entityId] })
      } else if (state === 'closed' || state === 'closing') {
        ops.push({ domain, service: 'close_valve', entityIds: [snap.entityId] })
      }
      continue
    }

    if (domain === 'input_select') {
      ops.push({
        domain,
        service: 'select_option',
        entityIds: [snap.entityId],
        data: { option: snap.state },
      })
    }
  }
  return ops
}

export async function runRestoreSnapshots(
  runner: {
    callService: (
      domain: string,
      service: string,
      entityIds?: string[],
      data?: Record<string, unknown>,
    ) => Promise<void>
  },
  snapshots: OutsideEntitySnapshot[],
): Promise<void> {
  for (const op of restoreOpsFromSnapshots(snapshots)) {
    await runner.callService(op.domain, op.service, op.entityIds, op.data)
  }
}
