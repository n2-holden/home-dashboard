import { Link } from 'react-router-dom'
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
            const avg =
              floorShades.reduce((sum, s) => sum + s.position, 0) /
              Math.max(floorShades.length, 1)
            return (
              <div key={floor.id} className="floor-preview-item">
                <span className="floor-preview-label">{floor.label}</span>
                <div className="shade-visual shade-visual--compact" aria-hidden="true">
                  <div
                    className="shade-visual-fill"
                    style={{ ['--closed' as string]: `${avg}%` }}
                  />
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
