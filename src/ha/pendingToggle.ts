export type PendingToggle = {
  desiredOn: boolean
  requestedAt: number
}

/** Only give up waiting for HA confirmation after this long (safety valve). */
export const PENDING_TOGGLE_GIVE_UP_MS = 45_000

/** Ignore very fast HA echoes that still reflect the previous state. */
export const PENDING_TOGGLE_MIN_CONFIRM_MS = 300

/** Poll interval after sending a toggle command. */
export const PENDING_TOGGLE_POLL_MS = 800

/** Stop polling for confirmation after this long. */
export const PENDING_TOGGLE_POLL_MAX_MS = 20_000

/** Kasa shed grid relay can take several seconds to report in Home Assistant. */
export const SHED_POWER_TOGGLE_INITIAL_DELAY_MS = 8_000

/** Poll interval while waiting for shed grid state after the initial delay. */
export const SHED_POWER_TOGGLE_POLL_MS = 1_500

/** Keep polling shed grid state for this long after the initial delay. */
export const SHED_POWER_TOGGLE_POLL_MAX_MS = 30_000

export function displayToggleState(
  actualOn: boolean | null,
  pending: PendingToggle | null,
): { checked: boolean; unavailable: boolean } {
  if (pending) return { checked: pending.desiredOn, unavailable: false }
  return { checked: actualOn === true, unavailable: actualOn == null }
}

export function reconcilePendingToggles<TKey extends string>(
  pending: Record<TKey, PendingToggle>,
  actualByKey: Partial<Record<TKey, boolean | null>>,
  now = Date.now(),
): Record<TKey, PendingToggle> {
  let changed = false
  const next = { ...pending }

  for (const key of Object.keys(pending) as TKey[]) {
    const request = pending[key]
    if (!request) continue
    const elapsed = now - request.requestedAt
    const actual = actualByKey[key]
    const confirmed = actual === request.desiredOn && elapsed >= PENDING_TOGGLE_MIN_CONFIRM_MS
    if (confirmed) {
      delete next[key]
      changed = true
    }
  }

  return changed ? next : pending
}

export function giveUpPendingToggles<TKey extends string>(
  pending: Record<TKey, PendingToggle>,
  now = Date.now(),
): Record<TKey, PendingToggle> {
  let changed = false
  const next = { ...pending }

  for (const key of Object.keys(pending) as TKey[]) {
    const request = pending[key]
    if (!request) continue
    if (now - request.requestedAt >= PENDING_TOGGLE_GIVE_UP_MS) {
      delete next[key]
      changed = true
    }
  }

  return changed ? next : pending
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function entityIsOn(states: { entity_id: string; state: string }[], entityId: string): boolean | null {
  const state = states.find((entry) => entry.entity_id === entityId)
  if (!state) return null
  if (state.state === 'on') return true
  if (state.state === 'off') return false
  return null
}

export function entitiesCombinedOn(
  states: { entity_id: string; state: string }[],
  entityIds: string[],
): boolean | null {
  if (entityIds.length === 0) return null
  const values = entityIds.map((entityId) => entityIsOn(states, entityId))
  if (values.some((value) => value == null)) return null
  return values.every((value) => value === true)
}
