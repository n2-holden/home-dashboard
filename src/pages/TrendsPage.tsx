import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TrendsChart } from '../components/TrendsChart'
import { useHouse } from '../data/HouseContext'
import { HaClient } from '../ha/client'
import {
  TREND_DEFAULT_RANGE_DAYS,
  TREND_RANGE_DAYS,
  TREND_SERIES,
  TREND_TABS,
  activeIrrigationZone,
  clipTrendPoints,
  currentTrendValue,
  cisternFullEta,
  cisternPercentRates,
  downloadTrendsCsv,
  downsampleTrendPoints,
  extendTrendToEnd,
  formatCisternFullEta,
  formatPercentPerHour,
  formatTrendValue,
  loadLocalTrendHistory,
  loadVisibleTrendSeries,
  mergeTrendPoints,
  parseDepthHistory,
  parseNumericHistory,
  parseOpenHistory,
  parsePoolHistory,
  parseTrendTab,
  poolHeaterPercent,
  POOL_TREND_SERIES,
  recordAllTrendSamples,
  resolveTrendEntityIds,
  saveVisibleTrendSeries,
  stepSeriesAverage,
  synthesizeIrrigationZoneHistory,
  trendChartWindow,
  trendRangeLabel,
  trendTabForSeries,
  type TrendRangeDays,
  type TrendSeriesData,
  type TrendSeriesId,
  type TrendPoint,
  type TrendTabId,
} from '../ha/trends'
import { loadBaseUrl, loadToken } from '../ha/storage'
import { configHasCredentials, hydrateZynectConfig } from '../zynect/config'
import { SensorRepository } from '../zynect/repository'

const EMPTY_SERIES_DATA = Object.fromEntries(
  TREND_SERIES.map((s) => [s.id, [] as TrendPoint[]]),
) as Record<TrendSeriesId, TrendPoint[]>

const TAB_KEY = 'trends-tab-v1'

function loadSavedTab(): TrendTabId {
  try {
    return parseTrendTab(localStorage.getItem(TAB_KEY)) ?? 'water'
  } catch {
    return 'water'
  }
}

/** Pond water temperature lives in the Zynect cloud (sensor named "Pond"), not HA. */
async function loadPondTemperatureHistory(
  start: Date,
  end: Date,
): Promise<{ points: TrendPoint[]; current: number | null }> {
  const config = await hydrateZynectConfig()
  if (!configHasCredentials(config)) return { points: [], current: null }
  const repo = new SensorRepository(config)
  const readings = await repo.getCurrentReadings()
  const pond = readings.find((reading) => reading.name.trim().toLowerCase() === 'pond')
  if (!pond) return { points: [], current: null }
  const history = await repo.getHistory(pond.eggId, start, end)
  return {
    points: history.filter((point) => Number.isFinite(point.value)),
    current: pond.value,
  }
}

