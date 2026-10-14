import { GATE_RELAY_BUTTON } from './gate'
import { MAIN_GARAGE, WORKSHOP_GARAGE } from './garage'
import type { CrestronLight } from './lights'
import { CRESTRON_ROOM_GROUPS } from './lights'
import {
  OUTSIDE_LIGHTS_MODE_ENTITY,
  OUTSIDE_MODES,
  type OutsideMode,
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
import { PREFERRED_RECEIVER_ENTITY_ID } from './receiver'
import type { CrestronScene } from './scenes'
import type { ReceiverSnapshot } from './receiver'
import type { SonosSnapshot } from './sonos'
import { sonosStopTargets } from './sonos'
import type { ShadeEntityMap } from './storage'

/** One HA service call resolved at pick-time (or by the HA runner for named actions). */
export type DashboardServiceOp = {
  domain: string
  service: string
  entityIds: string[]
  data?: Record<string, unknown>
}

/**
 * Named actions the HA runner resolves when entities are discovered at runtime
 * (pond fill valve, etc.).
 */
export type DashboardNamedAction =
  | 'pond_fill_open'
  | 'pond_fill_close'
  | 'pool_lights_on'
  | 'pool_lights_off'
  | 'pool_pump_on'
  | 'sonos_stop_all'

export type DashboardActionSelection = {
  labels: string[]
  ops: DashboardServiceOp[]
  named?: DashboardNamedAction
}

export type ActionPickerNode =
  | { kind: 'group'; id: string; label: string; children: ActionPickerNode[] }
  | { kind: 'leaf'; id: string; label: string; action: DashboardActionSelection }
  | {
      kind: 'choice'
      id: string
      label: string
      choices: Array<{
        id: string
        label: string
        action: DashboardActionSelection
        /** When true, picker offers optional brightness before confirming On. */
        brightnessConfigurable?: boolean
      }>
    }

export type ActionCatalogInput = {
  states: HaState[]
  outsideTransformers: OutsideTransformer[]
  crestronLights: CrestronLight[]
  crestronScenes: CrestronScene[]
  audio: SonosSnapshot
  receiver: ReceiverSnapshot
  shadeEntityMap: ShadeEntityMap
}

function onOffChoice(
  id: string,
  labels: string[],
  domain: 'switch' | 'light' | 'fan' | 'media_player',
  entityIds: string[],
  options?: { dimmable?: boolean },
): ActionPickerNode {
  const ids = entityIds.filter(Boolean)
  const dimmable = Boolean(options?.dimmable && domain === 'light' && ids.length > 0)
  return {
    kind: 'choice',
    id,
    label: labels[labels.length - 1] ?? id,
    choices: [
      {
        id: `${id}:on`,
        label: 'On',
        action: {
          labels: [...labels, 'On'],
          ops: [{ domain, service: 'turn_on', entityIds: ids }],
        },
        ...(dimmable ? { brightnessConfigurable: true } : {}),
      },
      {
        id: `${id}:off`,
        label: 'Off',
        action: {
          labels: [...labels, 'Off'],
          ops: [{ domain, service: 'turn_off', entityIds: ids }],
        },
      },
    ],
  }
}

function openCloseCoverChoice(
  id: string,
  labels: string[],
  entityId: string,
): ActionPickerNode {
  return {
    kind: 'choice',
    id,
    label: labels[labels.length - 1] ?? id,
    choices: [
      {
        id: `${id}:open`,
        label: 'Open',
        action: {
          labels: [...labels, 'Open'],
          ops: [{ domain: 'cover', service: 'open_cover', entityIds: [entityId] }],
        },
      },
      {
        id: `${id}:close`,
        label: 'Close',
        action: {
          labels: [...labels, 'Close'],
          ops: [{ domain: 'cover', service: 'close_cover', entityIds: [entityId] }],
        },
      },
    ],
  }
}

function outsideBranch(transformers: OutsideTransformer[]): ActionPickerNode {
  const modeChildren: ActionPickerNode[] = OUTSIDE_MODES.map((mode) => ({
    kind: 'leaf',
    id: `outside-mode-${mode}`,
    label: mode,
    action: {
      labels: ['Outside', 'Mode', mode],
      ops: [
        {
          domain: 'input_select',
          service: 'select_option',
          entityIds: [OUTSIDE_LIGHTS_MODE_ENTITY],
          data: { option: mode as OutsideMode },
        },
      ],
    },
  }))

  const transformerChildren: ActionPickerNode[] = transformers.map((transformer) => ({
    kind: 'group',
    id: `outside-${transformer.key}`,
    label: transformer.label,
    children: transformer.controls
      .filter((control) => control.entityIds.length > 0)
      .map((control) =>
        onOffChoice(
          `outside-${control.key}`,
          ['Outside', transformer.label, control.label],
          control.domain,
          control.entityIds,
          { dimmable: control.dimmable },
        ),
      ),
  }))

  const accessChildren: ActionPickerNode[] = [
    {
      kind: 'group',
      id: 'outside-gate',
      label: 'Gate',
      children: [
        {
          kind: 'leaf',
          id: 'outside-gate-open',
          label: 'Open',
          action: {
            labels: ['Outside', 'Gate', 'Open'],
            ops: [{ domain: 'button', service: 'press', entityIds: [GATE_RELAY_BUTTON] }],
          },
        },
      ],
    },
    openCloseCoverChoice('outside-detached', ['Outside', 'Detached'], WORKSHOP_GARAGE.cover),
    openCloseCoverChoice('outside-main', ['Outside', 'Main'], MAIN_GARAGE.cover),
  ]

  return {
    kind: 'group',
    id: 'outside',
    label: 'Outside',
    children: [
      { kind: 'group', id: 'outside-mode', label: 'Mode', children: modeChildren },
      ...transformerChildren.filter((node) => node.kind === 'group' && node.children.length > 0),
      ...accessChildren,
    ],
  }
}

function lightsBranch(lights: CrestronLight[], scenes: CrestronScene[]): ActionPickerNode {
  const sceneChildren: ActionPickerNode[] = scenes.map((scene) => ({
    kind: 'leaf',
    id: `scene-${scene.entityId}`,
    label: scene.label,
    action: {
      labels: ['Lights', 'Scenes', scene.label],
      ops: [{ domain: 'scene', service: 'turn_on', entityIds: [scene.entityId] }],
    },
  }))

  const floorChildren: ActionPickerNode[] = CRESTRON_ROOM_GROUPS.map((floor) => {
    const roomChildren: ActionPickerNode[] = floor.rooms.map((room) => {
      const roomKey = `${floor.id}::${room.id}`
      const roomLights = lights.filter((light) => light.roomKey === roomKey)
      return {
        kind: 'group' as const,
        id: `lights-${roomKey}`,
        label: room.name,
        children: roomLights.map((light) =>
          onOffChoice(
            `light-${light.entityId}`,
            ['Lights', floor.name, room.name, light.name],
            light.domain === 'fan' ? 'fan' : light.domain === 'switch' ? 'switch' : 'light',
            [light.entityId],
            { dimmable: light.dimmable },
          ),
        ),
      }
    }).filter((room) => room.children.length > 0)

    return {
      kind: 'group' as const,
      id: `lights-floor-${floor.id}`,
      label: floor.name,
      children: roomChildren,
    }
  }).filter((floor) => floor.children.length > 0)

  const unassigned = lights.filter((light) => light.roomKey === 'unassigned')
  if (unassigned.length > 0) {
    floorChildren.push({
      kind: 'group',
      id: 'lights-floor-unassigned',
      label: 'Unassigned',
      children: unassigned.map((light) =>
        onOffChoice(
          `light-${light.entityId}`,
          ['Lights', 'Unassigned', light.name],
          light.domain === 'fan' ? 'fan' : light.domain === 'switch' ? 'switch' : 'light',
          [light.entityId],
          { dimmable: light.dimmable },
        ),
      ),
    })
  }

  const children: ActionPickerNode[] = []
  if (sceneChildren.length > 0) {
    children.push({ kind: 'group', id: 'lights-scenes', label: 'Scenes', children: sceneChildren })
  }
  children.push(...floorChildren)

  return { kind: 'group', id: 'lights', label: 'Lights', children }
}

function poolBranch(states: HaState[]): ActionPickerNode {
  const lightIds =
    states.length > 0
      ? discoverPoolSamLightEntityIds(states)
      : [...PENTAIR_POOL_SAM_LIGHT_ENTITIES]
  const pumpId =
    states.length > 0 ? discoverPoolCircuitSwitchId(states) : PENTAIR_POOL_CIRCUIT_SWITCH

  return {
    kind: 'group',
    id: 'pool',
    label: 'Pool',
    children: [
      {
        kind: 'choice',
        id: 'pool-lights',
        label: 'Lights',
        choices: [
          {
            id: 'pool-lights-on',
            label: 'On',
            action: {
              labels: ['Pool', 'Lights', 'On'],
              ops:
                lightIds.length > 0
                  ? [{ domain: 'light', service: 'turn_on', entityIds: lightIds }]
                  : [],
              named: 'pool_lights_on',
            },
          },
          {
            id: 'pool-lights-off',
            label: 'Off',
            action: {
              labels: ['Pool', 'Lights', 'Off'],
              ops:
                lightIds.length > 0
                  ? [{ domain: 'light', service: 'turn_off', entityIds: lightIds }]
                  : [],
              named: 'pool_lights_off',
            },
          },
        ],
      },
      {
        kind: 'leaf',
        id: 'pool-pump-on',
        label: 'Turn pump on',
        action: {
          labels: ['Pool', 'Turn pump on'],
          ops: [{ domain: 'switch', service: 'turn_on', entityIds: [pumpId] }],
          named: 'pool_pump_on',
        },
      },
    ],
  }
}

function pondBranch(states: HaState[]): ActionPickerNode {
  const fillId = discoverPondFillEntityId(states)
  const openOps: DashboardServiceOp[] = []
  const closeOps: DashboardServiceOp[] = []
  if (fillId?.startsWith('valve.')) {
    openOps.push({ domain: 'valve', service: 'open_valve', entityIds: [fillId] })
    closeOps.push({ domain: 'valve', service: 'close_valve', entityIds: [fillId] })
  } else if (fillId) {
    openOps.push({ domain: 'switch', service: 'turn_on', entityIds: [fillId] })
    closeOps.push({ domain: 'switch', service: 'turn_off', entityIds: [fillId] })
  }

  return {
    kind: 'group',
    id: 'pond',
    label: 'Pond',
    children: [
      {
        kind: 'choice',
        id: 'pond-fill',
        label: 'Fill',
        choices: [
          {
            id: 'pond-fill-open',
            label: 'Open',
            action: {
              labels: ['Pond', 'Fill', 'Open'],
              ops: openOps,
              named: 'pond_fill_open',
            },
          },
          {
            id: 'pond-fill-close',
            label: 'Close',
            action: {
              labels: ['Pond', 'Fill', 'Close'],
              ops: closeOps,
              named: 'pond_fill_close',
            },
          },
        ],
      },
    ],
  }
}

function audioBranch(audio: SonosSnapshot, receiver: ReceiverSnapshot): ActionPickerNode {
  const receiverId = receiver.entityId || PREFERRED_RECEIVER_ENTITY_ID
  const stopTargets = sonosStopTargets(audio)
  return {
    kind: 'group',
    id: 'audio',
    label: 'Audio',
    children: [
      onOffChoice('receiver', ['Audio', 'Receiver'], 'media_player', [receiverId]),
      {
        kind: 'leaf',
        id: 'sonos-stop-all',
        label: 'Stop all Sonos',
        action: {
          labels: ['Audio', 'Stop all Sonos'],
          ops:
            stopTargets.length > 0
              ? [{ domain: 'media_player', service: 'media_stop', entityIds: stopTargets }]
              : [],
          named: 'sonos_stop_all',
        },
      },
    ],
  }
}

function shadesBranch(shadeEntityMap: ShadeEntityMap): ActionPickerNode {
  const entityIds = Object.values(shadeEntityMap).filter(
    (id): id is string => typeof id === 'string' && id.startsWith('cover.'),
  )
  if (entityIds.length === 0) {
    return { kind: 'group', id: 'shades', label: 'Shades', children: [] }
  }
  return {
    kind: 'group',
    id: 'shades',
    label: 'Shades',
    children: [
      {
        kind: 'leaf',
        id: 'shades-open-all',
        label: 'Open all',
        action: {
          labels: ['Shades', 'Open all'],
          ops: [{ domain: 'cover', service: 'open_cover', entityIds }],
        },
      },
      {
        kind: 'leaf',
        id: 'shades-close-all',
        label: 'Close all',
        action: {
          labels: ['Shades', 'Close all'],
          ops: [{ domain: 'cover', service: 'close_cover', entityIds }],
        },
      },
    ],
  }
}

/** Build the full drill-down catalog of dashboard controls. */
export function buildDashboardActionCatalog(input: ActionCatalogInput): ActionPickerNode[] {
  const branches = [
    outsideBranch(input.outsideTransformers),
    lightsBranch(input.crestronLights, input.crestronScenes),
    poolBranch(input.states),
    pondBranch(input.states),
    audioBranch(input.audio, input.receiver),
    shadesBranch(input.shadeEntityMap),
  ]
  return branches.filter((node) => node.kind !== 'group' || node.children.length > 0)
}

export function formatDashboardActionLabel(
  action: DashboardActionSelection | null | undefined,
): string {
  if (!action || !Array.isArray(action.labels) || action.labels.length === 0) return 'None'
  const base = action.labels.join(' › ')
  const brightnessPct = action.ops
    .map((op) => op.data?.brightness_pct)
    .find((value): value is number => typeof value === 'number')
  if (brightnessPct != null) {
    return `${base} · ${Math.round(brightnessPct)}%`
  }
  const brightness = action.ops
    .map((op) => op.data?.brightness)
    .find((value): value is number => typeof value === 'number')
  if (brightness != null) {
    return `${base} · ${Math.round((brightness / 255) * 100)}%`
  }
  return base
}

/** Apply optional brightness_pct onto a light turn_on action. */
export function withLightBrightnessPct(
  action: DashboardActionSelection,
  brightnessPct: number,
): DashboardActionSelection {
  const pct = Math.max(1, Math.min(100, Math.round(brightnessPct)))
  const labels = action.labels.filter((label) => !/^\d+%$/.test(label))
  if (!labels.includes(`${pct}%`)) labels.push(`${pct}%`)
  return {
    ...action,
    labels,
    ops: action.ops.map((op) => {
      if (op.domain !== 'light' || op.service !== 'turn_on') return op
      return {
        ...op,
        data: { ...(op.data ?? {}), brightness_pct: pct },
      }
    }),
  }
}

function normalizeOp(raw: unknown): DashboardServiceOp | null {
  if (!raw || typeof raw !== 'object') return null
  const op = raw as Record<string, unknown>
  const domain = typeof op.domain === 'string' ? op.domain.trim() : ''
  const service = typeof op.service === 'string' ? op.service.trim() : ''
  if (!domain || !service) return null
  const entityIds = Array.isArray(op.entityIds)
    ? op.entityIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : typeof op.entity_id === 'string'
      ? [op.entity_id]
      : Array.isArray(op.entity_id)
        ? op.entity_id.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : []
  const data =
    op.data && typeof op.data === 'object' && !Array.isArray(op.data)
      ? (op.data as Record<string, unknown>)
      : undefined
  return { domain, service, entityIds, ...(data ? { data } : {}) }
}

const NAMED_ACTIONS = new Set<DashboardNamedAction>([
  'pond_fill_open',
  'pond_fill_close',
  'pool_lights_on',
  'pool_lights_off',
  'pool_pump_on',
  'sonos_stop_all',
])

export function normalizeDashboardAction(
  raw: unknown,
): DashboardActionSelection | null {
  if (raw == null) return null
  if (typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const labels = Array.isArray(value.labels)
    ? value.labels.filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
    : []
  const ops = Array.isArray(value.ops)
    ? value.ops.map(normalizeOp).filter((op): op is DashboardServiceOp => op != null)
    : []
  const named =
    typeof value.named === 'string' && NAMED_ACTIONS.has(value.named as DashboardNamedAction)
      ? (value.named as DashboardNamedAction)
      : undefined
  if (labels.length === 0) return null
  if (ops.length === 0 && !named) return null
  return { labels, ops, ...(named ? { named } : {}) }
}

export function normalizeDashboardActionList(raw: unknown): DashboardActionSelection[] {
  if (Array.isArray(raw)) {
    return raw
      .map(normalizeDashboardAction)
      .filter((action): action is DashboardActionSelection => action != null)
  }
  const single = normalizeDashboardAction(raw)
  return single ? [single] : []
}

/** Fix media_player On/Off — HA uses turn_on/turn_off on media_player domain. */
export function actionHasExecutableWork(action: DashboardActionSelection | null): boolean {
  if (!action) return false
  return Boolean(action.named) || action.ops.some((op) => op.entityIds.length > 0 || op.domain === 'input_select')
}

/** Resolve named actions to concrete service ops using live HA state. */
export function resolveNamedDashboardAction(
  named: DashboardNamedAction,
  states: HaState[],
  audio: SonosSnapshot = { units: [], anyPlaying: false, playingUnits: [] },
): DashboardServiceOp[] {
  if (named === 'pond_fill_open') {
    const entityId = discoverPondFillEntityId(states)
    if (!entityId) return []
    if (entityId.startsWith('valve.')) {
      return [{ domain: 'valve', service: 'open_valve', entityIds: [entityId] }]
    }
    return [{ domain: 'switch', service: 'turn_on', entityIds: [entityId] }]
  }
  if (named === 'pond_fill_close') {
    const entityId = discoverPondFillEntityId(states)
    if (!entityId) return []
    if (entityId.startsWith('valve.')) {
      return [{ domain: 'valve', service: 'close_valve', entityIds: [entityId] }]
    }
    return [{ domain: 'switch', service: 'turn_off', entityIds: [entityId] }]
  }
  if (named === 'pool_lights_on') {
    return [
      {
        domain: 'light',
        service: 'turn_on',
        entityIds: discoverPoolSamLightEntityIds(states),
      },
    ]
  }
  if (named === 'pool_lights_off') {
    return [
      {
        domain: 'light',
        service: 'turn_off',
        entityIds: discoverPoolSamLightEntityIds(states),
      },
    ]
  }
  if (named === 'pool_pump_on') {
    return [
      {
        domain: 'switch',
        service: 'turn_on',
        entityIds: [discoverPoolCircuitSwitchId(states)],
      },
    ]
  }
  if (named === 'sonos_stop_all') {
    const targets = sonosStopTargets(audio)
    if (targets.length === 0) return []
    return [{ domain: 'media_player', service: 'media_stop', entityIds: targets }]
  }
  return []
}

export type DashboardActionRunner = {
  callService: (
    domain: string,
    service: string,
    entityIds?: string[],
    data?: Record<string, unknown>,
  ) => Promise<void>
}

/** Execute one saved action (resolving named actions when needed). */
export async function runDashboardActionSelection(
  runner: DashboardActionRunner,
  action: DashboardActionSelection,
  states: HaState[],
  audio?: SonosSnapshot,
): Promise<void> {
  const ops =
    action.named != null
      ? resolveNamedDashboardAction(action.named, states, audio)
      : action.ops
  for (const op of ops) {
    await runner.callService(op.domain, op.service, op.entityIds, op.data)
  }
}

export async function runDashboardActionList(
  runner: DashboardActionRunner,
  actions: DashboardActionSelection[],
  states: HaState[],
  audio?: SonosSnapshot,
): Promise<void> {
  for (const action of actions) {
    await runDashboardActionSelection(runner, action, states, audio)
  }
}
