import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendsChart } from '../components/TrendsChart'
import { useHouse } from '../data/HouseContext'
import { HaClient } from '../ha/client'
import {
  TREND_DEFAULT_RANGE_DAYS,
  TREND_RANGE_DAYS,
  TREND_SERIES,
  activeIrrigationZone,
  clipTrendPoints,
  currentTrendValue,
  downloadTrendsCsv,
  downsampleTrendPoints,
  extendTrendToEnd,
  formatTrendValue,
  loadLocalTrendHistory,
  loadVisibleTrendSeries,
  mergeTrendPoints,
  parseNumericHistory,
  recordAllTrendSamples,
  resolveTrendEntityIds,
  saveVisibleTrendSeries,
  synthesizeIrrigationZoneHistory,
  trendChartWindow,
  trendRangeLabel,
  type TrendRangeDays,
  type TrendSeriesData,
  type TrendSeriesId,
  type TrendPoint,
} from '../ha/trends'
import { loadBaseUrl, loadToken } from '../ha/storage'

export function TrendsPage() {
  const { cistern, energy, energyMap, egauge, irrigation, connectionStatus } = useHouse()
  const [visible, setVisible] = useState(() => loadVisibleTrendSeries())
  const [rangeDays, setRangeDays] = useState<TrendRangeDays>(TREND_DEFAULT_RANGE_DAYS)
  const [seriesData, setSeriesData] = useState<Record<TrendSeriesId, TrendPoint[]>>(() =>
    Object.fromEntries(TREND_SERIES.map((s) => [s.id, loadLocalTrendHistory(s.id)])) as Record<
      TrendSeriesId,
      TrendPoint[]
    >,
  )
  const [status, setStatus] = useState('Loading history…')
  const [error, setError] = useState<string | null>(null)
  const [windowRange, setWindowRange] = useState(() => trendChartWindow(TREND_DEFAULT_RANGE_DAYS))

  const liveValues = useMemo(
    () => ({
      cisternPercent: cistern.levelPercent,
      batterySoc: energy.batterySoc,
      powerpackPvWatts: energy.powerpackWatts,
      pvArrayWatts: energy.pvOnlyWatts,
      housePowerWatts: egauge.gridWatts,
      irrigationZone: activeIrrigationZone(irrigation),
    }),
    [
      cistern.levelPercent,
      energy.batterySoc,
      energy.powerpackWatts,
      energy.pvOnlyWatts,
      egauge.gridWatts,
      irrigation,
    ],
  )
  const zoneNames = useMemo(() => {
    const names: Record<number, string> = {}
    for (const zone of irrigation.zones) {
      names[zone.zoneNum] = zone.label
    }
    return names
  }, [irrigation.zones])

  const liveValuesRef = useRef(liveValues)
  liveValuesRef.current = liveValues
  const irrigationRef = useRef(irrigation)
  irrigationRef.current = irrigation
  const energyMapRef = useRef(energyMap)
  energyMapRef.current = energyMap
  const rangeDaysRef = useRef(rangeDays)
  rangeDaysRef.current = rangeDays

  const zoneKey = irrigation.zones.map((zone) => zone.entityId).join('|')
  const energyKey = [
    energyMap.powerpackBatterySoc,
    energyMap.powerpackProduction,
    energyMap.pvOnlyProduction,
  ].join('|')

  const loadHistory = useCallback(async () => {
    setError(null)
    setStatus('Loading history…')
    const tipValues = liveValuesRef.current
    const irrigationSnap = irrigationRef.current
    const energyMapSnap = energyMapRef.current
    const days = rangeDaysRef.current
    recordAllTrendSamples(tipValues)
    const range = trendChartWindow(days)
    setWindowRange(range)

    const localById = Object.fromEntries(
      TREND_SERIES.map((series) => [series.id, loadLocalTrendHistory(series.id)]),
    ) as Record<TrendSeriesId, TrendPoint[]>

    const token = loadToken()
    if (!token || connectionStatus !== 'connected') {
      setSeriesData(localById)
      setStatus('Showing local samples — connect to Home Assistant for recorder history')
      return
    }

    try {
      const client = new HaClient(token, loadBaseUrl())
      const next = { ...localById }

      await Promise.all(
        TREND_SERIES.map(async (series) => {
          const entityIds = resolveTrendEntityIds(series.id, energyMapSnap, irrigationSnap)
          if (entityIds.length === 0) {
            next[series.id] = localById[series.id]
            return
          }

          try {
            const raw =
              series.id === 'irrigationZone'
                ? await client.getEntitiesHistory(entityIds, range.start, range.end, {
                    // Keep entity_id on every row and include all switch transitions.
                    minimalResponse: false,
                    significantChangesOnly: false,
                  })
                : await client.getEntitiesHistory(entityIds, range.start, range.end)
            let fromHa: TrendPoint[] = []
            if (series.id === 'irrigationZone') {
              fromHa = synthesizeIrrigationZoneHistory(
                raw,
                irrigationSnap.zones.map((zone) => ({
                  entityId: zone.entityId,
                  zoneNum: zone.zoneNum,
                })),
              )
            } else {
              fromHa = parseNumericHistory(raw, entityIds[0])
            }

            const tipValue = currentTrendValue(series.id, tipValues)
            const tip: TrendPoint[] =
              tipValue != null ? [{ timestamp: new Date().toISOString(), value: tipValue }] : []

            next[series.id] = mergeTrendPoints(fromHa, localById[series.id], tip)
          } catch {
            next[series.id] = localById[series.id]
          }
        }),
      )

      setSeriesData(next)
      const total = TREND_SERIES.reduce((sum, series) => sum + next[series.id].length, 0)
      setStatus(
        total > 0
          ? `${total} samples across series · ${trendRangeLabel(days)}`
          : `No history in the ${trendRangeLabel(days)} window yet`,
      )
    } catch (err) {
      setSeriesData(localById)
      setError(err instanceof Error ? err.message : 'Failed to load history')
      setStatus('History unavailable — showing local samples')
    }
  }, [connectionStatus, energyKey, zoneKey])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory, rangeDays])

  const chartSeries: TrendSeriesData[] = useMemo(() => {
    const now = new Date()
    const tipEnd = now < windowRange.end ? now : windowRange.end
    return TREND_SERIES.filter((series) => visible[series.id]).map((series) => {
      const clipped = clipTrendPoints(seriesData[series.id] ?? [], windowRange.start, windowRange.end)
      // House power / other high-rate series can be tens of thousands of HA points.
      const points = extendTrendToEnd(downsampleTrendPoints(clipped), tipEnd)
      return {
        ...series,
        points,
        current: currentTrendValue(series.id, liveValues),
      }
    })
  }, [liveValues, seriesData, visible, windowRange.end, windowRange.start])

  const canDownload = chartSeries.some((series) => series.points.length > 0)

  const toggleSeries = (id: TrendSeriesId) => {
    setVisible((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      saveVisibleTrendSeries(next)
      return next
    })
  }

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Trends</h1>
        <p>
          Default view is 2 days (prior-day midnight through end of today). Local samples are kept for
          1 week.
        </p>
      </header>

      <section className="widget thermal-chart-card">
        <div className="thermal-chart-header">
          <h2 className="widget-title">History</h2>
          <div className="trends-range" role="group" aria-label="Chart range">
            {TREND_RANGE_DAYS.map((days) => (
              <button
                key={days}
                type="button"
                className={`btn btn--compact${rangeDays === days ? ' trends-range-btn--active' : ''}`}
                aria-pressed={rangeDays === days}
                onClick={() => setRangeDays(days)}
              >
                {trendRangeLabel(days)}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--compact" onClick={() => void loadHistory()}>
            Refresh
          </button>
          <button
            type="button"
            className="btn btn--compact"
            disabled={!canDownload}
            onClick={() => downloadTrendsCsv(chartSeries, rangeDays, zoneNames)}
          >
            Download CSV
          </button>
        </div>

        <div className="trends-toggles" role="group" aria-label="Series to show">
          {TREND_SERIES.map((series) => {
            const current = currentTrendValue(series.id, liveValues)
            return (
              <label key={series.id} className="trends-toggle">
                <input
                  type="checkbox"
                  checked={visible[series.id]}
                  onChange={() => toggleSeries(series.id)}
                />
                <span className="trends-toggle-swatch" style={{ background: series.color }} />
                <span className="trends-toggle-label">
                  {series.label}
                  <span className="trends-toggle-value">
                    {formatTrendValue(series.unit, current, zoneNames)}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        <p className="widget-meta">{status}</p>
        {error ? <p className="irrigation-empty">{error}</p> : null}
        <TrendsChart
          series={chartSeries}
          start={windowRange.start}
          end={windowRange.end}
          rangeLabel={trendRangeLabel(rangeDays)}
          zoneNames={zoneNames}
        />
      </section>
    </main>
  )
}
