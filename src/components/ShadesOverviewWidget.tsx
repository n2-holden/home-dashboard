import { Link } from 'react-router-dom'
import { floorDirectionStats } from '../data/shadeDirections'
import { useHouse } from '../data/HouseContext'
import { SHADE_FLOORS, shadeSummary, shadesForFloor } from '../data/types'

export function ShadesOverviewWidget() {
  const { shades } = useHouse()
  const summary = shadeSummary(shades)

  return (
    <article className="widget widget--interactive">
      <Link className="widget-link" to="/shades">
        <p className="widget-kicker">At a glance</p>
        <h2 className="widget-title">Window shades</h2>
        <p className="widget-meta">
          {shades.length} shades · {summary}
        </p>
        <div className="floor-preview">
          {SHADE_FLOORS.map((floor) => {
            const floorShades = shadesForFloor(shades, floor.id)
            const directionStats = floorDirectionStats(shades, floor.id)
            return (
              <div key={floor.id} className="floor-preview-item">
                <span className="floor-preview-label">{floor.label}</span>
                <div className="shade-compass" aria-hidden="true">
                  {directionStats.map((stat) => (
                    <div key={stat.direction} className="shade-compass-cell">
                      <div
                        className="shade-compass-box"
                        title={
                          stat.total > 0
                            ? `${stat.label}: ${stat.closed}/${stat.total} closed`
                            : `${stat.label}: no shades`
                        }
                      >
                        {stat.closedRatio > 0 ? (
                          <div
                            className="shade-compass-fill"
                            style={{ height: `${Math.round(stat.closedRatio * 100)}%` }}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <span className="floor-preview-meta">{shadeSummary(floorShades)}</span>
              </div>
            )
          })}
        </div>
      </Link>
    </article>
  )
}
