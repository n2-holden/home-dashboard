import { useCallback, useEffect, useState } from 'react'
import {
  giveUpPendingToggles,
  reconcilePendingToggles,
  type PendingToggle,
} from '../ha/pendingToggle'

export function usePendingToggles<TKey extends string>() {
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
      setPendingByKey((current) => giveUpPendingToggles(current))
    }, 1000)
    return () => window.clearInterval(id)
  }, [pendingByKey])

  return { pendingByKey, startPending, clearPending, reconcile }
}
