import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { widgetHasCommOutage } from '../ha/deviceCommWidgets'
import { CommOutageIcon } from './CommOutageIcon'

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
  const { irrigation, deviceCommStatus } = useHouse()
  const active = irrigation.anyActive
  const zoneCount = irrigation.zones.length
  const activeZones = irrigation.zones.filter((z) => z.active)
  const activeCount = activeZones.length
  const commOutage = widgetHasCommOutage(deviceCommStatus, 'irrigation')

  const summary =
    zoneCount === 0
      ? 'No zones found'
      : active
        ? activeCount === 1
          ? activeZones[0].label
          : `${activeCount} zones running`
        : `${zoneCount} zone${zoneCount !== 1 ? 's' : ''} · idle`

  return (
    <article className="widget widget--interactive widget--compact" style={{ position: 'relative' }}>
      {commOutage ? <CommOutageIcon className="comm-outage-icon--corner" /> : null}
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
