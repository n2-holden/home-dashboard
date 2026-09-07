import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { HaClient } from '../ha/client'
import { CISTERN_WATER_LEVEL_ENTITY } from '../ha/cistern'
import { formatTimeRemaining } from '../ha/irrigation'
import { loadBaseUrl, loadToken } from '../ha/storage'
import {
  TREND_WINDOW_HOURS,
  clipTrendPoints,
  computeIrrigationZonePeriodStats,
  formatCisternUsedPercent,
  formatDurationMs,
  loadLocalTrendHistory,
  mergeTrendPoints,
  parseNumericHistory,
  synthesizeIrrigationZoneHistory,
  trendChartWindow,
  type IrrigationZonePeriodStats,
  type TrendPoint,
} from '../ha/trends'

export function IrrigationPage() {
  const { irrigation, connectionStatus } = useHouse()
  const { zones } = irrigation
  const [statsByZone, setStatsByZone] = useState<Map<number, IrrigationZonePeriodStats>>(
    () => new Map(),
  )
  const [statsStatus, setStatsStatus] = useState('Loading 48h totals…')

  const zonesRef = useRef(zones)
  zonesRef.current = zones

  const zoneKey = useMemo(
    () => zones.map((zone) => `${zone.zoneNum}:${zone.entityId}`).join('|'),
    [zones],
  )

  const loadStats = useCallback(async () => {
    const zonesNow = zonesRef.current
    const range = trendChartWindow()
    const localIrrigation = loadLocalTrendHistory('irrigationZone')
    const localCistern = loadLocalTrendHistory('cistern')

    let irrigationPoints: TrendPoint[] = localIrrigation
    let cisternPoints: TrendPoint[] = localCistern

    const token = loadToken()
    if (token && connectionStatus === 'connected' && zonesNow.length > 0) {
      try {
        const client = new HaClient(token, loadBaseUrl())
        const [irrigationRaw, cisternRaw] = await Promise.all([
          client.getEntitiesHistory(
            zonesNow.map((zone) => zone.entityId),
            range.start,
            range.end,
          ),
          client.getEntitiesHistory(
            [CISTERN_WATER_LEVEL_ENTITY],
            range.start,
            range.end,
          ),
        ])
        irrigationPoints = mergeTrendPoints(
          synthesizeIrrigationZoneHistory(
            irrigationRaw,
            zonesNow.map((zone) => ({ entityId: zone.entityId, zoneNum: zone.zoneNum })),
          ),
          localIrrigation,
        )
        cisternPoints = mergeTrendPoints(
          parseNumericHistory(cisternRaw, CISTERN_WATER_LEVEL_ENTITY),
          localCistern,
        )
      } catch {
        /* keep local */
      }
    }

    const windowedIrrigation = clipTrendPoints(irrigationPoints, range.start, range.end)
    const windowedCistern = clipTrendPoints(cisternPoints, range.start, range.end)
    const next = computeIrrigationZonePeriodStats(
      windowedIrrigation,
      windowedCistern,
      range.start,
      range.end,
    )
    setStatsByZone(next)
    const runs = [...next.values()].reduce((sum, row) => sum + row.runCount, 0)
    setStatsStatus(
      runs > 0
        ? `Past ${TREND_WINDOW_HOURS}h · ${runs} zone run${runs === 1 ? '' : 's'}`
        : `No zone runs in the past ${TREND_WINDOW_HOURS}h yet`,
    )
  }, [connectionStatus, zoneKey])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header page-header--with-action">
        <div>
          <h1>Irrigation</h1>
          <p>Rain Bird zones · {statsStatus}</p>
        </div>
        <Link className="btn btn--compact" to="/trends">
          Trends
        </Link>
      </header>

      {zones.length === 0 ? (
        <p className="irrigation-empty">
          No Rain Bird zones found. Make sure the Rain Bird integration is configured in Home
          Assistant.
        </p>
      ) : (
        <div className="irrigation-zone-list">
          <div className="irrigation-zone-list-head" aria-hidden="true">
            <span />
            <span>Zone</span>
            <span className="irrigation-zone-stat-head">48h run</span>
            <span className="irrigation-zone-stat-head">Water</span>
            <span />
          </div>
          {zones.map((zone) => {
            const stats = statsByZone.get(zone.zoneNum)
            return (
              <div
                key={zone.entityId}
                className={`irrigation-zone-row${zone.active ? ' irrigation-zone-row--active' : ''}`}
              >
                <span className="irrigation-zone-num">{zone.zoneNum}</span>
                <span className="irrigation-zone-label">{zone.label}</span>
                <span className="irrigation-zone-stat">
                  {formatDurationMs(stats?.totalRunMs ?? 0)}
                </span>
                <span className="irrigation-zone-stat">
                  {formatCisternUsedPercent(stats?.waterUsedPercent ?? null)}
                </span>
                <span className="irrigation-zone-status-col">
                  {zone.active ? (
                    <>
                      <span className="irrigation-zone-badge irrigation-zone-badge--running">
                        Running
                      </span>
                      {zone.timeRemaining != null && zone.timeRemaining > 0 && (
                        <span className="irrigation-zone-remaining">
                          {formatTimeRemaining(zone.timeRemaining)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="irrigation-zone-badge irrigation-zone-badge--idle">Idle</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
