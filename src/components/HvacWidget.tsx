import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'

function FlameIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`hvac-widget-metric-icon ${active ? 'hvac-widget-metric-icon--heating' : ''}`}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        d="M12 3c1.2 2.4 3.4 3.8 3.4 6.6 0 2.2-1.4 3.9-3.4 3.9S8.6 11.8 8.6 9.6C8.6 6.8 10.8 5.4 12 3z"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 14.5c1.4 0 2.5 1.2 2.5 2.7 0 1.8-1.5 3.3-2.5 4.3-1-1-2.5-2.5-2.5-4.3 0-1.5 1.1-2.7 2.5-2.7z"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SnowflakeIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`hvac-widget-metric-icon ${active ? 'hvac-widget-metric-icon--cooling' : ''}`}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        d="M12 3v18M5.5 6.5l13 11M18.5 6.5l-13 11M3 12h18M6.5 8.5l11 7M17.5 8.5l-11 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HvacWidget() {
  const { hvac, ac, connectionStatus } = useHouse()

  const status =
    connectionStatus !== 'connected'
      ? 'Not connected'
      : hvac.totalCount > 0 || ac.totalCount > 0
        ? 'Live'
        : 'No HVAC'

  const heatingValue =
    connectionStatus === 'connected' && hvac.totalCount > 0 ? hvac.heatingCount : '—'

  const coolingValue =
    connectionStatus === 'connected' && ac.totalCount > 0 ? ac.coolingCount : '—'

  const heatingActive = connectionStatus === 'connected' && hvac.heatingCount > 0
  const coolingActive = connectionStatus === 'connected' && ac.coolingCount > 0

  return (
    <article className="widget">
      <div className="widget-body">
        <div className="thermal-overview-header">
          <div>
            <div className="widget-title-row">
              <h2 className="widget-title">HVAC</h2>
              {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
            </div>
          </div>
          <div
            className="energy-metric pool-temp-corner thermal-widget-header-spacer"
            aria-hidden="true"
          >
            <span className="energy-metric-label">Temperature</span>
            <span className="energy-metric-value">00.0°F</span>
          </div>
        </div>

        <div className="energy-metrics energy-metrics--compact energy-metrics--hvac">
          <Link to="/hvac" className="energy-metric hvac-widget-metric-link">
            <span className="energy-metric-label hvac-widget-metric-label">
              <FlameIcon active={heatingActive} />
              Heating
            </span>
            <span className="energy-metric-value">{heatingValue}</span>
          </Link>
          <Link to="/ac" className="energy-metric hvac-widget-metric-link">
            <span className="energy-metric-label hvac-widget-metric-label">
              <SnowflakeIcon active={coolingActive} />
              Cooling
            </span>
            <span className="energy-metric-value">{coolingValue}</span>
          </Link>
        </div>
      </div>
    </article>
  )
}
