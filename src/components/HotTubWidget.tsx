import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { widgetHasCommOutage } from '../ha/deviceCommWidgets'
import { HaClient } from '../ha/client'
import {
  HOT_TUB_HOLD_MS,
  HOT_TUB_TEMPERATURE_ENTITY,
  hotTubDisplayReading,
  type HotTubSnapshot,
} from '../ha/hotTub'
import { loadBaseUrl, loadToken } from '../ha/storage'
import { parseNumericHistory } from '../ha/trends'
import { CommOutageIcon } from './CommOutageIcon'

export function HotTubWidget() {
  const { hotTub, deviceCommStatus, connectionStatus } = useHouse()
  const [now, setNow] = useState(() => Date.now())
  const [seed, setSeed] = useState<HotTubSnapshot | null>(null)
  const { temperatureF, stale, ageMs } = hotTubDisplayReading(
    hotTub.temperatureF == null && seed ? seed : hotTub,
    now,
  )
  const commOutage = widgetHasCommOutage(deviceCommStatus, 'hotTub')
  const needsSeed = hotTub.temperatureF == null && connectionStatus === 'connected'

  // Loaded while the sensor is offline: pick up the last reading from recorder history.
  useEffect(() => {
    if (!needsSeed || seed) return
    const token = loadToken()
    if (!token) return
    let cancelled = false
    const end = new Date()
    const start = new Date(end.getTime() - HOT_TUB_HOLD_MS)
    new HaClient(token, loadBaseUrl())
      .getEntitiesHistory([HOT_TUB_TEMPERATURE_ENTITY], start, end)
      .then((raw) => {
        const last = parseNumericHistory(raw, HOT_TUB_TEMPERATURE_ENTITY).at(-1)
        if (cancelled || !last) return
        setSeed({
          temperatureF: last.value,
          available: false,
          readingAtMs: Date.parse(last.timestamp),
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [needsSeed, seed])

  useEffect(() => {
    if (hotTub.available) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    setNow(Date.now())
    return () => window.clearInterval(id)
  }, [hotTub.available])

  const ageMin = ageMs == null ? 0 : Math.max(1, Math.round(ageMs / 60_000))

  return (
    <article className="widget widget--interactive widget--compact" style={{ position: 'relative' }}>
      {commOutage ? <CommOutageIcon className="comm-outage-icon--corner" /> : null}
      <Link className="widget-link" to="/trends?tab=hotTub">
        <h2 className="widget-title">Hot Tub</h2>
        <p
          className={`power-widget-value${temperatureF == null ? ' power-widget-value--empty' : ''}${
            stale ? ' hot-tub-value--stale' : ''
          }`}
          title={stale ? `Sensor offline · last reading ${ageMin} min ago` : undefined}
        >
          {temperatureF == null ? '—' : `${temperatureF.toFixed(1)}°F`}
          {stale ? <span className="hot-tub-age">{ageMin} min ago</span> : null}
        </p>
      </Link>
    </article>
  )
}
