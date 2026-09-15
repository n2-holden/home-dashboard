import { useEffect, useMemo, useRef, useState } from 'react'
import { moonSnapshotFromDate } from '../ha/moonPosition'
import { planetsSnapshotFromDate } from '../ha/planetPosition'
import {
  azimuthGridSegments,
  cardinalLabel,
  createSkyProjector,
  elevationGridSegments,
  pathSegmentsToSvg,
  pointsToSvgPath,
  type SkyPoint,
  type SkyProjector,
} from '../ha/skyChart'
import { CONSTELLATION_EDGES, CONSTELLATIONS } from '../ha/constellations'
import { starsSnapshotFromDate, type StarSkyPosition } from '../ha/stars'
import type { SunSnapshot } from '../ha/sunPosition'
import { solarAzimuthDegrees, solarElevationDegrees } from '../zynect/solarPosition'
import { SolarSystemMap } from './SolarSystemMap'

type Props = {
  sun: SunSnapshot | null
  /** Facing direction in degrees (0=N, 90=E, 180=S, 270=W). */
  viewDirectionDeg: number
  /** Instant used for body markers; paths use that local calendar day. */
  viewWhen: Date
  showStars?: boolean
  showStarLabels?: boolean
  showConstellationLines?: boolean
  showConstellationLabels?: boolean
}

type BodyMark = {
  id: string
  name: string
  color: string
  className: string
  radius: number
  point: SkyPoint
  azimuthLabel: string
  elevationLabel: string
}

const SAMPLE_MINUTES = 15
const DAY_SKY = {
  top: '#1a3358',
  mid: '#2f5f8f',
  bottom: '#7fa8c9',
} as const

