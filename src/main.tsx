import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { HouseProvider } from './data/HouseContext'
import './index.css'

declare global {
  interface Window {
    __DASHBOARD_START__?: string
  }
}

// HashRouter: Home Assistant's /local static server has no SPA fallback,
// so path-based routes like /shades would 404 on refresh.

// mini.html sets __DASHBOARD_START__ so the phone bookmark lands on Mini Dash.
if (typeof window !== 'undefined' && window.__DASHBOARD_START__ === 'mini') {
  const hash = window.location.hash.replace(/^#/, '') || '/'
  if (hash === '/' || hash === '') {
    window.location.hash = '#/mini'
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <HouseProvider>
        <App />
      </HouseProvider>
    </HashRouter>
  </StrictMode>,
)
