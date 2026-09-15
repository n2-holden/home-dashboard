import { useCallback, useEffect, useRef } from 'react'

type Options = {
  /** Delay before repeating starts. */
  delayMs?: number
  /** Interval between repeats while held. */
  intervalMs?: number
}

/**
 * Press-and-hold: fire once on down, then repeat after a short delay.
 * Bind the returned handlers to mouse and touch events on a button.
 */
export function useRepeatingPress(action: () => void, options?: Options) {
  const delayMs = options?.delayMs ?? 400
  const intervalMs = options?.intervalMs ?? 120
  const actionRef = useRef(action)
  actionRef.current = action
  const delayId = useRef<number | null>(null)
  const intervalId = useRef<number | null>(null)
  const active = useRef(false)

  const clear = useCallback(() => {
    active.current = false
    if (delayId.current != null) {
      window.clearTimeout(delayId.current)
      delayId.current = null
    }
    if (intervalId.current != null) {
      window.clearInterval(intervalId.current)
      intervalId.current = null
    }
  }, [])

  useEffect(() => clear, [clear])

  const start = useCallback(() => {
    if (active.current) return
    active.current = true
    actionRef.current()
    delayId.current = window.setTimeout(() => {
      intervalId.current = window.setInterval(() => {
        actionRef.current()
      }, intervalMs)
    }, delayMs)
  }, [delayMs, intervalMs])

  return {
    onMouseDown: (event: React.MouseEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      start()
    },
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: (event: React.TouchEvent) => {
      event.preventDefault()
      start()
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
  }
}
