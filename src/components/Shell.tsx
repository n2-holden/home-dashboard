import { Link, Outlet } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'

function SettingsGearIcon() {
  return (
    <svg className="settings-gear-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M19.4 13a7.8 7.8 0 0 0 .05-1l2.05-1.6-2-3.46-2.45.98a7.6 7.6 0 0 0-1.73-1L15 4h-4l-.37 2.32a7.6 7.6 0 0 0-1.73 1l-2.45-.98-2 3.46L6.55 12a7.8 7.8 0 0 0 0 2l-2.05 1.6 2 3.46 2.45-.98a7.6 7.6 0 0 0 1.73 1L11 22h4l.37-2.32a7.6 7.6 0 0 0 1.73-1l2.45.98 2-3.46L19.4 13z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Shell() {
  const { connectionStatus, readOnly } = useHouse()

  return (
    <div className="app-shell">
      <div className="header-meta header-meta--floating">
        {readOnly ? (
          <span className="view-only-badge" title="This link is view-only — controls are disabled">
            View only
          </span>
        ) : (
          <>
            {connectionStatus !== 'connected' ? (
              <Link className="settings-link" to="/settings">
                Settings
              </Link>
            ) : null}
            <Link className="settings-gear" to="/settings" aria-label="Settings" title="Settings">
              <SettingsGearIcon />
            </Link>
          </>
        )}
      </div>
      <Outlet />
    </div>
  )
}
