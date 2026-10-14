import { useCallback, useEffect, useState } from 'react'
import { PendingToggle } from './PendingToggle'
import { CommOutageIcon } from './CommOutageIcon'
import { FlameIcon } from './FlameIcon'
import { useHouse } from '../data/HouseContext'
import { displayToggleState } from '../ha/pendingToggle'
import { usePendingToggles } from '../hooks/usePendingToggles'
import { useTrendsLink } from '../hooks/useTrendsLink'
import { widgetHasCommOutage } from '../ha/deviceCommWidgets'
import { configHasCredentials, hydrateZynectConfig } from '../zynect/config'
import { SensorRepository } from '../zynect/repository'
import type { SensorReading, ZynectConfig } from '../zynect/types'

const POND_FILL_TOGGLE_KEY = 'fill' as const
export function PondWidget() {
  const { pond, pondMap, connectionStatus, setPondFill, readOnly, deviceCommStatus } = useHouse()
  const trendsLink = useTrendsLink('pond')
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
    <article className="widget widget--clickable" title="Open pond trends" {...trendsLink}>
      <div className="widget-body">
        <div className="thermal-overview-header">
          <div className="pool-header-left">
            <div className="widget-title-row">
              <h2 className="widget-title">Pond</h2>
              {commOutage ? <CommOutageIcon /> : null}
              {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
              {pond.fillError ? (
                <>
                  <CommOutageIcon
                    to="/settings?tab=automation"
                    title="Pond fill error: auto fill paused. Open Settings to clear it."
                  />
                  <span
                    className="pond-fill-error-badge"
                    title="Auto fill paused: the level didn't rise or the valve didn't open. Clear it in Settings."
                  >
                    Fill error
                  </span>
                </>
              ) : null}
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
              <FlameIcon active={false} className="pool-heater-icon" />
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
