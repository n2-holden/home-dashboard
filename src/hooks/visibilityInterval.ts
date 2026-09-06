/**
 * Run `tick` on an interval only while the page is visible.
 * Clears the timer when hidden and restarts (with an immediate tick) on resume.
 * Helps long-lived iPad / HA Companion kiosk WebViews stay responsive.
 */
export function startVisibilityInterval(tick: () => void, ms: number): () => void {
  let id: number | undefined

  const clear = () => {
    if (id != null) {
      window.clearInterval(id)
      id = undefined
    }
  }

  const start = () => {
    clear()
    id = window.setInterval(() => {
      if (!document.hidden) tick()
    }, ms)
  }

  const onVisibility = () => {
    if (document.hidden) {
      clear()
      return
    }
    tick()
    start()
  }

  if (!document.hidden) start()
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    clear()
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
