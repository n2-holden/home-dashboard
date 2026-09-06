import { useEffect } from 'react'

/** Soft-reload the SPA so long-running iPad HA Companion kiosk WebViews don't freeze input. */
const RELOAD_EVERY_MS = 60 * 60 * 1000
/** If the WebView was backgrounded this long, reload on resume. */
const HIDDEN_BEFORE_RELOAD_MS = 30 * 60 * 1000

export function useKioskSoftReload() {
  useEffect(() => {
    let hiddenAt: number | null = document.hidden ? Date.now() : null

    const reloadTimer = window.setTimeout(() => {
      window.location.reload()
    }, RELOAD_EVERY_MS)

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt != null && Date.now() - hiddenAt >= HIDDEN_BEFORE_RELOAD_MS) {
        window.location.reload()
        return
      }
      hiddenAt = null
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(reloadTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
