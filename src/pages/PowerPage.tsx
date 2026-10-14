import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  POWER_RANGES,
  PowerStackChart,
  isGrid,
  powerStackColor,
  type PowerRange,
} from '../components/PowerStackChart'
import { useHouse } from '../data/HouseContext'

const HIDDEN_STORAGE_KEY = 'power-chart-hidden'

function loadHidden(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HIDDEN_STORAGE_KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

export function PowerPage() {
  const { egauge, connectionStatus } = useHouse()
  const { readings } = egauge
  const [hidden, setHidden] = useState<Set<string>>(loadHidden)
  const [range, setRange] = useState<PowerRange>('10m')

  const saveHidden = (next: Set<string>) => {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...next]))
    return next
  }

  const toggle = (label: string) => {
    setHidden((previous) => {
      const next = new Set(previous)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return saveHidden(next)
    })
  }

  const chartLabels = readings
    .filter((reading) => !isGrid(reading.label))
    .map((reading) => reading.label)
  const visibleCount = chartLabels.filter((label) => !hidden.has(label)).length
  const allVisible = visibleCount === chartLabels.length
  const someVisible = visibleCount > 0 && !allVisible

  const toggleAll = () => {
    setHidden(saveHidden(allVisible ? new Set(chartLabels) : new Set()))
  }

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header page-header--with-action">
        <div>
          <h1>Power</h1>
          <p>eGauge power registers · live · Detached garage from Emporia (about every 1.5 min)</p>
        </div>
        <Link className="btn btn--compact" to="/trends?tab=solar">
          Trends
        </Link>
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
          <div className="power-reading-row power-reading-row--all">
            <label className="irrigation-zone-label power-reading-label">
              <input
                type="checkbox"
                checked={allVisible}
                ref={(input) => {
                  if (input) input.indeterminate = someVisible
                }}
                onChange={toggleAll}
              />
              All
            </label>
          </div>
          {readings.map((reading) => (
            <div key={reading.entityId} className="power-reading-row">
              {isGrid(reading.label) ? (
                <span className="irrigation-zone-label power-reading-label">
                  <span className="power-reading-check-spacer" />
                  {reading.label}
                </span>
              ) : (
                <label className="irrigation-zone-label power-reading-label">
                  <input
                    type="checkbox"
                    checked={!hidden.has(reading.label)}
                    onChange={() => toggle(reading.label)}
                    style={{ accentColor: powerStackColor(readings, reading.label) }}
                  />
                  <span
                    className="power-reading-swatch"
                    style={{ background: powerStackColor(readings, reading.label) }}
                  />
                  {reading.label}
                </label>
              )}
              <span className="power-reading-value">{reading.formatted}</span>
            </div>
          ))}
        </div>
      )}

      {connectionStatus === 'connected' && readings.length > 0 ? (
        <section className="power-stack-section">
          <div className="trends-range power-stack-range" role="group" aria-label="Chart range">
            {POWER_RANGES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`btn btn--compact${range === entry.id ? ' trends-range-btn--active' : ''}`}
                aria-pressed={range === entry.id}
                onClick={() => setRange(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <PowerStackChart
            readings={readings}
            connected={connectionStatus === 'connected'}
            hidden={hidden}
            range={range}
          />
        </section>
      ) : null}
    </main>
  )
}
