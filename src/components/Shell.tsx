import { Link, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useHouse } from '../data/HouseContext'

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function Shell() {
  const [now, setNow] = useState(() => new Date())
  const { connectionStatus, readOnly } = useHouse()

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="brand">
          Home<span>.</span>
        </p>
        <div className="header-meta">
          {readOnly ? (
            <span className="view-only-badge" title="This link is view-only — controls are disabled">
              View only
            </span>
          ) : (
            <Link className="settings-link" to="/settings">
              {connectionStatus === 'connected' ? 'Connected' : 'Settings'}
            </Link>
          )}
          <time className="clock" dateTime={now.toISOString()}>
            {formatClock(now)}
          </time>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
