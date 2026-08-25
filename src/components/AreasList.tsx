import { Link } from 'react-router-dom'
import { AREAS, type AreaMeta } from '../data/types'

function AreaLink({ area }: { area: AreaMeta }) {
  return (
    <article className={`widget ${area.ready ? 'widget--interactive' : ''}`}>
      <Link className="area-row" to={area.path}>
        <div>
          <h2 className="widget-title">{area.label}</h2>
          <p className="widget-meta">{area.blurb}</p>
        </div>
        <span className={`badge ${area.ready ? '' : 'badge--soon'}`}>
          {area.ready ? 'Open' : 'Soon'}
        </span>
      </Link>
    </article>
  )
}

export function AreasList({ exclude = [] }: { exclude?: string[] }) {
  const areas = AREAS.filter((area) => !exclude.includes(area.id))
  return (
    <div className="stack">
      {areas.map((area) => (
        <AreaLink key={area.id} area={area} />
      ))}
    </div>
  )
}
