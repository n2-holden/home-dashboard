import { useCallback, useEffect } from 'react'
import { PendingToggle } from './PendingToggle'
import { useHouse } from '../data/HouseContext'
import { displayToggleState } from '../ha/pendingToggle'
import { usePendingToggles } from '../hooks/usePendingToggles'

const POOL_LIGHTS_TOGGLE_KEY = 'lights' as const

export function PoolWidget() {
  const { pool, poolMap, connectionStatus, setPoolLights, readOnly } = useHouse()
  const { pendingByKey, startPending, clearPending, reconcile } =
    usePendingToggles<typeof POOL_LIGHTS_TOGGLE_KEY>()
  const mapped = Boolean(poolMap.temperature || poolMap.pumpRpm || poolMap.depth)
  const hasData = pool.temperatureF != null || pool.pumpRpm != null || pool.depthFt != null

  useEffect(() => {
    reconcile({ [POOL_LIGHTS_TOGGLE_KEY]: pool.poolLightsOn })
  }, [pool.poolLightsOn, reconcile])

  const handleLightsToggle = useCallback(
    (desiredOn: boolean) => {
      startPending(POOL_LIGHTS_TOGGLE_KEY, desiredOn)
      void setPoolLights(desiredOn).catch(() => clearPending(POOL_LIGHTS_TOGGLE_KEY))
    },
    [clearPending, setPoolLights, startPending],
  )

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
              className={`pool-heater-status ${
                pool.spaHeaterOn ? 'pool-heater-status--heating' : ''
              }`}
            >
              {pool.spaHeaterOn ? 'Heating' : 'Standby'}
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
