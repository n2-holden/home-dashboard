import { AreasList } from '../components/AreasList'
import { AudioWidget } from '../components/AudioWidget'
import { CalendarWidget } from '../components/CalendarWidget'
import { ConnectivityRail } from '../components/ConnectivityRail'
import { LightsWidget } from '../components/LightsWidget'
import { HotTubWidget } from '../components/HotTubWidget'
import { HvacWidget } from '../components/HvacWidget'
import { PondWidget } from '../components/PondWidget'
import { PoolWidget } from '../components/PoolWidget'
import { OutsideWidget } from '../components/OutsideWidget'
import { ShedSolarWidget } from '../components/ShedSolarWidget'
import { ShadesOverviewWidget } from '../components/ShadesOverviewWidget'
import { StockTickerWidget } from '../components/StockTickerWidget'
import { WeatherWidget } from '../components/WeatherWidget'
import { IrrigationWidget } from '../components/IrrigationWidget'
import { PowerWidget } from '../components/PowerWidget'

export function HomePage() {
  return (
    <main>
      <div className="stack">
        <div className="home-columns">
          <div className="home-column">
            <div className="home-top-row">
              <WeatherWidget />
              <div className="home-top-shades-rail">
                <ShadesOverviewWidget />
                <ConnectivityRail />
              </div>
            </div>
            <ShedSolarWidget />
            <div className="home-thermal-row">
              <PoolWidget />
              <PondWidget />
              <HvacWidget />
            </div>
          </div>
          <div className="home-column">
            <div className="home-outside-row">
              <div className="home-outside-main">
                <OutsideWidget />
                <LightsWidget />
              </div>
              <div className="home-outside-side">
                <HotTubWidget />
                <PowerWidget />
                <IrrigationWidget />
                <AudioWidget />
              </div>
            </div>
            <CalendarWidget />
            <AreasList exclude={['shades', 'solar-thermal', 'hvac', 'lights', 'cameras']} />
          </div>
        </div>
        <StockTickerWidget />
      </div>
    </main>
  )
}
