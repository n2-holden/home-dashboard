import { AreasList } from '../components/AreasList'
import { ShedSolarWidget } from '../components/ShedSolarWidget'
import { ShadesOverviewWidget } from '../components/ShadesOverviewWidget'
import { SolarThermalOverviewWidget } from '../components/SolarOverviewWidget'

export function HomePage() {
  return (
    <main>
      <p className="page-lead">A few key pieces of the house, ready when you are.</p>
      <div className="stack">
        <ShadesOverviewWidget />
        <ShedSolarWidget />
        <SolarThermalOverviewWidget />
        <AreasList exclude={['shades', 'solar-thermal']} />
      </div>
    </main>
  )
}
