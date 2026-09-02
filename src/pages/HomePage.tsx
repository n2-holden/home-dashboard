import { AreasList } from '../components/AreasList'
import { LightsWidget } from '../components/LightsWidget'
import { HvacWidget } from '../components/HvacWidget'
import { PondWidget } from '../components/PondWidget'
import { PoolWidget } from '../components/PoolWidget'
import { OutsideWidget } from '../components/OutsideWidget'
import { ShedSolarWidget } from '../components/ShedSolarWidget'
import { ShadesOverviewWidget } from '../components/ShadesOverviewWidget'
import { WeatherWidget } from '../components/WeatherWidget'

export function HomePage() {
  return (
    <main>
      <div className="stack">
        <div className="home-top-row">
          <WeatherWidget />
          <ShadesOverviewWidget />
        </div>
        <ShedSolarWidget />
        <div className="home-thermal-row">
          <PoolWidget />
          <PondWidget />
          <HvacWidget />
        </div>
        <OutsideWidget />
        <LightsWidget />
        <AreasList exclude={['shades', 'solar-thermal', 'hvac', 'lights']} />
      </div>
    </main>
  )
}
