import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'

function RaindropIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`irrigation-raindrop${active ? ' irrigation-raindrop--active' : ''}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C8 8 5 12 5 15.5a7 7 0 0 0 14 0C19 12 16 8 12 2z" />
    </svg>
  )
}

export function IrrigationWidget() {
  const { irrigation } = useHouse()
  const active = irrigation.anyActive
  const zoneCount = irrigation.zones.length
  const activeCount = irrigation.zones.filter((z) => z.active).length

  const summary =
    zoneCount === 0
      ? 'No zones found'
      : active
        ? `${activeCount} zone${activeCount !== 1 ? 's' : ''} running`
        : `${zoneCount} zone${zoneCount !== 1 ? 's' : ''} · idle`

  return (
    <article className="widget widget--interactive widget--compact">
      <Link className="widget-link" to="/irrigation">
        <div className="irrigation-widget-header">
          <h2 className="widget-title">Irrigation</h2>
          <RaindropIcon active={active} />
        </div>
        <p className={`widget-meta${active ? ' widget-meta--live' : ''}`}>{summary}</p>
      </Link>
    </article>
  )
}
