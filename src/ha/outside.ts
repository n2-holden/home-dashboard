import type { HaState } from './positions'

export const OUTSIDE_LIGHTS_MODE_ENTITY = 'input_select.outside_lights_mode'
export const OUTSIDE_MODES = ['None', 'Normal', 'Guest'] as const
export type OutsideMode = (typeof OUTSIDE_MODES)[number]

export type OutsideTransformerKey = 'driveway' | 'pond'
export type OutsideControlKey =
  | 'gateSign'
  | 'westDrivewayLight'
  | 'westDrivewayLights'
  | 'westCourtyardLights'
  | 'pondLights'
  | 'pondGardenLights'

export type OutsideTransformer = {
  key: OutsideTransformerKey
  label: string
  controls: OutsideControl[]
}

export type OutsideControl = {
  key: OutsideControlKey
  label: string
  entityId: string | null
  entityIds: string[]
  domain: 'switch' | 'light'
  on: boolean | null
}

const TRANSFORMER_DEFINITIONS: Array<{
  key: OutsideTransformerKey
  label: string
  controls: Array<{
    key: OutsideControlKey
    label: string
    switchNumber?: 1 | 2
    entityId?: string
    entityIds?: string[]
    matches: (text: string) => boolean
  }>
}> = [
  {
    key: 'driveway',
    label: 'Driveway',
    controls: [
      {
        key: 'gateSign',
        label: 'Sign',
        entityId: 'switch.gate_switch_2',
        matches: (text) => text.includes('sign'),
      },
      {
        key: 'westDrivewayLight',
        label: 'Lower Driveway',
        entityId: 'light.driveway_lights_light_1',
        matches: (text) => text.includes('driveway') && text.includes('light'),
      },
      {
        key: 'westDrivewayLights',
        label: 'Upper Driveway',
        entityIds: ['switch.gate_switch_1', 'switch.west_side_switch_1'],
        matches: (text) => text.includes('driveway'),
      },
      {
        key: 'westCourtyardLights',
        label: 'Courtyard lights',
        entityId: 'switch.west_side_switch_2',
        matches: (text) => text.includes('courtyard'),
      },
    ],
  },
  {
    key: 'pond',
    label: 'Pond',
    controls: [
      {
        key: 'pondLights',
        label: 'Pond',
        entityId: 'switch.pond_switch_2',
        matches: (text) => text.includes('pond') && text.includes('light'),
      },
      {
        key: 'pondGardenLights',
        label: 'Garden',
        entityId: 'switch.pond_switch_1',
        matches: (text) => text.includes('garden') && text.includes('light'),
      },
    ],
  },
]

export function outsideTransformersFromStates(states: HaState[]): OutsideTransformer[] {
  const controllables = states.filter(
    (state) => state.entity_id.startsWith('switch.') || state.entity_id.startsWith('light.'),
  )

  return TRANSFORMER_DEFINITIONS.map((definition) => {
    return {
      key: definition.key,
      label: definition.label,
      controls: definition.controls.map((control) => {
        const expectedEntityIds = control.entityIds ?? (control.entityId ? [control.entityId] : [])
        const matchedStates = expectedEntityIds
          .map((entityId) => controllables.find((candidate) => candidate.entity_id === entityId))
          .filter((state): state is HaState => state != null)
        const expectedEntityId = expectedEntityIds[0] ?? ''
        const fallbackState =
          matchedStates.length === expectedEntityIds.length && matchedStates.length > 0
            ? matchedStates[0]
            : controllables
          .map((candidate) => ({
            candidate,
            text: `${candidate.entity_id} ${String(candidate.attributes.friendly_name ?? '')}`.toLowerCase(),
          }))
          .filter(({ text }) => control.matches(text))
          .sort(
            (a, b) =>
              matchScore(b.text, expectedEntityId) - matchScore(a.text, expectedEntityId),
          )[0]?.candidate
        const resolvedEntityIds =
          matchedStates.length === expectedEntityIds.length && matchedStates.length > 0
            ? expectedEntityIds
            : fallbackState
              ? [fallbackState.entity_id]
              : []
        const combinedState =
          matchedStates.length === expectedEntityIds.length && matchedStates.length > 0
            ? combinedSwitchState(matchedStates)
            : fallbackState
              ? switchState(fallbackState)
              : null

        return {
          key: control.key,
          label: control.label,
          entityId: resolvedEntityIds[0] ?? null,
          entityIds: resolvedEntityIds,
          domain: expectedEntityId.startsWith('light.') ? 'light' : 'switch',
          on: combinedState,
        }
      }),
    }
  })
}

function matchScore(text: string, expectedEntityId: string): number {
  let score = 0
  if (text.includes(expectedEntityId)) score += 3
  if (text.includes('transformer')) score += 1
  return score
}

function switchState(state: HaState): boolean | null {
  if (state.state === 'on') return true
  if (state.state === 'off') return false
  return null
}

function combinedSwitchState(states: HaState[]): boolean | null {
  const values = states.map(switchState)
  if (values.some((value) => value == null)) return null
  return values.every((value) => value === true)
}

export function outsideModeFromStates(states: HaState[]): OutsideMode {
  const mode = states.find((state) => state.entity_id === OUTSIDE_LIGHTS_MODE_ENTITY)?.state
  return OUTSIDE_MODES.includes(mode as OutsideMode) ? (mode as OutsideMode) : 'None'
}
