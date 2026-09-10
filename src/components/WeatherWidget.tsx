import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { DASHBOARD_CAMERAS } from '../ha/camera'
import { useCameraFeed } from '../hooks/useCameraFeed'
import { weatherConditionSymbol } from '../ha/weather'

const ROTATE_MS = 5_000

export function WeatherWidget() {
  const { weather, connectionStatus } = useHouse()
  const cameraEnabled = connectionStatus === 'connected'
  const [camIndex, setCamIndex] = useState(0)

  useEffect(() => {
    if (DASHBOARD_CAMERAS.length <= 1) return
    const id = window.setInterval(() => {
      setCamIndex((i) => (i + 1) % DASHBOARD_CAMERAS.length)
    }, ROTATE_MS)
    return () => window.clearInterval(id)
  }, [])

  const camera = DASHBOARD_CAMERAS[camIndex] ?? DASHBOARD_CAMERAS[0]
  // One still per camera change — no periodic refresh (that caused 1Hz flashing).
  const { url: feedUrl, isCurrent } = useCameraFeed(camera?.entityId ?? null, cameraEnabled, {
    mode: 'snapshot',
    snapshotRefreshMs: 0,
  })

  const [visibleUrl, setVisibleUrl] = useState<string | null>(null)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const [pendingReady, setPendingReady] = useState(false)

  useEffect(() => {
    if (!feedUrl || !isCurrent) return
    if (feedUrl === visibleUrl || feedUrl === pendingUrl) return
    if (!visibleUrl) {
      setVisibleUrl(feedUrl)
      return
    }
    setPendingReady(false)
    setPendingUrl(feedUrl)
  }, [feedUrl, isCurrent, visibleUrl, pendingUrl])

  function promotePending(url: string) {
    setPendingReady(true)
    // Let the new frame paint over the old one, then drop the old src.
    window.setTimeout(() => {
      setVisibleUrl(url)
      setPendingUrl(null)
      setPendingReady(false)
    }, 50)
  }

  const status =
    connectionStatus !== 'connected'
      ? 'Not connected'
      : weather
        ? 'Live'
        : 'No weather entity'

  const symbol = weather ? weatherConditionSymbol(weather.condition) : '—'

  return (
    <article className="widget">
      <div className="widget-body">
        <div className="weather-layout">
          <div className="weather-main">
            <div className="weather-main-top">
              <div className="widget-title-row">
                <h2 className="widget-title">Weather</h2>
                {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
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
          </div>

          <Link
            to="/cameras"
            className="weather-camera"
            aria-label={`${camera?.label ?? 'Camera'} — open Cameras`}
            title="Open Cameras"
          >
            {visibleUrl || pendingUrl ? (
              <div className="weather-camera-stack">
                {visibleUrl ? (
                  <img
                    key={`vis-${visibleUrl}`}
                    src={visibleUrl}
                    alt={`${camera?.label ?? 'Camera'} live view`}
                    className="weather-camera-img"
                  />
                ) : null}
                {pendingUrl ? (
                  <img
                    key={`pend-${pendingUrl}`}
                    src={pendingUrl}
                    alt=""
                    aria-hidden
                    className={`weather-camera-img weather-camera-img--pending${
                      pendingReady ? ' weather-camera-img--pending-ready' : ''
                    }`}
                    onLoad={() => promotePending(pendingUrl)}
                    onError={() => {
                      setPendingUrl(null)
                      setPendingReady(false)
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <div className="weather-camera-placeholder">
                {cameraEnabled ? 'Camera…' : 'No camera'}
              </div>
            )}
          </Link>
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
