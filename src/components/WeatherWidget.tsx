import { useHouse } from '../data/HouseContext'
import { weatherConditionSymbol } from '../ha/weather'

export function WeatherWidget() {
  const { weather, connectionStatus } = useHouse()

  const status =
    connectionStatus !== 'connected'
      ? 'Not connected'
      : weather
        ? 'Live'
        : 'No weather entity'

  const symbol = weather ? weatherConditionSymbol(weather.condition) : '◌'

  return (
    <article className="widget">
      <div className="widget-body">
        <div className="weather-header">
          <div>
            <div className="widget-title-row">
              <h2 className="widget-title">Weather</h2>
              {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
            </div>
          </div>
          <div className="weather-current" aria-hidden>
            <span className="weather-symbol">{symbol}</span>
            <span className="weather-temp">{weather?.temperatureLabel ?? '—'}</span>
          </div>
        </div>

        <p className="weather-condition">{weather?.conditionLabel ?? '—'}</p>

        <div className="energy-metrics energy-metrics--compact weather-metrics">
          <div className="energy-metric">
            <span className="energy-metric-label">High</span>
            <span className="energy-metric-value">{weather?.highLabel ?? '—'}</span>
          </div>
          <div className="energy-metric">
            <span className="energy-metric-label">Low</span>
            <span className="energy-metric-value">{weather?.lowLabel ?? '—'}</span>
          </div>
          <div className="energy-metric">
            <span className="energy-metric-label">Wind</span>
            <span className="energy-metric-value">{weather?.windLabel ?? '—'}</span>
          </div>
        </div>

        {weather && weather.forecast.length > 0 ? (
          <div className="weather-forecast" aria-label="5-day forecast">
            {weather.forecast.map((day, index) => (
              <div key={`${day.dayLabel}-${index}`} className="weather-forecast-day">
                <span className="weather-forecast-day-label">{day.dayLabel}</span>
                <span className="weather-forecast-temps">
                  {day.highLabel}
                  <span className="weather-forecast-sep"> / </span>
                  {day.lowLabel}
                </span>
                <span className="weather-forecast-rain">{day.rainLabel}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}
