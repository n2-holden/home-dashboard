import { AreasList } from '../components/AreasList'
import { PondWidget } from '../components/PondWidget'
import { PoolWidget } from '../components/PoolWidget'
import { ShedSolarWidget } from '../components/ShedSolarWidget'
import { ShadesOverviewWidget } from '../components/ShadesOverviewWidget'
import { SolarThermalOverviewWidget } from '../components/SolarOverviewWidget'
import { WeatherWidget } from '../components/WeatherWidget'

export function HomePage() {
  return (
    <main>
      <p className="page-lead">A few key pieces of the house, ready when you are.</p>
      <div className="stack">
        <div className="home-top-row">
          <WeatherWidget />
          <ShadesOverviewWidget />
        </div>
        <ShedSolarWidget />
        <div className="home-thermal-row">
          <SolarThermalOverviewWidget />
          <PoolWidget />
          <PondWidget />
        </div>
        <AreasList exclude={['shades', 'solar-thermal']} />
      </div>
    </main>
  )
}
