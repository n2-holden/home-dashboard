import { useCallback, useEffect, useState } from 'react'
import { PendingToggle } from './PendingToggle'
import { CommOutageIcon } from './CommOutageIcon'
import { useHouse } from '../data/HouseContext'
import { displayToggleState } from '../ha/pendingToggle'
import { usePendingToggles } from '../hooks/usePendingToggles'
import { widgetHasCommOutage } from '../ha/deviceCommWidgets'

const POOL_LIGHTS_TOGGLE_KEY = 'lights' as const
/** ScreenLogic RPM often lags the Pool circuit by tens of seconds. */
const POOL_PUMP_TURN_ON_WAIT_MS = 60_000

function FlameIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`pool-heater-icon ${active ? 'pool-heater-icon--heating' : ''}`}
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

export function PoolWidget() {
  const { pool, poolMap, connectionStatus, setPoolLights, turnPoolPumpOn, readOnly, deviceCommStatus } =
    useHouse()
  const { pendingByKey, startPending, clearPending, reconcile } =
    usePendingToggles<typeof POOL_LIGHTS_TOGGLE_KEY>()
  const [turningPumpOn, setTurningPumpOn] = useState(false)
  const mapped = Boolean(poolMap.temperature || poolMap.pumpRpm || poolMap.depth)
  const hasData = pool.temperatureF != null || pool.pumpRpm != null || pool.depthFt != null
  const showTurnOn = (pool.pumpRpm === 0 && !pool.pumpRunning) || turningPumpOn
  const commOutage = widgetHasCommOutage(deviceCommStatus, 'pool')

  useEffect(() => {
    reconcile({ [POOL_LIGHTS_TOGGLE_KEY]: pool.poolLightsOn })
  }, [pool.poolLightsOn, reconcile])

  useEffect(() => {
    if (!turningPumpOn) return
    if (pool.pumpRunning) {
      setTurningPumpOn(false)
      return
    }
    const id = window.setTimeout(() => setTurningPumpOn(false), POOL_PUMP_TURN_ON_WAIT_MS)
    return () => window.clearTimeout(id)
  }, [pool.pumpRunning, turningPumpOn])

  const handleLightsToggle = useCallback(
    (desiredOn: boolean) => {
      startPending(POOL_LIGHTS_TOGGLE_KEY, desiredOn)
      void setPoolLights(desiredOn).catch(() => clearPending(POOL_LIGHTS_TOGGLE_KEY))
    },
    [clearPending, setPoolLights, startPending],
  )

  const handleTurnPumpOn = useCallback(() => {
    if (turningPumpOn || readOnly || connectionStatus !== 'connected') return
    setTurningPumpOn(true)
    void turnPoolPumpOn().catch(() => setTurningPumpOn(false))
  }, [connectionStatus, readOnly, turnPoolPumpOn, turningPumpOn])

  const lightsPending = pendingByKey[POOL_LIGHTS_TOGGLE_KEY] ?? null
  const { checked: lightsChecked, unavailable: lightsUnavailable } = displayToggleState(
    pool.poolLightsOn,
    lightsPending,
  )
  const lightsDisabled = readOnly || connectionStatus !== 'connected' || lightsUnavailable

  const status =
    connectionStatus !== 'connected'
      ? 'Not connected'
      : hasData
        ? 'Live'
        : mapped
          ? 'Waiting for data'
          : 'Map sensors in Settings'

  return (
    <article className="widget">
      <div className="widget-body">
        <div className="thermal-overview-header">
          <div className="pool-header-left">
            <div className="widget-title-row">
              <h2 className="widget-title">Pool</h2>
              {commOutage ? <CommOutageIcon /> : null}
              {showTurnOn ? (
                <button
                  type="button"
                  className="btn btn--compact pool-turn-on-btn"
                  disabled={readOnly || connectionStatus !== 'connected' || turningPumpOn}
                  onClick={handleTurnPumpOn}
                  title="Turn on the ScreenLogic Pool circuit (starts the filter pump)"
                >
                  {turningPumpOn ? 'Turning on…' : 'Turn on'}
                </button>
              ) : null}
              {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
            </div>
            <div
              className="pool-lights-control"
              title={
                pool.poolLightsOn == null
                  ? 'Pool lights unavailable'
                  : pool.poolLightsOn
                    ? 'Pool lights on — click to turn off all SAm lights'
                    : 'Pool lights off — click to turn on all SAm lights'
              }
            >
              <PendingToggle
                checked={lightsChecked}
                pending={lightsPending != null}
                disabled={lightsDisabled}
                label="Pool lights"
                onToggle={handleLightsToggle}
              />
              <span>Lights</span>
            </div>
          </div>
          <div className="pool-temp-corner">
            <span
              className="pool-heater-status"
              title={pool.spaHeaterOn ? 'Heating' : 'Standby'}
              aria-label={pool.spaHeaterOn ? 'Heating' : 'Standby'}
            >
              <FlameIcon active={Boolean(pool.spaHeaterOn)} />
            </span>
            <div className="energy-metric">
              <span className="energy-metric-label">Temperature</span>
              <span className="energy-metric-value">{pool.temperatureLabel}</span>
            </div>
          </div>
        </div>

        <div className="energy-metrics energy-metrics--compact energy-metrics--pool">
          <div className="energy-metric">
            <span className="energy-metric-label">Pump</span>
            <span className="energy-metric-value">{pool.pumpRpmLabel}</span>
          </div>
          <div className="energy-metric">
            <span className="energy-metric-label">Water Level</span>
            <span className="energy-metric-value">{pool.depthLabel}</span>
          </div>
        </div>
      </div>
    </article>
  )
}
