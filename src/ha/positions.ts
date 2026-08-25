/** Dashboard: 0 = open, 100 = closed. Home Assistant covers: 0 = closed, 100 = open. */

export function haPositionToClosedPercent(haPosition: number): number {
  return clamp(100 - Math.round(haPosition))
}

export function closedPercentToHaPosition(closedPercent: number): number {
  return clamp(100 - Math.round(closedPercent))
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export type HaState = {
  entity_id: string
  state: string
  attributes: {
    friendly_name?: string
    current_position?: number
    [key: string]: unknown
  }
}

export type HaCover = {
  entityId: string
  name: string
  state: string
  /** HA current_position if present (0 closed … 100 open) */
  haPosition: number | null
  /** Dashboard % closed — always set when state or position is known */
  closedPercent: number | null
}

export function coverFromState(state: HaState): HaCover {
  const raw = state.attributes.current_position
  const haPosition = typeof raw === 'number' ? raw : null

  let closedPercent: number | null = null
  if (haPosition != null) {
    closedPercent = haPositionToClosedPercent(haPosition)
  } else if (state.state === 'closed') {
    closedPercent = 100
  } else if (state.state === 'open') {
    closedPercent = 0
  } else if (state.state === 'opening') {
    closedPercent = 50
  } else if (state.state === 'closing') {
    closedPercent = 50
  }

  return {
    entityId: state.entity_id,
    name: state.attributes.friendly_name ?? state.entity_id,
    state: state.state,
    haPosition,
    closedPercent,
  }
}

/** Binary/ternary status for UI boxes. */
export type ShadeVisualStatus = 'open' | 'partial' | 'closed'

export function shadeVisualStatus(
  closedPercent: number,
  coverState?: string | null,
): ShadeVisualStatus {
  if (coverState === 'closed') return 'closed'
  if (coverState === 'open') return 'open'
  if (closedPercent >= 90) return 'closed'
  if (closedPercent <= 10) return 'open'
  return 'partial'
}
