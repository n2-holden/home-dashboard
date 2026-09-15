import { useMemo } from 'react'
import { solarSystemTopViewFromDate } from '../ha/planetPosition'

type Props = {
  when: Date
  /** Observer longitude in degrees (east positive) — marks location on Earth. */
  longitudeDeg: number
}

/** View box ~25% larger than before; Earth radius stays the same. */
const SIZE = 275
const CX = SIZE / 2
const CY = SIZE / 2
const RING_COUNT = 8
const INNER_RING = 27.5
const RING_STEP = 13.75
const MOON_ORBIT = 11.25
const EARTH_RADIUS = 6.5
const DEG = Math.PI / 180

/** Brighter map colors where catalog swatches are too dark on the chart. */
const MAP_COLOR: Record<string, string> = {
  uranus: '#7eb6d9',
}

function ringRadius(ring: number): number {
  return INNER_RING + ring * RING_STEP
}

function polar(radius: number, longitudeDeg: number): { x: number; y: number } {
  const angle = longitudeDeg * DEG
  return {
    x: CX + radius * Math.cos(angle),
    y: CY - radius * Math.sin(angle),
  }
}

function normalizeLonDeg(value: number): number {
  return ((value % 360) + 360) % 360
}

/** Mean subsolar longitude (°E): noon on the meridian facing the Sun. */
function subsolarLongitudeDeg(when: Date): number {
  const utcHours =
    when.getUTCHours() + when.getUTCMinutes() / 60 + when.getUTCSeconds() / 3600
  return normalizeLonDeg(-15 * (utcHours - 12))
}

export function SolarSystemMap({ when, longitudeDeg }: Props) {
  const system = useMemo(() => solarSystemTopViewFromDate(when), [when])
  const earth = system.bodies.find((body) => body.id === 'earth')
  const earthPoint = earth ? polar(ringRadius(earth.ring), earth.longitudeDeg) : null
  const moonPoint =
    earthPoint != null
      ? {
          x: earthPoint.x + MOON_ORBIT * Math.cos(system.moonLongitudeDeg * DEG),
          y: earthPoint.y - MOON_ORBIT * Math.sin(system.moonLongitudeDeg * DEG),
        }
      : null

  const locationLine =
    earthPoint != null
      ? (() => {
          // Radius toward the Sun = local noon on the Earth disk (north-pole top view).
          const toSunX = CX - earthPoint.x
          const toSunY = CY - earthPoint.y
          const sunAngle = Math.atan2(-toSunY, toSunX)
          // East of the subsolar meridian is counterclockwise when viewed from north.
          const eastOfNoon =
            ((longitudeDeg - subsolarLongitudeDeg(when) + 540) % 360) - 180
          const angle = sunAngle + eastOfNoon * DEG
          return {
            x2: earthPoint.x + EARTH_RADIUS * Math.cos(angle),
            y2: earthPoint.y - EARTH_RADIUS * Math.sin(angle),
          }
        })()
      : null

  return (
    <div className="solar-system-map" aria-label="Solar system top view">
      <svg
        className="solar-system-map-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-hidden
      >
        {Array.from({ length: RING_COUNT }, (_, ring) => (
          <circle
            key={`orbit-${ring}`}
            className="solar-system-map-orbit"
            cx={CX}
            cy={CY}
            r={ringRadius(ring)}
          />
        ))}

        {earthPoint ? (
          <circle
            className="solar-system-map-moon-orbit"
            cx={earthPoint.x}
            cy={earthPoint.y}
            r={MOON_ORBIT}
          />
        ) : null}

        <circle className="solar-system-map-sun" cx={CX} cy={CY} r={7} />
        <text className="solar-system-map-label" x={CX} y={CY + 18} textAnchor="middle">
          Sun
        </text>

        {system.bodies.map((body) => {
          const radius = ringRadius(body.ring)
          const point = polar(radius, body.longitudeDeg)
          const label = polar(radius + 8, body.longitudeDeg)
          const color = MAP_COLOR[body.id] ?? body.color
          const bodyRadius = body.id === 'earth' ? EARTH_RADIUS : body.ring >= 4 ? 4 : 3.2
          return (
            <g key={body.id}>
              <circle
                className={body.id === 'earth' ? 'solar-system-map-earth' : undefined}
                cx={point.x}
                cy={point.y}
                r={bodyRadius}
                fill={color}
              />
              {body.id === 'earth' && locationLine ? (
                <line
                  className="solar-system-map-location"
                  x1={point.x}
                  y1={point.y}
                  x2={locationLine.x2}
                  y2={locationLine.y2}
                />
              ) : null}
              <text
                className="solar-system-map-label"
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {body.shortName}
              </text>
            </g>
          )
        })}

        {moonPoint ? (
          <g>
            <circle className="solar-system-map-moon" cx={moonPoint.x} cy={moonPoint.y} r={2.4} />
            <text
              className="solar-system-map-label solar-system-map-label--moon"
              x={moonPoint.x}
              y={moonPoint.y - 7}
              textAnchor="middle"
            >
              M
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  )
}
