import type { SensorReading } from '../../zynect/types'
import { formatRelativeTime } from '../../zynect/layout'

type Props = {
  reading: SensorReading
  color: string
  active?: boolean
}

export function CircularTempGauge({ reading, color, active = false }: Props) {
  const min = reading.minScale ?? 0
  const max = reading.maxScale ?? 200
  const span = max > min ? max - min : 1
  const ratio =
    reading.value == null ? 0 : Math.max(0, Math.min(1, (reading.value - min) / span))
  const fillPercent = `${ratio * 100}%`

  return (
    <article className={`thermal-gauge${active ? ' thermal-gauge--active' : ''}`}>
      <div className="thermal-gauge-body">
        <p className="thermal-gauge-label">{reading.name}</p>
        <p className="thermal-gauge-value">
          {reading.value == null ? '—' : reading.value.toFixed(1)}
          <span>{reading.unit || '°F'}</span>
        </p>
        <p className="thermal-gauge-meta">{formatRelativeTime(reading.lastUpdatedUtc)}</p>
        <BatteryPill percent={reading.batteryPercent} />
      </div>
      <div
        className="thermal-gauge-bar"
        role="meter"
        aria-label={`${reading.name} temperature`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={reading.value ?? undefined}
        title={`${min}–${max} ${reading.unit || '°F'}`}
      >
        <div
          className="thermal-gauge-bar-fill"
          style={{ height: fillPercent, background: color }}
        />
      </div>
    </article>
  )
}

function BatteryPill({ percent }: { percent: number | null }) {
  if (percent == null) {
    return <p className="thermal-battery thermal-battery--unknown">Battery —</p>
  }
  const tone = percent >= 50 ? 'ok' : percent >= 20 ? 'warn' : 'low'
  return (
    <p className={`thermal-battery thermal-battery--${tone}`} title={`Battery ${percent}%`}>
      <span className="thermal-battery-icon" style={{ ['--bat' as string]: `${percent}%` }} />
      {Math.round(percent)}%
    </p>
  )
}
