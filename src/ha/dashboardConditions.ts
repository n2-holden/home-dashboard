import { GATE_CLOSED_SENSOR } from './gate'
import { MAIN_GARAGE, WORKSHOP_GARAGE } from './garage'
import type { CrestronLight } from './lights'
import { CRESTRON_ROOM_GROUPS } from './lights'
import {
  OUTSIDE_LIGHTS_MODE_ENTITY,
  OUTSIDE_MODES,
  type OutsideTransformer,
} from './outside'
import {
  discoverPoolCircuitSwitchId,
  discoverPoolSamLightEntityIds,
  PENTAIR_POOL_CIRCUIT_SWITCH,
  PENTAIR_POOL_SAM_LIGHT_ENTITIES,
} from './pool'
import { discoverPondFillEntityId } from './pond'
import type { HaState } from './positions'
import { PREFERRED_RECEIVER_ENTITY_ID, type ReceiverSnapshot } from './receiver'
import type { SonosSnapshot } from './sonos'
import type { ShadeEntityMap } from './storage'
import type { ActionCatalogInput } from './dashboardActions'

export type ConditionLogic = 'and' | 'or'

/** Entity is on / open (covers, valves, binary sensors). */
export type DashboardEntityCondition = {
  kind: 'entity'
  labels: string[]
  entityIds: string[]
  expected: 'on' | 'off'
}

export type DashboardSelectCondition = {
  kind: 'select'
  labels: string[]
  entityId: string
  expected: string
}

export type DashboardTimeCondition = {
  kind: 'time'
  labels: string[]
  compare: 'before' | 'after'
  /** Local wall-clock HH:MM or HH:MM:SS */
  time: string
}

export type DashboardSunCondition = {
  kind: 'sun'
  labels: string[]
  compare: 'before' | 'after'
  event: 'sunrise' | 'sunset'
  /** Hours added to the sun event (negative = earlier). */
  offsetHours?: number
}

export type DashboardCondition =
  | DashboardEntityCondition
  | DashboardSelectCondition
  | DashboardTimeCondition
  | DashboardSunCondition

export type DrivewayAlarmConditionRow = {
  id: string
  /** Joins this row with the previous row (ignored for the first). */
  join: ConditionLogic
  condition: DashboardCondition
}

export type ConditionPickerNode =
  | { kind: 'group'; id: string; label: string; children: ConditionPickerNode[] }
  | { kind: 'leaf'; id: string; label: string; condition: DashboardCondition }
  | {
      kind: 'choice'
      id: string
      label: string
      choices: Array<{ id: string; label: string; condition: DashboardCondition }>
    }
  | {
      kind: 'time_entry'
      id: string
      label: string
      compare: 'before' | 'after'
    }
  | {
      kind: 'sun_entry'
      id: string
      label: string
      compare: 'before' | 'after'
      event: 'sunrise' | 'sunset'
    }

export function formatSunOffsetLabel(offsetHours: number): string {
  const sign = offsetHours < 0 ? '−' : '+'
  return `${sign}${Math.abs(offsetHours)}h`
}

export function buildSunConditionLabels(
  event: 'sunrise' | 'sunset',
  compare: 'before' | 'after',
  offsetHours: number,
): string[] {
  const labels = [
    'Other',
    event === 'sunrise' ? 'Sunrise' : 'Sunset',
    compare === 'before' ? 'Before' : 'After',
  ]
  if (offsetHours !== 0) labels.push(formatSunOffsetLabel(offsetHours))
  return labels
}

function sunGroup(event: 'sunrise' | 'sunset'): ConditionPickerNode {
  const label = event === 'sunrise' ? 'Sunrise' : 'Sunset'
  return {
    kind: 'group',
    id: `cond-other-${event}`,
    label,
    children: [
      { kind: 'sun_entry', id: `cond-${event}-before`, label: 'Before…', compare: 'before', event },
      { kind: 'sun_entry', id: `cond-${event}-after`, label: 'After…', compare: 'after', event },
    ],
  }
}

function onOffEntityChoice(
  id: string,
  labels: string[],
  entityIds: string[],
): ConditionPickerNode {
  const ids = entityIds.filter(Boolean)
  return {
    kind: 'choice',
    id,
    label: labels[labels.length - 1] ?? id,
    choices: [
      {
        id: `${id}:on`,
        label: 'On',
        condition: { kind: 'entity', labels: [...labels, 'On'], entityIds: ids, expected: 'on' },
      },
      {
        id: `${id}:off`,
        label: 'Off',
        condition: { kind: 'entity', labels: [...labels, 'Off'], entityIds: ids, expected: 'off' },
      },
    ],
  }
}

