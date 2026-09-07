import { useCallback, useEffect, useState } from 'react'
import {
  PENDING_TOGGLE_GIVE_UP_MS,
  giveUpPendingToggles,
  reconcilePendingToggles,
  type PendingToggle,
} from '../ha/pendingToggle'

export function usePendingToggles<TKey extends string>(options?: { giveUpMs?: number }) {
  const giveUpMs = options?.giveUpMs ?? PENDING_TOGGLE_GIVE_UP_MS
  const [pendingByKey, setPendingByKey] = useState<Record<TKey, PendingToggle>>(
    () => ({} as Record<TKey, PendingToggle>),
  )

  const startPending = useCallback((key: TKey, desiredOn: boolean) => {
    setPendingByKey((current) => ({
      ...current,
      [key]: { desiredOn, requestedAt: Date.now() },
    }))
  }, [])

  const clearPending = useCallback((key: TKey) => {
    setPendingByKey((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [])

  const reconcile = useCallback((actualByKey: Partial<Record<TKey, boolean | null>>) => {
    setPendingByKey((current) => reconcilePendingToggles(current, actualByKey))
  }, [])

  useEffect(() => {
    if (Object.keys(pendingByKey).length === 0) return
    const id = window.setInterval(() => {
      setPendingByKey((current) => giveUpPendingToggles(current, Date.now(), giveUpMs))
    }, 250)
    return () => window.clearInterval(id)
  }, [giveUpMs, pendingByKey])

  return { pendingByKey, startPending, clearPending, reconcile }
}
