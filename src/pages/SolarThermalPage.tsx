import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircularTempGauge } from '../components/thermal/CircularTempGauge'
import { CompareHistoryChart } from '../components/thermal/CompareHistoryChart'
import {
  configHasCredentials,
  hydrateZynectConfig,
  saveZynectConfigLocal,
} from '../zynect/config'
import {
  detectHeatingMode,
  type HeatingMode,
  type HeatingModeResult,
} from '../zynect/heatingMode'
import {
  layoutSlotForName,
  orderReadings,
  withCurrentReadingTip,
} from '../zynect/layout'
import { SensorRepository } from '../zynect/repository'
import { downloadHistoryCsv, historyHasPoints } from '../zynect/exportHistory'
import {
  CHART_PALETTE,
  type ChartSeries,
  type SensorReading,
  type ZynectConfig,
} from '../zynect/types'

type RangeDays = 1 | 7 | 30

export function SolarThermalPage() {
  const [config, setConfig] = useState<ZynectConfig | null>(null)
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [series, setSeries] = useState<ChartSeries[]>([])
  const [mode, setMode] = useState<HeatingModeResult | null>(null)
  const [rangeDays, setRangeDays] = useState<RangeDays>(1)
  const [status, setStatus] = useState('Loading…')
  const [chartStatus, setChartStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')

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

  const ordered = useMemo(
    () => orderReadings(readings.filter((reading) => !isPondReading(reading))),
    [readings],
  )

  const gaugeCells = useMemo(() => {
    const cells: Array<{ reading: SensorReading; color: string; row: number; col: number }> =
      []
    let overflowCol = 0
    ordered.forEach((reading, index) => {
      const color = CHART_PALETTE[index % CHART_PALETTE.length]
      const slot = layoutSlotForName(reading.name)
      if (slot) cells.push({ reading, color, row: slot.row, col: slot.col })
      else {
        cells.push({ reading, color, row: 2, col: overflowCol })
        overflowCol += 1
      }
    })
    return cells
  }, [ordered])

  const refresh = useCallback(async () => {
    if (!config) return
    if (!configHasCredentials(config)) {
      setError(
        'Add Zynect credentials below, or place zynect-config.json on the HA box for local + remote.',
      )
      setStatus('Not configured')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const repo = new SensorRepository(config)
      const nextReadings = await repo.getCurrentReadings()
      setReadings(nextReadings)
      setMode(
        detectHeatingMode(
          nextReadings,
          new Date(),
          config.siteLatitude,
          config.siteLongitude,
        ),
      )
      setStatus(
        `Updated ${new Date().toLocaleTimeString()} · ${nextReadings.length} sensor(s)`,
      )

      setChartStatus('Loading history…')
      const end = new Date()
      const start = new Date(end.getTime() - rangeDays * 24 * 60 * 60 * 1000)
      const orderedNext = orderReadings(nextReadings.filter((reading) => !isPondReading(reading)))
      const nextSeries: ChartSeries[] = []

      for (let i = 0; i < orderedNext.length; i += 1) {
        const reading = orderedNext[i]
        const points = withCurrentReadingTip(
          await repo.getHistory(reading.eggId, start, end),
          reading,
        )
        nextSeries.push({
          name: reading.name,
          color: CHART_PALETTE[i % CHART_PALETTE.length],
          points,
        })
      }

      setSeries(nextSeries)
      const total = nextSeries.reduce((sum, s) => sum + s.points.length, 0)
      setChartStatus(
        total > 0
          ? `${total} point(s) across ${orderedNext.length} sensor(s)`
          : 'No data points returned for this range.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed')
      setStatus('Error')
    } finally {
      setBusy(false)
    }
  }, [config, rangeDays])

  useEffect(() => {
    if (!config) return
    void refresh()
    const ms = Math.max(5, config.refreshIntervalSeconds) * 1000
    const id = window.setInterval(() => {
      void refresh()
    }, ms)
    return () => window.clearInterval(id)
  }, [config, refresh])

  function onSaveLocalToken() {
    if (!config || !tokenDraft.trim()) return
    const value = tokenDraft.trim().startsWith('Bearer ')
      ? tokenDraft.trim()
      : `Bearer ${tokenDraft.trim()}`
    const next = { ...config, authHeaderValue: value }
    saveZynectConfigLocal(next)
    setConfig(next)
  }

  const configured = config ? configHasCredentials(config) : false
  const canDownloadHistory = historyHasPoints(series)

  return (
    <main className="thermal-page">
      <Link className="back-link" to="/">
        ← Home
      </Link>

      <header className="thermal-toolbar">
        <div>
          <h1 className="page-title">Solar Thermal</h1>
          <p className="thermal-status">{status}</p>
        </div>
        <div className="thermal-toolbar-actions">
          {mode ? (
            <div className={`thermal-mode thermal-mode--${mode.mode}`} title={mode.detail}>
              <span className="thermal-mode-dot" />
              {mode.label}
            </div>
          ) : null}
          <button type="button" className="btn" disabled={busy} onClick={() => void refresh()}>
            Refresh now
          </button>
          <Link className="btn" to="/settings">
            Settings
          </Link>
        </div>
      </header>

      {error ? <p className="sync-banner">{error}</p> : null}

      {!configured ? (
        <section className="widget">
          <h2 className="widget-title">Connect Zynect</h2>
          <p className="settings-copy">
            Paste the Authorization value from zynect.com (DevTools → Network → any{' '}
            <code>/api/v2/</code> request). For local + remote, put the same values in{' '}
            <code>zynect-config.json</code> under <code>config/www/home-dashboard/</code> on
            the HA box.
          </p>
          <div className="stack">
            <label className="map-row">
              <span className="map-label">Auth header value</span>
              <input
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="Bearer eyJ…"
                autoComplete="off"
              />
            </label>
            <button type="button" className="btn btn--accent" onClick={onSaveLocalToken}>
              Save & load
            </button>
          </div>
        </section>
      ) : null}

      <div className="thermal-gauge-grid">
        {gaugeCells.map((cell) => (
          <div
            key={cell.reading.eggId}
            className="thermal-gauge-cell"
            style={{ gridRow: cell.row + 1, gridColumn: cell.col + 1 }}
          >
            <CircularTempGauge
              reading={cell.reading}
              color={cell.color}
              active={isHeatingPathSensor(mode?.mode, cell.reading.name)}
            />
          </div>
        ))}
      </div>

      <section className="widget thermal-chart-card">
        <div className="thermal-chart-header">
          <h2 className="widget-title">Compare history</h2>
          <label className="thermal-range">
            Range
            <select
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value) as RangeDays)}
            >
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
          <button type="button" className="btn" disabled={busy} onClick={() => void refresh()}>
            Refresh chart
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canDownloadHistory}
            onClick={() => downloadHistoryCsv(series, rangeDays)}
          >
            Download CSV
          </button>
        </div>
        <CompareHistoryChart series={series} />
        <p className="widget-meta">{chartStatus}</p>
      </section>
    </main>
  )
}

function isPondReading(reading: SensorReading): boolean {
  return reading.name.trim().toLowerCase() === 'pond'
}

const TANK_PATH = new Set(['collector out', 'tank supply', 'tank return', 'return'])
const POOL_PATH = new Set(['collector out', 'pool supply', 'pool return', 'return'])

/** Green border only while actively heating tank or pool, on the loop sensors. */
function isHeatingPathSensor(mode: HeatingMode | undefined, name: string): boolean {
  if (mode !== 'heating-tank' && mode !== 'heating-pool') return false
  const key = name.trim().toLowerCase()
  return mode === 'heating-tank' ? TANK_PATH.has(key) : POOL_PATH.has(key)
}