function openCloseEntityChoice(
  id: string,
  labels: string[],
  entityIds: string[],
): ConditionPickerNode {
  return {
    kind: 'choice',
    id,
    label: labels[labels.length - 1] ?? id,
    choices: [
      {
        id: `${id}:open`,
        label: 'Open',
        condition: {
          kind: 'entity',
          labels: [...labels, 'Open'],
          entityIds,
          expected: 'on',
        },
      },
      {
        id: `${id}:closed`,
        label: 'Closed',
        condition: {
          kind: 'entity',
          labels: [...labels, 'Closed'],
          entityIds,
          expected: 'off',
        },
      },
    ],
  }
}

function outsideBranch(transformers: OutsideTransformer[]): ConditionPickerNode {
  const modeChildren: ConditionPickerNode[] = OUTSIDE_MODES.map((mode) => ({
    kind: 'leaf',
    id: `cond-outside-mode-${mode}`,
    label: mode,
    condition: {
      kind: 'select',
      labels: ['Outside', 'Mode', mode],
      entityId: OUTSIDE_LIGHTS_MODE_ENTITY,
      expected: mode,
    },
  }))

  const transformerChildren: ConditionPickerNode[] = transformers.map((transformer) => ({
    kind: 'group',
    id: `cond-outside-${transformer.key}`,
    label: transformer.label,
    children: transformer.controls
      .filter((control) => control.entityIds.length > 0)
      .map((control) =>
        onOffEntityChoice(
          `cond-outside-${control.key}`,
          ['Outside', transformer.label, control.label],
          control.entityIds,
        ),
      ),
  }))

  return {
    kind: 'group',
    id: 'cond-outside',
    label: 'Outside',
    children: [
      { kind: 'group', id: 'cond-outside-mode', label: 'Mode', children: modeChildren },
      ...transformerChildren.filter((n) => n.kind === 'group' && n.children.length > 0),
      {
        kind: 'choice',
        id: 'cond-gate',
        label: 'Gate',
        choices: [
          {
            id: 'cond-gate-open',
            label: 'Open',
            // GATE_CLOSED_SENSOR is on when the gate is fully closed.
            condition: {
              kind: 'entity',
              labels: ['Outside', 'Gate', 'Open'],
              entityIds: [GATE_CLOSED_SENSOR],
              expected: 'off',
            },
          },
          {
            id: 'cond-gate-closed',
            label: 'Closed',
            condition: {
              kind: 'entity',
              labels: ['Outside', 'Gate', 'Closed'],
              entityIds: [GATE_CLOSED_SENSOR],
              expected: 'on',
            },
          },
        ],
      },
      openCloseEntityChoice('cond-detached', ['Outside', 'Detached'], [WORKSHOP_GARAGE.cover]),
      openCloseEntityChoice('cond-main', ['Outside', 'Main'], [MAIN_GARAGE.cover]),
    ],
  }
}

function lightsBranch(lights: CrestronLight[]): ConditionPickerNode {
  const floorChildren: ConditionPickerNode[] = CRESTRON_ROOM_GROUPS.map((floor) => {
    const roomChildren = floor.rooms
      .map((room) => {
        const roomKey = `${floor.id}::${room.id}`
        const roomLights = lights.filter((light) => light.roomKey === roomKey)
        return {
          kind: 'group' as const,
          id: `cond-lights-${roomKey}`,
          label: room.name,
          children: roomLights.map((light) =>
            onOffEntityChoice(
              `cond-light-${light.entityId}`,
              ['Lights', floor.name, room.name, light.name],
              [light.entityId],
            ),
          ),
        }
      })
      .filter((room) => room.children.length > 0)

    return {
      kind: 'group' as const,
      id: `cond-lights-floor-${floor.id}`,
      label: floor.name,
      children: roomChildren,
    }
  }).filter((floor) => floor.children.length > 0)

  return { kind: 'group', id: 'cond-lights', label: 'Lights', children: floorChildren }
}

function poolBranch(states: HaState[]): ConditionPickerNode {
  const lightIds =
    states.length > 0
      ? discoverPoolSamLightEntityIds(states)
      : [...PENTAIR_POOL_SAM_LIGHT_ENTITIES]
  const pumpId =
    states.length > 0 ? discoverPoolCircuitSwitchId(states) : PENTAIR_POOL_CIRCUIT_SWITCH
  return {
    kind: 'group',
    id: 'cond-pool',
    label: 'Pool',
    children: [
      onOffEntityChoice('cond-pool-lights', ['Pool', 'Lights'], lightIds),
      onOffEntityChoice('cond-pool-pump', ['Pool', 'Pump'], [pumpId]),
    ],
  }
}

