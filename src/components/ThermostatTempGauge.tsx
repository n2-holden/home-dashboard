type ThermostatTempGaugeProps = {
  value: number | null
  min?: number
  max?: number
  heating?: boolean
  cooling?: boolean
}

const WIDTH = 100
const HEIGHT = 62
const STROKE = 6
const RADIUS = 40
const CX = WIDTH / 2
const CY = HEIGHT - 6
const ARC_LENGTH = Math.PI * RADIUS
const ARC_PATH = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`

export function ThermostatTempGauge({
  value,
  min = 50,
  max = 90,
  heating = false,
  cooling = false,
}: ThermostatTempGaugeProps) {
  const span = max > min ? max - min : 1
  const ratio =
    value == null ? 0 : Math.max(0, Math.min(1, (value - min) / span))
  const filled = ratio * ARC_LENGTH
  const accent = heating ? '#e05b55' : cooling ? '#5b9fe0' : 'var(--accent)'
  const modifier = heating
    ? ' thermostat-temp-gauge--heating'
    : cooling
      ? ' thermostat-temp-gauge--cooling'
      : ''

  return (
    <div className={`thermostat-temp-gauge${modifier}`} aria-hidden>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="thermostat-temp-gauge-svg"
        role="meter"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
      >
        <path
          className="thermostat-temp-gauge-track"
          d={ARC_PATH}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        <path
          className="thermostat-temp-gauge-fill"
          d={ARC_PATH}
          fill="none"
          stroke={accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={ARC_LENGTH}
          strokeDasharray={`${filled} ${ARC_LENGTH - filled}`}
          strokeDashoffset={0}
        />
      </svg>
      <span className="thermostat-temp-gauge-value">
        {value == null ? '—' : Math.round(value)}
        <span className="thermostat-temp-gauge-unit">°</span>
      </span>
    </div>
  )
}
