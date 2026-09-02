import { useEffect, useState } from 'react'
import { useHouse } from '../data/HouseContext'
import { configHasCredentials, hydrateZynectConfig } from '../zynect/config'
import { SensorRepository } from '../zynect/repository'
import type { SensorReading, ZynectConfig } from '../zynect/types'

export function PondWidget() {
  const { pond, pondMap, connectionStatus } = useHouse()
  const [zynectConfig, setZynectConfig] = useState<ZynectConfig | null>(null)
  const [pondTemperature, setPondTemperature] = useState('—')
  const mapped = Boolean(pondMap.level || pondMap.depth)
  const hasData = pond.levelPercent != null || pond.depthFt != null || pondTemperature !== '—'

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
              {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
            </div>
            <div className="pool-lights-control thermal-widget-header-spacer" aria-hidden="true">
              <span>Lights</span>
            </div>
          </div>
          <div className="pool-temp-corner">
            <span className="pool-heater-status thermal-widget-header-spacer" aria-hidden="true">
              Standby
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
