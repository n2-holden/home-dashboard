import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  configHasCredentials,
  hydrateZynectConfig,
} from '../zynect/config'
import { detectHeatingMode, type HeatingModeResult } from '../zynect/heatingMode'
import { SensorRepository } from '../zynect/repository'
import type { SensorReading, ZynectConfig } from '../zynect/types'

export function SolarThermalOverviewWidget() {
  const data = useSolarThermalData()

  return (
    <article className="widget widget--interactive">
      <Link className="widget-link" to="/solar-thermal">
        <div className="thermal-overview-header">
          <div>
            <div className="widget-title-row">
              <h2 className="widget-title">Solar Thermal</h2>
              {data.status !== 'Live' ? (
                <span className="widget-meta">{data.status}</span>
              ) : null}
            </div>
          </div>
          {data.mode ? (
            <div
              className={`thermal-mode thermal-mode--compact thermal-mode--${data.mode.mode}`}
              title={data.mode.detail}
            >
              <span className="thermal-mode-dot" />
              {data.mode.label}
            </div>
          ) : null}
        </div>

        <div className="energy-metrics energy-metrics--compact">
          <div className="energy-metric">
            <span className="energy-metric-label">Collector out</span>
            <span className="energy-metric-value">{data.collectorOut}</span>
          </div>
          <div className="energy-metric">
            <span className="energy-metric-label">Return</span>
            <span className="energy-metric-value">{data.systemReturn}</span>
          </div>
        </div>
      </Link>
    </article>
  )
}

/** Compact thermal section used inside the combined Solar widget. */
export function SolarThermalPane() {
  const data = useSolarThermalData()

  return (
    <section className="solar-pane">
      <Link
        className="solar-pane-header solar-pane-header-link"
        to="/solar-thermal"
        aria-label="Open Solar Thermal dashboard"
      >
        <h3 className="solar-pane-title">Thermal</h3>
        {data.mode ? (
          <div
            className={`thermal-mode thermal-mode--compact thermal-mode--${data.mode.mode}`}
            title={data.mode.detail}
          >
            <span className="thermal-mode-dot" />
            {data.mode.label}
          </div>
        ) : null}
      </Link>
      <div className="energy-metrics energy-metrics--compact">
        <div className="energy-metric">
          <span className="energy-metric-label">Collector out</span>
          <span className="energy-metric-value">{data.collectorOut}</span>
        </div>
        <div className="energy-metric">
          <span className="energy-metric-label">Return</span>
          <span className="energy-metric-value">{data.systemReturn}</span>
        </div>
      </div>
    </section>
  )
}

function useSolarThermalData() {
  const [config, setConfig] = useState<ZynectConfig | null>(null)
  const [collectorOut, setCollectorOut] = useState('—')
  const [systemReturn, setSystemReturn] = useState('—')
  const [mode, setMode] = useState<HeatingModeResult | null>(null)
  const [status, setStatus] = useState('Loading…')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await hydrateZynectConfig()
      if (!cancelled) setConfig(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!config) return

    let cancelled = false

    async function load() {
      if (!config || !configHasCredentials(config)) {
        if (!cancelled) {
          setStatus('Not configured')
          setMode(null)
          setCollectorOut('—')
          setSystemReturn('—')
        }
        return
      }

      try {
        const repo = new SensorRepository(config)
        const readings = await repo.getCurrentReadings()
        if (cancelled) return

        setCollectorOut(formatTemp(findReading(readings, 'Collector out')))
        setSystemReturn(formatTemp(findReading(readings, 'Return')))
        setMode(
          detectHeatingMode(
            readings,
            new Date(),
            config.siteLatitude,
            config.siteLongitude,
          ),
        )
        setStatus('Live')
      } catch {
        if (!cancelled) setStatus('Unavailable')
      }
    }

    void load()
    const ms = Math.max(5, config.refreshIntervalSeconds) * 1000
    const id = window.setInterval(() => {
      void load()
    }, ms)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [config])

  return { collectorOut, systemReturn, mode, status }
}

function findReading(readings: SensorReading[], name: string): SensorReading | null {
  const key = name.trim().toLowerCase()
  return readings.find((r) => r.name.trim().toLowerCase() === key) ?? null
}

function formatTemp(reading: SensorReading | null): string {
  if (!reading || reading.value == null) return '—'
  const unit = reading.unit?.trim() || '°F'
  const suffix = unit.startsWith('°') ? unit : ` ${unit}`
  return `${reading.value.toFixed(1)}${suffix}`
}
