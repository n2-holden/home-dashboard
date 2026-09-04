import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'

export function PowerPage() {
  const { egauge, connectionStatus } = useHouse()
  const { readings } = egauge

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Power</h1>
        <p>eGauge power registers</p>
      </header>

      {connectionStatus !== 'connected' ? (
        <p className="irrigation-empty">Connect to Home Assistant to load eGauge readings.</p>
      ) : readings.length === 0 ? (
        <p className="irrigation-empty">
          No eGauge power sensors found. Make sure the eGauge integration is configured in Home
          Assistant.
        </p>
      ) : (
        <div className="irrigation-zone-list">
          {readings.map((reading) => (
            <div key={reading.entityId} className="power-reading-row">
              <span className="irrigation-zone-label">{reading.label}</span>
              <span className="power-reading-value">{reading.formatted}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
