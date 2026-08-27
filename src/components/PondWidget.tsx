import { useHouse } from '../data/HouseContext'

export function PondWidget() {
  const { pond, pondMap, connectionStatus } = useHouse()
  const mapped = Boolean(pondMap.level || pondMap.depth)
  const hasData = pond.levelPercent != null || pond.depthFt != null

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
            <p className="widget-kicker">Tuya</p>
            <h2 className="widget-title">Pond</h2>
            <p className="widget-meta">{status}</p>
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
