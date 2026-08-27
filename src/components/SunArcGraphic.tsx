import { useEffect, useMemo, useState } from 'react'
import { sunArcCoordinates, type SunSnapshot } from '../ha/sunPosition'

type SunArcGraphicProps = {
  sun: SunSnapshot | null
}

export function SunArcGraphic({ sun }: SunArcGraphicProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const progress = useMemo(() => {
    if (!sun) return 0
    const span = sun.sunsetMs - sun.sunriseMs
    if (span <= 0) return sun.progress
    const next = (nowMs - sun.sunriseMs) / span
    if (!Number.isFinite(next)) return sun.progress
    return Math.max(0, Math.min(1, next))
  }, [nowMs, sun])

  const { x, y } = sunArcCoordinates(progress)

  return (
    <div className="sun-arc" aria-label="Sun path today">
      <svg viewBox="0 0 132 72" role="img" aria-hidden>
        <path
          className="sun-arc-path"
          d="M 20 54 A 46 46 0 0 1 112 54"
          fill="none"
        />
        <line className="sun-arc-horizon" x1="12" y1="54" x2="120" y2="54" />
        <circle className="sun-arc-dot" cx={x} cy={y} r="4.5" />
      </svg>
      <div className="sun-arc-times">
        <span className="sun-arc-time">{sun?.sunriseLabel ?? '—'}</span>
        <span className="sun-arc-time">{sun?.sunsetLabel ?? '—'}</span>
      </div>
      <div className="sun-arc-stats">
        <span className="sun-arc-stat">
          <span className="sun-arc-stat-label">El</span>
          {sun?.elevationLabel ?? '—'}
        </span>
        <span className="sun-arc-stat">
          <span className="sun-arc-stat-label">Az</span>
          {sun?.azimuthLabel ?? '—'}
        </span>
      </div>
    </div>
  )
}
