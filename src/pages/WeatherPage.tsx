import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { HaClient } from '../ha/client'
import { loadBaseUrl, loadToken } from '../ha/storage'
import {
  filterHourlyForTodayAndTomorrow,
  groupHourlyByDay,
  type HourlyWeatherDaySection,
} from '../ha/weather'

export function WeatherPage() {
  const { weather, connectionStatus } = useHouse()
  const [days, setDays] = useState<HourlyWeatherDaySection[]>([])
  const [status, setStatus] = useState('Loading hourly forecast…')

  const rangeLabel = useMemo(() => {
    const today = new Date()
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const fmt = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    return `${fmt.format(today)} – ${fmt.format(tomorrow)}`
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (connectionStatus !== 'connected') {
        setDays([])
        setStatus('Connect to Home Assistant to view hourly weather.')
        return
      }
      if (!weather?.entityId) {
        setDays([])
        setStatus('No weather entity available.')
        return
      }

      const token = loadToken()
      if (!token) {
        setDays([])
        setStatus('Home Assistant token missing.')
        return
      }

      setStatus('Loading hourly forecast…')
      try {
        const client = new HaClient(token, loadBaseUrl())
        const hourly = await client.getWeatherForecasts(weather.entityId, 'hourly')
        if (cancelled) return
        const filtered = filterHourlyForTodayAndTomorrow(hourly)
        const nextDays = groupHourlyByDay(filtered)
        const total = nextDays.reduce((sum, day) => sum + day.rows.length, 0)
        setDays(nextDays)
        setStatus(
          total > 0
            ? `${total} hour${total === 1 ? '' : 's'} · today and tomorrow`
            : 'No hourly forecast for today or tomorrow.',
        )
      } catch {
        if (cancelled) return
        setDays([])
        setStatus('Could not load hourly forecast.')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [connectionStatus, weather?.entityId])

  return (
    <main className="weather-page">
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Hourly weather</h1>
        <p>
          {rangeLabel}
          {weather ? ` · ${weather.conditionLabel} · ${weather.temperatureLabel}` : ''}
        </p>
      </header>

      <p className="weather-hourly-status">{status}</p>

      {days.map((day) => (
        <section key={day.key} className="widget weather-hourly-card">
          <header className="weather-hourly-day-header">
            <h2>{day.label}</h2>
            <span>{day.dateLabel}</span>
          </header>
          <div className="widget-body">
            <div
              className="weather-hourly"
              role="table"
              aria-label={`Hourly forecast for ${day.label}`}
            >
              <div className="weather-hourly-row weather-hourly-row--head" role="row">
                <span role="columnheader">Time</span>
                <span role="columnheader">Sky</span>
                <span role="columnheader">Temp</span>
                <span role="columnheader">Rain</span>
                <span role="columnheader">Wind</span>
              </div>
              {day.rows.map((row) => (
                <div key={row.key} className="weather-hourly-row" role="row">
                  <span className="weather-hourly-time" role="cell">
                    {row.timeLabel}
                  </span>
                  <span className="weather-hourly-sky" role="cell">
                    <span className="weather-hourly-symbol" aria-hidden>
                      {row.symbol}
                    </span>
                    <span className="weather-hourly-condition">{row.conditionLabel}</span>
                  </span>
                  <span className="weather-hourly-temp" role="cell">
                    {row.temperatureLabel}
                  </span>
                  <span className="weather-hourly-rain" role="cell">
                    {row.rainLabel}
                  </span>
                  <span className="weather-hourly-wind" role="cell">
                    {row.windLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </main>
  )
}
