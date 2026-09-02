declare global {
  interface Window {
    __DASHBOARD_READONLY__?: boolean
  }
}

/** True when loaded via view.html (viewer URL) — controls are display-only. */
export function isReadOnlyDashboard(): boolean {
  if (typeof window === 'undefined') return false
  if (window.__DASHBOARD_READONLY__) return true
  return /(?:^|\/)view\.html$/i.test(window.location.pathname)
}
