import { Link } from 'react-router-dom'
import { ControlLogPanel } from '../components/ControlLogPanel'

export function ControlLogPage() {
  return (
    <main>
      <Link className="back-link" to="/settings?tab=log">
        ← Settings
      </Link>
      <header className="page-header">
        <h1>Control log</h1>
        <p>Device commands from the dashboard and Home Assistant automations</p>
      </header>
      <ControlLogPanel />
    </main>
  )
}
