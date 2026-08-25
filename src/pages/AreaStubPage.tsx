import { Link } from 'react-router-dom'
import type { AreaId } from '../data/types'
import { AREAS } from '../data/types'

const COPY: Record<AreaId, { title: string; body: string }> = {
  hvac: {
    title: 'HVAC',
    body: 'Climate controls will live here — setpoints, modes, and room temps once you wire them up.',
  },
  lights: {
    title: 'Lights',
    body: 'Scenes and room lights will land here next. Use this stub as the drill-down target for now.',
  },
  shades: {
    title: 'Shades',
    body: 'Shade controls are on their own page.',
  },
  'solar-thermal': {
    title: 'Solar Thermal',
    body: 'Zynect temps, heating mode, and history live on the Solar Thermal page.',
  },
}

export function AreaStubPage({ area }: { area: AreaId }) {
  const meta = AREAS.find((item) => item.id === area)
  const copy = COPY[area]

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>{copy.title}</h1>
        <p>{meta?.blurb}</p>
      </header>
      <article className="widget stub">
        <p className="widget-kicker">Coming soon</p>
        <h2 className="widget-title">Ready for wiring</h2>
        <p>{copy.body}</p>
      </article>
    </main>
  )
}
