import { useHouse } from '../data/HouseContext'
import { formatTimeRemaining } from '../ha/irrigation'

export function IrrigationPage() {
  const { irrigation } = useHouse()
  const { zones } = irrigation

  return (
    <main>
      <div className="stack">
        <h1 className="page-title">Irrigation</h1>
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
      </div>
    </main>
  )
}
