import { useHouse } from '../data/HouseContext'

export function PoolWidget() {
  const { pool, poolMap, connectionStatus } = useHouse()
  const mapped = Boolean(poolMap.temperature || poolMap.pumpRpm || poolMap.depth)
  const hasData = pool.temperatureF != null || pool.pumpRpm != null || pool.depthFt != null

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
          <div>
            <p className="widget-kicker">Pool</p>
            <h2 className="widget-title">Pool</h2>
            <p className="widget-meta">{status}</p>
          </div>
          <div className="energy-metric pool-temp-corner">
            <span className="energy-metric-label">Temperature</span>
            <span className="energy-metric-value">{pool.temperatureLabel}</span>
          </div>
        </div>

        <div className="energy-metrics energy-metrics--compact energy-metrics--pool">
          <div className="energy-metric">
            <span className="energy-metric-label">Pump</span>
            <span className="energy-metric-value">{pool.pumpRpmLabel}</span>
          </div>
          <div className="energy-metric">
            <span className="energy-metric-label">Depth</span>
            <span className="energy-metric-value">{pool.depthLabel}</span>
          </div>
        </div>
      </div>
    </article>
  )
}
