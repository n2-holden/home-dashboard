import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'

export function ShedSolarWidget() {
  const { energy, energyMap, connectionStatus } = useHouse()

  const shedMapped = Boolean(
    energyMap.powerpackProduction ||
      energyMap.powerpackBatterySoc ||
      energyMap.powerpackLoad ||
      energyMap.powerpackBatteryPower ||
      energyMap.powerpackGrid,
  )
  const pvMapped = Boolean(
    energyMap.pvOnlyProduction || energyMap.pvOnlyLoad || energyMap.pvOnlyGrid,
  )
  const mapped = shedMapped || pvMapped

  const status =
    connectionStatus !== 'connected'
      ? 'Not connected'
      : mapped
        ? 'Live'
        : 'Map sensors in Settings'

  const soc = energy.batterySoc

  return (
    <article className="widget">
      <div className="widget-body">
        <div className="thermal-overview-header">
          <div>
            <p className="widget-kicker">Enphase</p>
            <h2 className="widget-title">Solar</h2>
            <p className="widget-meta">{status}</p>
          </div>
          {!mapped ? (
            <Link className="btn btn--compact" to="/settings">
              Map sensors
            </Link>
          ) : null}
        </div>

        <div className="solar-split">
          <section className="solar-pane">
            <h3 className="solar-pane-title">Shed Solar</h3>
            <div className="energy-metrics energy-metrics--compact energy-metrics--shed">
              <div className="energy-metric">
                <span className="energy-metric-label">Producing</span>
                <span className="energy-metric-value">{energy.powerpackLabel}</span>
              </div>
              <div className="energy-metric">
                <span className="energy-metric-label">Consuming</span>
                <span className="energy-metric-value">{energy.loadLabel}</span>
              </div>
              <div className="energy-metric">
                <span className="energy-metric-label">Grid</span>
                <span className="energy-metric-value">{energy.gridLabel}</span>
              </div>
              <div className="energy-metric">
                <span className="energy-metric-label">Battery</span>
                <span className="energy-metric-value">{energy.batteryLabel}</span>
              </div>
              <div className="energy-metric">
                <span className="energy-metric-label">Batt power</span>
                <span className="energy-metric-value">{energy.batteryPowerLabel}</span>
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
            <h3 className="solar-pane-title">PV Solar</h3>
            <div className="energy-metrics energy-metrics--compact energy-metrics--pane">
              <div className="energy-metric">
                <span className="energy-metric-label">Producing</span>
                <span className="energy-metric-value">{energy.pvOnlyLabel}</span>
              </div>
              <div className="energy-metric">
                <span className="energy-metric-label">Consuming</span>
                <span className="energy-metric-value">{energy.pvOnlyLoadLabel}</span>
              </div>
              <div className="energy-metric">
                <span className="energy-metric-label">Grid</span>
                <span className="energy-metric-value">{energy.pvOnlyGridLabel}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </article>
  )
}