export function SkyChartView({
  sun,
  viewDirectionDeg,
  viewWhen,
  showStars = false,
  showStarLabels = false,
  showConstellationLines = false,
  showConstellationLabels = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fixed angular width so rotating the view does not stretch/compress the sky.
  const hRangeDeg = 90

  const projector = useMemo(
    () =>
      createSkyProjector({
        width: size.width,
        height: size.height,
        viewDirectionDeg,
        hRangeDeg,
      }),
    [size.height, size.width, viewDirectionDeg],
  )

  const scene = useMemo(() => {
    if (!projector || !sun) return null
    return buildScene(
      projector,
      sun,
      viewWhen,
      showStars,
      showConstellationLines,
      showConstellationLabels,
    )
  }, [projector, showConstellationLabels, showConstellationLines, showStars, sun, viewWhen])

  const skyColors = useMemo(() => {
    const sunEl = sun
      ? solarElevationDegrees(viewWhen, sun.latitudeDeg, sun.longitudeDeg)
      : 0
    return skyColorsForSunElevation(sunEl)
  }, [sun, viewWhen])

  return (
    <div className="sky-chart" aria-label="Sky view azimuthal projection">
      <div ref={wrapRef} className="sky-chart-canvas">
        {scene && projector ? (
          <svg
            className="sky-chart-svg"
            viewBox={`0 0 ${projector.width} ${projector.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-hidden
          >
            <defs>
              <linearGradient id="sky-chart-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={skyColors.top} />
                <stop offset="55%" stopColor={skyColors.mid} />
                <stop offset="100%" stopColor={skyColors.bottom} />
              </linearGradient>
            </defs>

            <rect
              className="sky-chart-sky-fill"
              x="0"
              y="0"
              width={projector.width}
              height={projector.height}
              fill="url(#sky-chart-sky)"
            />

            {scene.azimuthLines.map((d, index) => (
              <path key={`az-${index}`} className="sky-chart-grid" d={d} />
            ))}
            {scene.elevationLines.map((line) => (
              <path key={`el-${line.elevation}`} className="sky-chart-grid sky-chart-grid--el" d={line.d} />
            ))}

            {scene.horizonPath ? (
              <path className="sky-chart-horizon" d={scene.horizonPath} />
            ) : null}

            {scene.sunPaths.map((d, index) => (
              <path key={`sun-path-${index}`} className="sky-chart-sun-path" d={d} />
            ))}
            {scene.moonPaths.map((d, index) => (
              <path key={`moon-path-${index}`} className="sky-chart-moon-path" d={d} />
            ))}

            {scene.constellationLines.map((line, index) => (
              <line
                key={`constellation-${index}`}
                className="sky-chart-constellation"
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
              />
            ))}

            {scene.constellationLabels.map((label) => (
              <text
                key={`constellation-label-${label.name}`}
                className="sky-chart-constellation-label"
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {label.name}
              </text>
            ))}

            {scene.stars.map((star) => (
              <g key={`star-${star.name}`} className="sky-chart-star">
                {star.kind === 'galaxy' && star.rx != null && star.ry != null ? (
                  <ellipse
                    className="sky-chart-galaxy"
                    cx={star.point.x}
                    cy={star.point.y}
                    rx={star.rx}
                    ry={star.ry}
                    transform={`rotate(${star.rotationDeg ?? 0} ${star.point.x} ${star.point.y})`}
                    fill={`rgba(210, 220, 255, ${star.opacity * 0.35})`}
                    stroke={`rgba(230, 238, 255, ${star.opacity})`}
                    strokeWidth={1}
                  />
                ) : (
                  <circle
                    cx={star.point.x}
                    cy={star.point.y}
                    r={star.radius}
                    fill={`rgba(255, 255, 255, ${star.opacity})`}
                  />
                )}
                {showStarLabels && star.showLabel ? (
                  <text
                    className="sky-chart-star-label"
                    x={star.point.x}
                    y={
                      star.point.y -
                      (star.kind === 'galaxy' ? (star.ry ?? star.radius) : star.radius) -
                      4
                    }
                    textAnchor="middle"
                  >
                    {star.name}
                  </text>
                ) : null}
              </g>
            ))}

            {scene.bodies.map((body) => (
              <g key={body.id} className="sky-chart-body">
                <circle
                  className={body.className}
                  cx={body.point.x}
                  cy={body.point.y}
                  r={body.radius}
                  fill={body.color}
                />
                <text
                  className="sky-chart-body-label"
                  x={body.point.x}
                  y={body.point.y - body.radius - 6}
                  textAnchor="middle"
                >
                  {body.name}
                </text>
              </g>
            ))}

            {scene.elevationLabels.map((label) => (
              <text
                key={`el-label-${label.text}`}
                className="sky-chart-el-label"
                x={label.x}
                y={label.y}
                textAnchor="start"
                dominantBaseline="middle"
              >
                {label.text}
              </text>
            ))}

            {scene.azimuthLabels.map((label) => (
              <text
                key={`az-label-${label.text}-${label.x}`}
                className={`sky-chart-az-label${label.cardinal ? ' sky-chart-az-label--cardinal' : ''}`}
                x={label.x}
                y={projector.height - 10}
                textAnchor="middle"
              >
                {label.text}
              </text>
            ))}
          </svg>
        ) : (
          <div className="sky-chart-empty">
            {sun ? 'Preparing sky view…' : 'Sun position unavailable'}
          </div>
        )}
      </div>

      {scene && sun ? (
        <div className="sky-chart-footer">
          <div className="sky-chart-side">
            <div className="sky-chart-legend" role="table" aria-label="Sky objects">
              <div className="sky-chart-legend-row sky-chart-legend-row--head" role="row">
                <span className="sky-chart-legend-name" role="columnheader" />
                <span className="sky-chart-legend-colhead" role="columnheader">
                  Azimuth
                </span>
                <span className="sky-chart-legend-colhead" role="columnheader">
                  Elevation
                </span>
              </div>
              <LegendRow
                name="Sun"
                color="#ff6a1a"
                swatchClass="sky-chart-legend-swatch--sun"
                azimuthLabel={scene.legend.sun.azimuthLabel}
                elevationLabel={scene.legend.sun.elevationLabel}
                belowHorizon={scene.legend.sun.belowHorizon}
              />
              <LegendRow
                name="Moon"
                color="#d9dee7"
                swatchClass="sky-chart-legend-swatch--moon"
                azimuthLabel={scene.legend.moon.azimuthLabel}
                elevationLabel={scene.legend.moon.elevationLabel}
                belowHorizon={scene.legend.moon.belowHorizon}
              />
              {scene.legend.moon.phaseLabel ? (
                <div className="sky-chart-legend-section" role="row">
                  <span className="sky-chart-legend-phase">{scene.legend.moon.phaseLabel}</span>
                </div>
              ) : null}
              <div className="sky-chart-legend-section" role="row">
                <span className="sky-chart-legend-title">Planets</span>
              </div>
              {scene.legend.planets.map((planet) => (
                <LegendRow
                  key={planet.id}
                  name={planet.name}
                  color={planet.color}
                  azimuthLabel={planet.azimuthLabel}
                  elevationLabel={planet.elevationLabel}
                  belowHorizon={planet.belowHorizon}
                />
              ))}
            </div>
            {showStars ? <StarsInViewPanel stars={scene.stars} /> : null}
          </div>
          <SolarSystemMap when={viewWhen} longitudeDeg={sun.longitudeDeg} />
        </div>
      ) : null}
    </div>
  )
}

/** Day sky → black as sun elevation goes from +5° to −5°. */
function skyColorsForSunElevation(sunElevationDeg: number): {
  top: string
  mid: string
  bottom: string
} {
  const night = clamp01((-sunElevationDeg + 5) / 10)
  return {
    top: mixHex(DAY_SKY.top, '#000000', night),
    mid: mixHex(DAY_SKY.mid, '#000000', night),
    bottom: mixHex(DAY_SKY.bottom, '#000000', night),
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function mixHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  if (!a || !b) return from
  const u = clamp01(t)
  const r = Math.round(a.r + (b.r - a.r) * u)
  const g = Math.round(a.g + (b.g - a.g) * u)
  const bl = Math.round(a.b + (b.b - a.b) * u)
  return `rgb(${r}, ${g}, ${bl})`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function buildScene(
  projector: SkyProjector,
  sun: SunSnapshot,
  when: Date,
  showStars: boolean,
  showConstellationLines: boolean,
  showConstellationLabels: boolean,
) {
  const azDiv = 6
  const azStep = projector.hRangeDeg / azDiv
  const azimuthLines: string[] = []
  const azimuthLabels: Array<{ text: string; x: number; cardinal: boolean }> = []

  for (
    let az = projector.viewDirectionDeg - projector.hRangeDeg;
    az <= projector.viewDirectionDeg + projector.hRangeDeg + 1e-6;
    az += azStep
  ) {
    const d = pointsToSvgPath(azimuthGridSegments(projector, az))
    if (d) azimuthLines.push(d)
    const horizon = projector.toScreen(az, 0)
    if (horizon) {
      const cardinal = cardinalLabel(az)
      azimuthLabels.push({
        text: cardinal ?? `${Math.round(((az % 360) + 360) % 360)}°`,
        x: horizon.x,
        cardinal: cardinal != null,
      })
    }
  }

  const elevationLines: Array<{ elevation: number; d: string }> = []
  const elevationLabels: Array<{ text: string; x: number; y: number }> = []
  for (let el = 10; el <= projector.vRangeDeg; el += 10) {
    const d = pointsToSvgPath(elevationGridSegments(projector, el))
    if (d) elevationLines.push({ elevation: el, d })
    const labelPoint =
      projector.toScreen(projector.viewDirectionDeg - projector.hRangeDeg * 0.82, el) ??
      projector.toScreen(projector.viewDirectionDeg, el)
    if (labelPoint) {
      elevationLabels.push({
        text: `${el}°`,
        x: labelPoint.x + 4,
        y: labelPoint.y,
      })
    }
  }

  const horizonPath = pointsToSvgPath(elevationGridSegments(projector, 0, 1))
  const maxJump = projector.width / 10

  const sunSamples = sampleDayPath(when, sun.latitudeDeg, sun.longitudeDeg, 'sun')
  // Moon overnight arcs cross midnight — sample neighboring hours so the path stays continuous.
  const moonSamples = sampleMoonPath(when, sun.latitudeDeg, sun.longitudeDeg)

  const sunPaths = pathSegmentsToSvg(projectPathSamples(projector, sunSamples), maxJump)
  const moonPaths = pathSegmentsToSvg(projectPathSamples(projector, moonSamples), maxJump)

  const sunEl = solarElevationDegrees(when, sun.latitudeDeg, sun.longitudeDeg)
  const sunAz = solarAzimuthDegrees(when, sun.latitudeDeg, sun.longitudeDeg)
  const moon = moonSnapshotFromDate(when, sun.latitudeDeg, sun.longitudeDeg)
  const planets = planetsSnapshotFromDate(when, sun.latitudeDeg, sun.longitudeDeg)

  const bodies: BodyMark[] = []
  const pushBody = (
    id: string,
    name: string,
    color: string,
    className: string,
    radius: number,
    azimuth: number,
    elevation: number,
    azimuthLabel: string,
    elevationLabel: string,
  ) => {
    if (elevation <= 0) return
    const point = projector.toScreen(azimuth, elevation)
    if (!point) return
    bodies.push({
      id,
      name,
      color,
      className,
      radius,
      point,
      azimuthLabel,
      elevationLabel,
    })
  }

  for (const planet of planets) {
    pushBody(
      planet.id,
      planet.name,
      planet.color,
      'sky-chart-planet',
      4,
      planet.azimuth,
      planet.elevation,
      planet.azimuthLabel,
      planet.elevationLabel,
    )
  }

  pushBody(
    'moon',
    'Moon',
    '#d9dee7',
    'sky-chart-moon',
    7,
    moon.azimuth,
    moon.elevation,
    moon.azimuthLabel,
    moon.elevationLabel,
  )
  pushBody(
    'sun',
    'Sun',
    '#ff6a1a',
    'sky-chart-sun',
    10,
    sunAz,
    sunEl,
    `${Math.round(sunAz)}°`,
    `${sunEl.toFixed(1)}°`,
  )

  const legend = {
    sun: {
      azimuthLabel: `${Math.round(sunAz)}°`,
      elevationLabel: `${sunEl.toFixed(1)}°`,
      belowHorizon: sunEl <= 0,
    },
    moon: {
      azimuthLabel: moon.azimuthLabel,
      elevationLabel: moon.elevationLabel,
      phaseLabel: moon.phaseLabel,
      belowHorizon: moon.elevation <= 0,
    },
    planets: planets.map((planet) => ({
      id: planet.id,
      name: planet.name,
      color: planet.color,
      azimuthLabel: planet.azimuthLabel,
      elevationLabel: planet.elevationLabel,
      belowHorizon: planet.elevation <= 0,
    })),
  }

  const stars: Array<StarSkyPosition & { point: SkyPoint }> = []
  const constellationLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  const constellationLabels: Array<{ name: string; x: number; y: number }> = []
  if (showStars) {
    const byName = new Map<string, StarSkyPosition & { point: SkyPoint }>()
    for (const star of starsSnapshotFromDate(when, sun.latitudeDeg, sun.longitudeDeg)) {
      if (!star.aboveHorizon) continue
      const point = projector.toScreen(star.azimuth, star.elevation)
      if (!point) continue
      const placed = { ...star, point }
      stars.push(placed)
      byName.set(star.name, placed)
    }

    if (showConstellationLines) {
      for (const [aName, bName] of CONSTELLATION_EDGES) {
        const a = byName.get(aName)
        const b = byName.get(bName)
        if (!a || !b) continue
        constellationLines.push({
          x1: a.point.x,
          y1: a.point.y,
          x2: b.point.x,
          y2: b.point.y,
        })
      }
    }

    if (showConstellationLabels) {
      for (const constellation of CONSTELLATIONS) {
        const members = new Set<string>()
        for (const [a, b] of constellation.edges) {
          members.add(a)
          members.add(b)
        }
        let sumX = 0
        let sumY = 0
        let count = 0
        for (const name of members) {
          const star = byName.get(name)
          if (!star) continue
          sumX += star.point.x
          sumY += star.point.y
          count += 1
        }
        if (count < 2) continue
        constellationLabels.push({
          name: constellation.name,
          x: sumX / count,
          y: sumY / count,
        })
      }
    }
  }

  return {
    azimuthLines,
    elevationLines,
    elevationLabels,
    horizonPath,
    sunPaths,
    moonPaths,
    bodies,
    stars,
    constellationLines,
    constellationLabels,
    azimuthLabels,
    legend,
  }
}

function LegendRow({
  name,
  color,
  swatchClass,
  azimuthLabel,
  elevationLabel,
  belowHorizon,
}: {
  name: string
  color: string
  swatchClass?: string
  azimuthLabel: string
  elevationLabel: string
  belowHorizon: boolean
}) {
  return (
    <div
      className={`sky-chart-legend-row${belowHorizon ? ' sky-chart-legend-row--below' : ''}`}
      role="row"
    >
      <span className="sky-chart-legend-name sky-chart-legend-body" role="rowheader">
        <span
          className={`sky-chart-legend-swatch${swatchClass ? ` ${swatchClass}` : ''}`}
          style={swatchClass ? undefined : { background: color }}
          aria-hidden
        />
        {name}
      </span>
      <span className="sky-chart-legend-value" role="cell">
        {azimuthLabel}
      </span>
      <span className="sky-chart-legend-value" role="cell">
        {elevationLabel}
      </span>
    </div>
  )
}

const STAR_ROW_HEIGHT_PX = 18.4

function StarsInViewPanel({ stars }: { stars: Array<StarSkyPosition & { point: SkyPoint }> }) {
  const listRef = useRef<HTMLUListElement>(null)
  const [maxRows, setMaxRows] = useState(0)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const update = () => {
      setMaxRows(Math.max(0, Math.floor(el.clientHeight / STAR_ROW_HEIGHT_PX)))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ranked = useMemo(
    () => [...stars].sort((a, b) => a.magnitude - b.magnitude),
    [stars],
  )
  const visible = ranked.slice(0, maxRows)

  return (
    <div className="sky-chart-stars-panel" aria-label="Brightest stars in view">
      <h3 className="sky-chart-stars-panel-title">Stars in view</h3>
      <ul className="sky-chart-stars-list" ref={listRef}>
        {visible.length === 0 ? (
          <li className="sky-chart-stars-empty">
            {stars.length === 0 ? 'None above horizon in this view' : null}
          </li>
        ) : (
          visible.map((star) => (
            <li key={star.name} className="sky-chart-stars-row">
              {star.kind === 'galaxy' ? (
                <span
                  className="sky-chart-stars-galaxy"
                  style={{ opacity: star.opacity }}
                  aria-hidden
                />
              ) : (
                <span
                  className="sky-chart-stars-dot"
                  style={{ opacity: star.opacity }}
                  aria-hidden
                />
              )}
              <span className="sky-chart-stars-name">{star.name}</span>
              <span className="sky-chart-stars-mag">{star.magnitude.toFixed(1)}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

function projectPathSamples(
  projector: SkyProjector,
  samples: Array<{ azimuth: number; elevation: number; minute: number }>,
): Array<SkyPoint | null> {
  const points: Array<SkyPoint | null> = []
  let lastMinute: number | null = null
  for (const sample of samples) {
    if (lastMinute != null && sample.minute - lastMinute > SAMPLE_MINUTES + 1) {
      points.push(null)
    }
    // Use unclipped projection so mid-sky arcs aren't punched out by the disk test.
    points.push(projector.toScreenUnclipped(sample.azimuth, sample.elevation))
    lastMinute = sample.minute
  }
  return points
}

function sampleDayPath(
  when: Date,
  latitudeDeg: number,
  longitudeDeg: number,
  body: 'sun' | 'moon',
): Array<{ azimuth: number; elevation: number; minute: number }> {
  const dayStart = new Date(when.getTime())
  dayStart.setHours(0, 0, 0, 0)
  const samples: Array<{ azimuth: number; elevation: number; minute: number }> = []
  for (let minute = 0; minute < 24 * 60; minute += SAMPLE_MINUTES) {
    const sampleAt = new Date(dayStart.getTime() + minute * 60_000)
    if (body === 'sun') {
      const elevation = solarElevationDegrees(sampleAt, latitudeDeg, longitudeDeg)
      if (elevation <= 0) continue
      samples.push({
        minute,
        azimuth: solarAzimuthDegrees(sampleAt, latitudeDeg, longitudeDeg),
        elevation,
      })
    } else {
      const moon = moonSnapshotFromDate(sampleAt, latitudeDeg, longitudeDeg)
      if (moon.elevation <= 0) continue
      samples.push({ minute, azimuth: moon.azimuth, elevation: moon.elevation })
    }
  }
  return samples
}

/**
 * Moon tracks often cross local midnight. Sample neighboring hours for continuity,
 * then keep a single above-horizon session: the one containing the selected time,
 * otherwise the nearest session that overlaps the selected day.
 */
function sampleMoonPath(
  when: Date,
  latitudeDeg: number,
  longitudeDeg: number,
): Array<{ azimuth: number; elevation: number; minute: number }> {
  const dayStart = new Date(when.getTime())
  dayStart.setHours(0, 0, 0, 0)
  const dayStartMs = dayStart.getTime()
  const dayEndMs = dayStartMs + 24 * 60 * 60_000
  const viewMs = when.getTime()
  const windowStart = new Date(dayStartMs - 12 * 60 * 60_000)
  const windowMinutes = 48 * 60

  type Timed = { minute: number; azimuth: number; elevation: number; atMs: number }
  const raw: Timed[] = []
  for (let minute = 0; minute < windowMinutes; minute += SAMPLE_MINUTES) {
    const sampleAt = new Date(windowStart.getTime() + minute * 60_000)
    const moon = moonSnapshotFromDate(sampleAt, latitudeDeg, longitudeDeg)
    if (moon.elevation <= 0) continue
    raw.push({
      minute,
      azimuth: moon.azimuth,
      elevation: moon.elevation,
      atMs: sampleAt.getTime(),
    })
  }

  const sessions: Timed[][] = []
  let current: Timed[] = []
  let lastMinute: number | null = null
  for (const sample of raw) {
    if (lastMinute != null && sample.minute - lastMinute > SAMPLE_MINUTES + 1) {
      if (current.length) sessions.push(current)
      current = []
    }
    current.push(sample)
    lastMinute = sample.minute
  }
  if (current.length) sessions.push(current)

  const daySessions = sessions.filter((session) =>
    session.some((sample) => sample.atMs >= dayStartMs && sample.atMs < dayEndMs),
  )
  if (daySessions.length === 0) return []

  const containing = daySessions.find((session) => {
    const start = session[0].atMs - SAMPLE_MINUTES * 60_000
    const end = session[session.length - 1].atMs + SAMPLE_MINUTES * 60_000
    return viewMs >= start && viewMs <= end
  })

  const chosen =
    containing ??
    daySessions
      .map((session) => {
        const start = session[0].atMs
        const end = session[session.length - 1].atMs
        const dist =
          viewMs < start ? start - viewMs : viewMs > end ? viewMs - end : 0
        return { session, dist }
      })
      .sort((a, b) => a.dist - b.dist)[0]?.session

  if (!chosen) return []
  return chosen.map(({ minute, azimuth, elevation }) => ({ minute, azimuth, elevation }))
}
