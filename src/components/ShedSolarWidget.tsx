import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { SolarThermalPane } from './SolarOverviewWidget'
import { SunArcGraphic } from './SunArcGraphic'

export function ShedSolarWidget() {
  const { energy, energyMap, connectionStatus, shedPowerOn, setShedPower, sun } = useHouse()

  const shedMapped = Boolean(
    energyMap.powerpackProduction ||
      energyMap.powerpackBatterySoc ||
      energyMap.powerpackLoad ||
      energyMap.powerpackBatteryPower ||
      energyMap.powerpackGrid,
  )
  const pvMapped = Boolean(
    energy.pvOnlyWatts != null ||
      energy.pvOnlyTodayLabel !== '—' ||
      energy.pvOnlyMonthLabel !== '—' ||
      energy.pvOnlyLifetimeLabel !== '—',
  )
  const shedLive = connectionStatus === 'connected' && shedMapped
  const pvLive = connectionStatus === 'connected' && pvMapped
  const mapped = shedMapped || pvMapped

  const status = !mapped
    ? connectionStatus !== 'connected'
      ? 'Not connected'
      : 'Map sensors in Settings'
    : shedLive && pvLive
      ? 'Live'
      : shedLive || pvLive
        ? 'Live (partial)'
        : 'Cached'

  const soc = energy.batterySoc
  const pvPowerWatts =
    energy.pvOnlyWatts == null ? null : Math.max(0, Math.min(15_000, energy.pvOnlyWatts))

  return (
    <article className="widget">
      <div className="widget-body">
        <div className="thermal-overview-header solar-production-header">
          <div>
            <div className="widget-title-row">
              <h2 className="widget-title">Solar</h2>
              {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
            </div>
            {!mapped ? (
              <Link className="btn btn--compact solar-map-link" to="/settings">
                Map sensors
              </Link>
            ) : null}
          </div>
          <SunArcGraphic sun={sun} />
        </div>

        <div className="solar-split">
          <section className="solar-pane">
            <div className="solar-pane-header">
              <h3 className="solar-pane-title">Shed</h3>
              <label
                className="shed-power-toggle"
                title={
                  shedPowerOn == null
                    ? 'Shed Grid unavailable'
                    : shedPowerOn
                      ? 'Shed Grid on — click to turn off'
                      : 'Shed Grid off — click to turn on'
                }
              >
                <input
                  type="checkbox"
                  checked={shedPowerOn === true}
                  disabled={connectionStatus !== 'connected' || shedPowerOn == null}
                  onChange={(e) => setShedPower(e.target.checked)}
                  aria-label="Shed Grid"
                />
                <span className="shed-power-toggle-text">Grid</span>
              </label>
            </div>
            <div className="shed-pane-metrics">
              <div className="energy-metrics energy-metrics--compact energy-metrics--shed">
                <div className="energy-metric">
                  <span className="energy-metric-label">Producing</span>
                  <span className="energy-metric-value">{energy.powerpackLabel}</span>
                </div>
                <div className="energy-metric">
                  <span className="energy-metric-label">Grid</span>
                  <span className="energy-metric-value">{energy.gridLabel}</span>
                </div>
                <div className="energy-metric">
                  <span className="energy-metric-label">Consuming</span>
                  <span className="energy-metric-value">{energy.loadLabel}</span>
                </div>
                <div className="energy-metric">
                  <span className="energy-metric-label">Battery</span>
                  <span className="energy-metric-value">{energy.batteryLabel}</span>
                </div>
                <div className="energy-metric">
                  <span className="energy-metric-label">{energy.batteryPowerFlowLabel}</span>
                  <span className="energy-metric-value">{energy.batteryPowerLabel}</span>
                </div>
              </div>
            </div>
            {soc != null ? (
              <div
                className="soc-bar"
                style={{ ['--soc' as string]: `${Math.max(0, Math.min(100, soc))}%` }}
                aria-hidden
              >
                <div className="soc-bar-fill" />
              </div>
            ) : null}
          </section>

          <section className="solar-pane">
            <h3 className="solar-pane-title">PV Array</h3>
            <div className="energy-metrics energy-metrics--compact energy-metrics--pane energy-metrics--pv">
              <div className="energy-metric">
                <span className="energy-metric-label">Producing</span>
                <span className="energy-metric-value">{energy.pvOnlyLabel}</span>
              </div>
              <div className="energy-metric">
                <span className="energy-metric-label">Today</span>
                <span className="energy-metric-value">{energy.pvOnlyTodayLabel}</span>
              </div>
              <div className="energy-metric">
                <span className="energy-metric-label">This Month</span>
                <span className="energy-metric-value">{energy.pvOnlyMonthLabel}</span>
              </div>
              <div className="energy-metric">
                <span className="energy-metric-label">Lifetime</span>
                <span className="energy-metric-value">{energy.pvOnlyLifetimeLabel}</span>
              </div>
            </div>
            {pvPowerWatts != null ? (
              <div
                className="soc-bar"
                style={{
                  ['--soc' as string]: `${(pvPowerWatts / 15_000) * 100}%`,
                }}
                aria-label={`PV Array production ${energy.pvOnlyLabel}`}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={15_000}
                aria-valuenow={pvPowerWatts}
              >
                <div className="soc-bar-fill" />
              </div>
            ) : null}
          </section>

          <SolarThermalPane />
        </div>
      </div>
    </article>
  )
}
