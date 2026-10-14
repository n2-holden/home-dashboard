import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { widgetHasCommOutage } from '../ha/deviceCommWidgets'
import { CommOutageIcon } from './CommOutageIcon'
import { SolarThermalPane } from './SolarOverviewWidget'
import { SunArcGraphic } from './SunArcGraphic'

const SHED_GAUGE_MAX_WATTS = 500
const PV_GAUGE_MAX_WATTS = 15_000

export function ShedSolarWidget() {
  const { energy, connectionStatus, sun, readOnly, deviceCommStatus } = useHouse()

  const shedMapped = energy.shedInverterMapped
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

  const shedGaugeWatts =
    energy.shedInverterWatts == null
      ? null
      : Math.max(0, Math.min(SHED_GAUGE_MAX_WATTS, energy.shedInverterWatts))
  const pvPowerWatts =
    energy.pvOnlyWatts == null
      ? null
      : Math.max(0, Math.min(PV_GAUGE_MAX_WATTS, energy.pvOnlyWatts))
  const shedCommOutage = widgetHasCommOutage(deviceCommStatus, 'solarShed')
  const pvCommOutage = widgetHasCommOutage(deviceCommStatus, 'solarPv')

  return (
    <article className="widget">
      <div className="widget-body">
        <div className="thermal-overview-header solar-production-header">
          <div>
            <div className="widget-title-row">
              <h2 className="widget-title">Solar</h2>
              {status && status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
            </div>
            {!mapped && !readOnly ? (
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
              <div className="solar-pane-title-row">
                <Link className="solar-pane-title solar-pane-title--link" to="/trends?tab=solar">
                  Shed
                </Link>
                {shedCommOutage ? <CommOutageIcon /> : null}
              </div>
            </div>
            <Link className="solar-pane-link" to="/trends?tab=solar" aria-label="Open Shed trends">
              <div className="energy-metrics energy-metrics--compact energy-metrics--pane energy-metrics--pv">
                <div className="energy-metric">
                  <span className="energy-metric-label">Producing</span>
                  <span className="energy-metric-value">{energy.shedInverterLabel}</span>
                </div>
                <div className="energy-metric">
                  <span className="energy-metric-label">Today</span>
                  <span className="energy-metric-value">{energy.shedInverterTodayLabel}</span>
                </div>
                <div className="energy-metric">
                  <span className="energy-metric-label">This Month</span>
                  <span className="energy-metric-value">{energy.shedInverterMonthLabel}</span>
                </div>
                <div className="energy-metric">
                  <span className="energy-metric-label">Lifetime</span>
                  <span className="energy-metric-value">{energy.shedInverterLifetimeLabel}</span>
                </div>
              </div>
              {shedMapped ? (
                <div
                  className="soc-bar"
                  style={{
                    ['--soc' as string]: `${((shedGaugeWatts ?? 0) / SHED_GAUGE_MAX_WATTS) * 100}%`,
                  }}
                  aria-label={`Shed production ${energy.shedInverterLabel}`}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={SHED_GAUGE_MAX_WATTS}
                  aria-valuenow={shedGaugeWatts ?? undefined}
                >
                  <div className="soc-bar-fill" />
                </div>
              ) : null}
            </Link>
          </section>

          <section className="solar-pane">
            <div className="solar-pane-header">
              <div className="solar-pane-title-row">
                <Link className="solar-pane-title solar-pane-title--link" to="/trends?tab=solar">
                  PV Array
                </Link>
                {pvCommOutage ? <CommOutageIcon /> : null}
              </div>
            </div>
            <Link className="solar-pane-link" to="/trends?tab=solar" aria-label="Open PV Array trends">
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
                    ['--soc' as string]: `${(pvPowerWatts / PV_GAUGE_MAX_WATTS) * 100}%`,
                  }}
                  aria-label={`PV Array production ${energy.pvOnlyLabel}`}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={PV_GAUGE_MAX_WATTS}
                  aria-valuenow={pvPowerWatts}
                >
                  <div className="soc-bar-fill" />
                </div>
              ) : null}
            </Link>
          </section>

          <SolarThermalPane />
        </div>
      </div>
    </article>
  )
}
