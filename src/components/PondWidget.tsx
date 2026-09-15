import { useCallback, useEffect, useState } from 'react'
import { PendingToggle } from './PendingToggle'
import { CommOutageIcon } from './CommOutageIcon'
import { useHouse } from '../data/HouseContext'
import { displayToggleState } from '../ha/pendingToggle'
import { usePendingToggles } from '../hooks/usePendingToggles'
import { widgetHasCommOutage } from '../ha/deviceCommWidgets'
import { configHasCredentials, hydrateZynectConfig } from '../zynect/config'
import { SensorRepository } from '../zynect/repository'
import type { SensorReading, ZynectConfig } from '../zynect/types'

const POND_FILL_TOGGLE_KEY = 'fill' as const

export function PondWidget() {
  const { pond, pondMap, connectionStatus, setPondFill, readOnly, deviceCommStatus } = useHouse()
  const { pendingByKey, startPending, clearPending, reconcile } =
    usePendingToggles<typeof POND_FILL_TOGGLE_KEY>()
  const [zynectConfig, setZynectConfig] = useState<ZynectConfig | null>(null)
  const [pondTemperature, setPondTemperature] = useState('—')
  const mapped = Boolean(pondMap.level || pondMap.depth)
  const hasData = pond.levelPercent != null || pond.depthFt != null || pondTemperature !== '—'
  const commOutage = widgetHasCommOutage(deviceCommStatus, 'pond')

  useEffect(() => {
    reconcile({ [POND_FILL_TOGGLE_KEY]: pond.fillOn })
  }, [pond.fillOn, reconcile])

  useEffect(() => {
    let cancelled = false
    void hydrateZynectConfig().then((config) => {
      if (!cancelled) setZynectConfig(config)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!zynectConfig) return
    const config = zynectConfig

    let cancelled = false

    async function loadPondTemperature() {
      if (!configHasCredentials(config)) {
        setPondTemperature('—')
        return
      }

      try {
        const readings = await new SensorRepository(config).getCurrentReadings()
        if (cancelled) return
        setPondTemperature(formatTemperature(findPondReading(readings)))
      } catch {
        if (!cancelled) setPondTemperature('—')
      }
    }

    void loadPondTemperature()
    const id = window.setInterval(
      () => void loadPondTemperature(),
      Math.max(5, config.refreshIntervalSeconds) * 1000,
    )
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [zynectConfig])

  const handleFillToggle = useCallback(
    (desiredOn: boolean) => {
      startPending(POND_FILL_TOGGLE_KEY, desiredOn)
      void setPondFill(desiredOn).catch(() => clearPending(POND_FILL_TOGGLE_KEY))
    },
    [clearPending, setPondFill, startPending],
  )

  const fillPending = pendingByKey[POND_FILL_TOGGLE_KEY] ?? null
  const { checked: fillChecked, unavailable: fillUnavailable } = displayToggleState(
    pond.fillOn,
    fillPending,
  )
  const fillDisabled = readOnly || connectionStatus !== 'connected' || fillUnavailable

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
              <h2 className="widget-title">Pond</h2>
              {commOutage ? <CommOutageIcon /> : null}
              {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
            </div>
            <div
              className="pool-lights-control"
              title={
                pond.fillOn == null
                  ? 'Pond fill unavailable'
                  : pond.fillOn
                    ? 'Pond fill open — click to close'
                    : 'Pond fill closed — click to open'
              }
            >
              <PendingToggle
                checked={fillChecked}
                pending={fillPending != null}
                disabled={fillDisabled}
                label="Pond fill"
                onToggle={handleFillToggle}
              />
              <span>Fill</span>
            </div>
          </div>
          <div className="pool-temp-corner">
            <span className="pool-heater-status thermal-widget-header-spacer" aria-hidden="true">
              <svg className="pool-heater-icon" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M12 3c1.2 2.4 3.4 3.8 3.4 6.6 0 2.2-1.4 3.9-3.4 3.9S8.6 11.8 8.6 9.6C8.6 6.8 10.8 5.4 12 3z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
              </svg>
            </span>
            <div className="energy-metric">
              <span className="energy-metric-label">Temperature</span>
              <span className="energy-metric-value">{pondTemperature}</span>
            </div>
          </div>
        </div>

        <div className="energy-metrics energy-metrics--compact energy-metrics--pond">
          <div className="energy-metric">
            <span className="energy-metric-label">Level</span>
            <span className="energy-metric-value">{pond.levelLabel}</span>
          </div>
          <div className="energy-metric">
            <span className="energy-metric-label">Water Level</span>
            <span className="energy-metric-value">{pond.depthLabel}</span>
          </div>
        </div>
      </div>
    </article>
  )
}

function findPondReading(readings: SensorReading[]): SensorReading | null {
  return readings.find((reading) => reading.name.trim().toLowerCase() === 'pond') ?? null
}

function formatTemperature(reading: SensorReading | null): string {
  if (!reading || reading.value == null) return '—'
  const unit = reading.unit?.trim() || '°F'
  return `${reading.value.toFixed(1)}${unit.startsWith('°') ? unit : ` ${unit}`}`
}
