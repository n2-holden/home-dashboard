import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { formatTimeRemaining } from '../ha/irrigation'

export function IrrigationPage() {
  const { irrigation } = useHouse()
  const { zones } = irrigation

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header page-header--with-action">
        <div>
          <h1>Irrigation</h1>
          <p>Rain Bird zones</p>
        </div>
        <Link className="btn btn--compact" to="/trends">
          Trends
        </Link>
      </header>

      {zones.length === 0 ? (
        <p className="irrigation-empty">
          No Rain Bird zones found. Make sure the Rain Bird integration is configured in Home
          Assistant.
        </p>
      ) : (
        <div className="irrigation-zone-list">
          {zones.map((zone) => (
            <div
              key={zone.entityId}
              className={`irrigation-zone-row${zone.active ? ' irrigation-zone-row--active' : ''}`}
            >
              <span className="irrigation-zone-num">{zone.zoneNum}</span>
              <span className="irrigation-zone-label">{zone.label}</span>
              <span className="irrigation-zone-status-col">
                {zone.active ? (
                  <>
                    <span className="irrigation-zone-badge irrigation-zone-badge--running">
                      Running
                    </span>
                    {zone.timeRemaining != null && zone.timeRemaining > 0 && (
                      <span className="irrigation-zone-remaining">
                        {formatTimeRemaining(zone.timeRemaining)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="irrigation-zone-badge irrigation-zone-badge--idle">Idle</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
