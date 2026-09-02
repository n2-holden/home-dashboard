import type { HaState } from './positions'

export type CrestronScene = {
  entityId: string
  label: string
}

export const CRESTRON_SCENE_ENTITY_IDS = [
  'scene.crestron_home_processor_guest_entry',
  'scene.crestron_home_processor_games',
  'scene.crestron_home_processor_sleep',
  'scene.crestron_home_processor_all_off',
] as const

const SCENE_DEFINITIONS: CrestronScene[] = [
  {
    entityId: 'scene.crestron_home_processor_guest_entry',
    label: 'Guest',
  },
  {
    entityId: 'scene.crestron_home_processor_games',
    label: 'Games',
  },
  {
    entityId: 'scene.crestron_home_processor_sleep',
    label: 'Sleep',
  },
  {
    entityId: 'scene.crestron_home_processor_all_off',
    label: 'All off',
  },
]

export function crestronScenesFromStates(states: HaState[]): CrestronScene[] {
  const available = new Set(states.map((state) => state.entity_id))
  return SCENE_DEFINITIONS.filter((scene) => available.has(scene.entityId))
}
