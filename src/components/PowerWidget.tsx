import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { formatPower } from '../ha/energy'
import { fetchEgaugeLiveCache } from '../ha/egaugeLive'

const GAUGE_MAX_WATTS = 20_000

export function PowerWidget() {
  const { egauge } = useHouse()
  const [liveWatts, setLiveWatts] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const watts = await fetchEgaugeLiveCache()
      if (!cancelled && watts != null) setLiveWatts(watts)
    }
    void tick()
    const id = window.setInterval(() => void tick(), 1_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const watts = liveWatts ?? egauge.gridWatts
  const formatted = liveWatts != null ? formatPower(liveWatts) : egauge.gridFormatted
  const hasGrid = watts != null
  const exporting = (watts ?? 0) < 0
  const fillPct =
    watts == null ? 0 : Math.max(0, Math.min(100, (Math.abs(watts) / GAUGE_MAX_WATTS) * 100))

  return (
    <article className="widget widget--interactive widget--compact">
      <Link className="widget-link" to="/power">
        <h2 className="widget-title">House Power</h2>
        <p
          className={`power-widget-value${hasGrid ? '' : ' power-widget-value--empty'}${
            exporting ? ' power-widget-value--export' : ''
          }`}
        >
          {formatted}
        </p>
        <div className="power-widget-gauge">
          <div
            className="soc-bar"
            style={{ ['--soc' as string]: `${fillPct}%` }}
            role="meter"
            aria-label="House power"
            aria-valuemin={0}
            aria-valuemax={GAUGE_MAX_WATTS}
            aria-valuenow={watts == null ? undefined : Math.abs(watts)}
          >
            <div className="soc-bar-fill" />
          </div>
          <span className="power-widget-gauge-max">20 kW</span>
        </div>
      </Link>
    </article>
  )
}
