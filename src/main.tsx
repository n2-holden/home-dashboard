import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { HouseProvider } from './data/HouseContext'
import './index.css'

// HashRouter: Home Assistant's /local static server has no SPA fallback,
// so path-based routes like /shades would 404 on refresh.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <HouseProvider>
        <App />
      </HouseProvider>
    </HashRouter>
  </StrictMode>,
)