export function TrendsPage() {
  const {
    cistern,
    pond,
    pondMap,
    pool,
    poolMap,
    energy,
    energyMap,
    egauge,
    irrigation,
    hotTub,
    connectionStatus,
  } = useHouse()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSeries = useMemo(
    () =>
      (searchParams.get('show') ?? '')
        .split(',')
        .filter((id): id is TrendSeriesId => TREND_SERIES.some((s) => s.id === id)),
    [searchParams],
  )
  const tab: TrendTabId =
    parseTrendTab(searchParams.get('tab')) ??
    (requestedSeries.length > 0 ? trendTabForSeries(requestedSeries[0]) : loadSavedTab())
  const tabSeriesIds = useMemo(
    () => TREND_TABS.find((entry) => entry.id === tab)?.series ?? [],
    [tab],
  )
  const tabSeries = useMemo(
    () => TREND_SERIES.filter((series) => tabSeriesIds.includes(series.id)),
    [tabSeriesIds],
  )

  const [visible, setVisible] = useState(() => {
    const saved = loadVisibleTrendSeries()
    if (requestedSeries.length === 0) return saved
    // Deep link shows just the requested series without changing the saved selection.
    return Object.fromEntries(
      TREND_SERIES.map((s) => [s.id, requestedSeries.includes(s.id)]),
    ) as typeof saved
  })
  const [rangeDays, setRangeDays] = useState<TrendRangeDays>(TREND_DEFAULT_RANGE_DAYS)
  const [seriesData, setSeriesData] =
    useState<Record<TrendSeriesId, TrendPoint[]>>(EMPTY_SERIES_DATA)
  const [historyReady, setHistoryReady] = useState(false)
  const [status, setStatus] = useState('Loading history…')
  const [error, setError] = useState<string | null>(null)
  const [windowRange, setWindowRange] = useState(() => trendChartWindow(TREND_DEFAULT_RANGE_DAYS))
  const [pondTempF, setPondTempF] = useState<number | null>(null)

  const hotTubWatts = useMemo(
    () => egauge.readings.find((reading) => /hot\s*tub/i.test(reading.label))?.watts ?? null,
    [egauge.readings],
  )

  const liveValues = useMemo(
    () => ({
      cisternPercent: cistern.levelPercent,
      pondPercent: pond.levelPercent,
      shedInverterWatts: energy.shedInverterWatts,
      pvArrayWatts: energy.pvOnlyWatts,
      irrigationZone: activeIrrigationZone(irrigation),
      poolTempF: pool.temperatureF,
      poolHeaterPercent: poolHeaterPercent(pool.spaHeaterOn),
      poolLevelInches: pool.depthFt,
      pondTempF,
      pondFillPercent: pond.fillOn == null ? null : pond.fillOn ? 100 : 0,
      hotTubTempF: hotTub.temperatureF,
      hotTubWatts,
    }),
    [
      cistern.levelPercent,
      pond.levelPercent,
      pond.fillOn,
      energy.shedInverterWatts,
      energy.pvOnlyWatts,
      irrigation,
      pool.temperatureF,
      pool.spaHeaterOn,
      pool.depthFt,
      pondTempF,
      hotTub.temperatureF,
      hotTubWatts,
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
  const pondMapRef = useRef(pondMap)
  pondMapRef.current = pondMap
  const poolMapRef = useRef(poolMap)
  poolMapRef.current = poolMap
  const rangeDaysRef = useRef(rangeDays)
  rangeDaysRef.current = rangeDays
  const loadGenRef = useRef(0)

  const zoneKey = irrigation.zones.map((zone) => zone.entityId).join('|')
  const energyKey = energyMap.pvOnlyProduction ?? ''
  const pondKey = pondMap.level ?? ''
  const poolKey = `${poolMap.temperature ?? ''}|${poolMap.depth ?? ''}|${poolMap.depthOffset}`

  const loadHistory = useCallback(async () => {
    const loadGen = ++loadGenRef.current
    setError(null)
    setHistoryReady(false)
    setSeriesData(EMPTY_SERIES_DATA)
    setStatus('Loading history…')
    const tipValues = liveValuesRef.current
    const irrigationSnap = irrigationRef.current
    const poolMapSnap = poolMapRef.current
    const days = rangeDaysRef.current
    recordAllTrendSamples(tipValues)
    const range = trendChartWindow(days)
    setWindowRange(range)

    const localById = Object.fromEntries(
      TREND_SERIES.map((series) => [series.id, loadLocalTrendHistory(series.id)]),
    ) as Record<TrendSeriesId, TrendPoint[]>

    const finish = (next: Record<TrendSeriesId, TrendPoint[]>, nextStatus: string) => {
      if (loadGen !== loadGenRef.current) return
      setSeriesData(next)
      setStatus(nextStatus)
      setHistoryReady(true)
    }

    const token = loadToken()
    if (!token || connectionStatus !== 'connected') {
      finish(localById, 'Showing local samples — connect to Home Assistant for recorder history')
      return
    }

    try {
      const client = new HaClient(token, loadBaseUrl())
      const next = { ...localById }
      const sources = {
        energyMap: energyMapRef.current,
        irrigation: irrigationSnap,
        pondLevelEntity: pondMapRef.current.level,
        poolTemperatureEntity: poolMapSnap.temperature,
        poolDepthEntity: poolMapSnap.depth,
      }

      await Promise.all(
        tabSeriesIds.map(async (id) => {
          const tipValue = currentTrendValue(id, tipValues)
          const tip: TrendPoint[] =
            tipValue != null ? [{ timestamp: new Date().toISOString(), value: tipValue }] : []

          if (id === 'pondTemp') {
            try {
              const zynect = await loadPondTemperatureHistory(range.start, range.end)
              if (loadGen === loadGenRef.current) setPondTempF(zynect.current)
              next[id] = mergeTrendPoints(zynect.points, localById[id], tip)
            } catch {
              next[id] = localById[id]
            }
            return
          }

          const entityIds = resolveTrendEntityIds(id, sources)
          if (entityIds.length === 0) {
            next[id] = localById[id]
            return
          }

          try {
            const needsFullRows =
              id === 'irrigationZone' ||
              id === 'poolLevel' ||
              id === 'pondFill' ||
              POOL_TREND_SERIES.has(id)
            const raw = needsFullRows
              ? await client.getEntitiesHistory(entityIds, range.start, range.end, {
                  // Keep entity_id + attributes on every row and include all transitions.
                  minimalResponse: false,
                  significantChangesOnly: false,
                })
              : await client.getEntitiesHistory(entityIds, range.start, range.end)
            let fromHa: TrendPoint[] = []
            if (id === 'irrigationZone') {
              fromHa = synthesizeIrrigationZoneHistory(
                raw,
                irrigationSnap.zones.map((zone) => ({
                  entityId: zone.entityId,
                  zoneNum: zone.zoneNum,
                })),
              )
            } else if (POOL_TREND_SERIES.has(id)) {
              fromHa = parsePoolHistory(
                raw,
                entityIds[0],
                id === 'poolHeater' ? 'heater' : 'temperature',
              )
            } else if (id === 'poolLevel') {
              fromHa = parseDepthHistory(raw, entityIds[0], poolMapSnap.depthOffset ?? 0)
            } else if (id === 'pondFill') {
              fromHa = parseOpenHistory(raw, entityIds[0])
            } else {
              fromHa = parseNumericHistory(raw, entityIds[0], {
                unavailableAsGap:
                  id === 'shedInverter' || id === 'hotTubTemp' || id === 'hotTubPower',
              })
            }

            next[id] = mergeTrendPoints(fromHa, localById[id], tip)
          } catch {
            next[id] = localById[id]
          }
        }),
      )

      if (loadGen !== loadGenRef.current) return
      const total = tabSeriesIds.reduce((sum, id) => sum + next[id].length, 0)
      finish(
        next,
        total > 0
          ? `${total} samples across series · ${trendRangeLabel(days)}`
          : `No history in the ${trendRangeLabel(days)} window yet`,
      )
    } catch (err) {
      if (loadGen !== loadGenRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load history')
      finish(localById, 'History unavailable — showing local samples')
    }
  }, [connectionStatus, energyKey, pondKey, poolKey, zoneKey, tabSeriesIds])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory, rangeDays])

  const chartSeries: TrendSeriesData[] = useMemo(() => {
    const now = new Date()
    const tipEnd = now < windowRange.end ? now : windowRange.end
    return tabSeries
      .filter((series) => visible[series.id])
      .map((series) => {
        const clipped = clipTrendPoints(
          seriesData[series.id] ?? [],
          windowRange.start,
          windowRange.end,
        )
        // High-rate series (eGauge power) can be tens of thousands of HA points.
        const points = extendTrendToEnd(downsampleTrendPoints(clipped), tipEnd)
        return {
          ...series,
          points,
          current: currentTrendValue(series.id, liveValues),
        }
      })
  }, [liveValues, seriesData, tabSeries, visible, windowRange.end, windowRange.start])

  const cisternRates = useMemo(() => {
    if (!historyReady || tab !== 'water' || !visible.cistern) return null
    const now = new Date()
    const tipEnd = now < windowRange.end ? now : windowRange.end
    const clipped = clipTrendPoints(seriesData.cistern ?? [], windowRange.start, tipEnd)
    return cisternPercentRates(clipped, { start: windowRange.start, end: tipEnd })
  }, [historyReady, seriesData.cistern, tab, visible.cistern, windowRange.end, windowRange.start])

  const poolHeaterAverage = useMemo(() => {
    if (!historyReady || tab !== 'pool' || !visible.poolHeater) return null
    const now = new Date()
    const tipEnd = now < windowRange.end ? now : windowRange.end
    const clipped = clipTrendPoints(seriesData.poolHeater ?? [], windowRange.start, tipEnd)
    return stepSeriesAverage(clipped, windowRange.start, tipEnd)
  }, [
    historyReady,
    seriesData.poolHeater,
    tab,
    visible.poolHeater,
    windowRange.end,
    windowRange.start,
  ])

  const cisternFullEtaLabel = useMemo(() => {
    if (!cisternRates) return null
    return formatCisternFullEta(cisternFullEta(cistern.levelPercent, cisternRates))
  }, [cistern.levelPercent, cisternRates])

  const canDownload = historyReady && chartSeries.some((series) => series.points.length > 0)

  const selectTab = (next: TrendTabId) => {
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      /* ignore */
    }
    if (requestedSeries.length > 0) setVisible(loadVisibleTrendSeries())
    setSearchParams({ tab: next }, { replace: true })
  }

  const toggleSeries = (id: TrendSeriesId) => {
    setVisible((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      saveVisibleTrendSeries(next)
      return next
    })
  }

  const tabLabel = TREND_TABS.find((entry) => entry.id === tab)?.label ?? 'Trends'

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

      <div className="trends-range" role="group" aria-label="Trend categories">
        {TREND_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`btn btn--compact${tab === entry.id ? ' settings-tab--active' : ''}`}
            aria-pressed={tab === entry.id}
            onClick={() => selectTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <section className="widget thermal-chart-card">
        <div className="thermal-chart-header">
          <h2 className="widget-title">{tabLabel}</h2>
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
          {tabSeries.map((series) => {
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
        {historyReady ? (
          <TrendsChart
            series={chartSeries}
            start={windowRange.start}
            end={windowRange.end}
            rangeLabel={trendRangeLabel(rangeDays)}
            zoneNames={zoneNames}
          />
        ) : (
          <div className="thermal-chart thermal-chart--empty" style={{ minHeight: 340 }}>
            Loading history…
          </div>
        )}
        {cisternRates ? (
          <div className="trends-cistern-rates widget-meta">
            <p>
              Cistern rising {formatPercentPerHour(cisternRates.risingPercentPerHour)}
              <span aria-hidden="true"> · </span>
              falling {formatPercentPerHour(cisternRates.fallingPercentPerHour)}
            </p>
            {cisternFullEtaLabel ? <p>Est. full {cisternFullEtaLabel}</p> : null}
          </div>
        ) : null}
        {poolHeaterAverage != null ? (
          <div className="trends-cistern-rates widget-meta">
            <p>
              Pool heater on {poolHeaterAverage.toFixed(1)}% of the time ·{' '}
              {trendRangeLabel(rangeDays)}
            </p>
          </div>
        ) : null}
      </section>
    </main>
  )
}