function pondBranch(states: HaState[]): ConditionPickerNode {
  const fillId = discoverPondFillEntityId(states)
  const ids = fillId ? [fillId] : []
  return {
    kind: 'group',
    id: 'cond-pond',
    label: 'Pond',
    children: ids.length > 0 ? [openCloseEntityChoice('cond-pond-fill', ['Pond', 'Fill'], ids)] : [],
  }
}

function otherBranch(): ConditionPickerNode {
  return {
    kind: 'group',
    id: 'cond-other',
    label: 'Other',
    children: [
      {
        kind: 'group',
        id: 'cond-other-time',
        label: 'Time',
        children: [
          { kind: 'time_entry', id: 'cond-time-before', label: 'Before…', compare: 'before' },
          { kind: 'time_entry', id: 'cond-time-after', label: 'After…', compare: 'after' },
        ],
      },
      sunGroup('sunrise'),
      sunGroup('sunset'),
    ],
  }
}

export function buildDashboardConditionCatalog(
  input: ActionCatalogInput,
): ConditionPickerNode[] {
  const branches: ConditionPickerNode[] = [
    outsideBranch(input.outsideTransformers),
    lightsBranch(input.crestronLights),
    poolBranch(input.states),
    pondBranch(input.states),
    {
      kind: 'group',
      id: 'cond-audio',
      label: 'Audio',
      children: [
        onOffEntityChoice(
          'cond-receiver',
          ['Audio', 'Receiver'],
          [input.receiver.entityId || PREFERRED_RECEIVER_ENTITY_ID],
        ),
      ],
    },
    otherBranch(),
  ]
  return branches.filter((node) => node.kind !== 'group' || node.children.length > 0)
}

export function formatDashboardConditionLabel(
  condition: DashboardCondition | null | undefined,
): string {
  if (!condition || !Array.isArray(condition.labels) || condition.labels.length === 0) {
    return 'None'
  }
  return condition.labels.join(' › ')
}

function normalizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
}

function normalizeTimeString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  const hh = Math.max(0, Math.min(23, Number(match[1])))
  const mm = Math.max(0, Math.min(59, Number(match[2])))
  const ss = match[3] != null ? Math.max(0, Math.min(59, Number(match[3]))) : 0
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function normalizeDashboardCondition(raw: unknown): DashboardCondition | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const labels = normalizeLabels(value.labels)
  const kind = value.kind

  if (kind === 'entity') {
    const entityIds = Array.isArray(value.entityIds)
      ? value.entityIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : []
    const expected = value.expected === 'off' ? 'off' : value.expected === 'on' ? 'on' : null
    if (labels.length === 0 || entityIds.length === 0 || !expected) return null
    return { kind: 'entity', labels, entityIds, expected }
  }

  if (kind === 'select') {
    const entityId = typeof value.entityId === 'string' ? value.entityId.trim() : ''
    const expected = typeof value.expected === 'string' ? value.expected.trim() : ''
    if (labels.length === 0 || !entityId || !expected) return null
    return { kind: 'select', labels, entityId, expected }
  }

  if (kind === 'time') {
    const compare = value.compare === 'before' || value.compare === 'after' ? value.compare : null
    const time = normalizeTimeString(value.time)
    if (labels.length === 0 || !compare || !time) return null
    return { kind: 'time', labels, compare, time }
  }

  if (kind === 'sun') {
    const compare = value.compare === 'before' || value.compare === 'after' ? value.compare : null
    const event = value.event === 'sunrise' || value.event === 'sunset' ? value.event : null
    if (labels.length === 0 || !compare || !event) return null
    const offset = Number(value.offsetHours)
    const offsetHours = Number.isFinite(offset) ? Math.max(-12, Math.min(12, offset)) : 0
    return offsetHours !== 0
      ? { kind: 'sun', labels, compare, event, offsetHours }
      : { kind: 'sun', labels, compare, event }
  }

  return null
}

export function normalizeDrivewayAlarmConditionRows(raw: unknown): DrivewayAlarmConditionRow[] {
  if (!Array.isArray(raw)) return []
  const rows: DrivewayAlarmConditionRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const condition = normalizeDashboardCondition(row.condition)
    if (!condition) continue
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `cond-${rows.length + 1}-${Date.now()}`
    const join: ConditionLogic = row.join === 'or' ? 'or' : 'and'
    rows.push({ id, join, condition })
  }
  return rows
}

export function newConditionRowId(): string {
  return `cond-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Unused import guard helpers for receivers/audio/shade maps in catalog input. */
export type ConditionCatalogExtras = {
  audio: SonosSnapshot
  receiver: ReceiverSnapshot
  shadeEntityMap: ShadeEntityMap
}
