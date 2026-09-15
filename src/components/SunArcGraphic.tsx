import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { moonArcCoordinates, moonSnapshotFromDate } from '../ha/moonPosition'
import {
  planetArcCoordinates,
  planetsSnapshotFromDate,
  skyArcProgressFromAzimuth,
  type PlanetSnapshot,
} from '../ha/planetPosition'
import { sunArcCoordinates, type SunSnapshot } from '../ha/sunPosition'
import { solarAzimuthDegrees, solarElevationDegrees } from '../zynect/solarPosition'

type SunArcGraphicProps = {
  sun: SunSnapshot | null
}

type TooltipCoords = {
  top: number
  right: number
}

export function SunArcGraphic({ sun }: SunArcGraphicProps) {
  const tooltipId = useId()
  const wrapRef = useRef<HTMLAnchorElement>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const [tooltipCoords, setTooltipCoords] = useState<TooltipCoords | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useLayoutEffect(() => {
    if (!tooltipOpen) {
      setTooltipCoords(null)
      return
    }

    const update = () => {
      const wrap = wrapRef.current
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()
      setTooltipCoords({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [tooltipOpen])

  const progress = useMemo(() => {
    if (!sun) return 0
    const span = sun.sunsetMs - sun.sunriseMs
    if (span <= 0) return sun.progress
    const next = (nowMs - sun.sunriseMs) / span
    if (!Number.isFinite(next)) return sun.progress
    return Math.max(0, Math.min(1, next))
  }, [nowMs, sun])

  const celestial = useMemo(() => {
    if (!sun) return null
    const when = new Date(nowMs)
    const elevation = solarElevationDegrees(when, sun.latitudeDeg, sun.longitudeDeg)
    const azimuth = solarAzimuthDegrees(when, sun.latitudeDeg, sun.longitudeDeg)
    const moon = moonSnapshotFromDate(when, sun.latitudeDeg, sun.longitudeDeg)
    const planets = planetsSnapshotFromDate(when, sun.latitudeDeg, sun.longitudeDeg)
    return {
      sun: {
        elevation,
        azimuth,
        elevationLabel: `${elevation.toFixed(1)}°`,
        azimuthLabel: `${Math.round(azimuth)}°`,
      },
      moon,
      planets,
    }
  }, [nowMs, sun])

  // Place sun/moon/planets by azimuth on the east→west day arc (not by clock time),
  // so relative spacing matches the tooltip bearings.
  const sunArcProgress = celestial
    ? skyArcProgressFromAzimuth(celestial.sun.azimuth)
    : progress
  const { x, y } = sunArcCoordinates(sunArcProgress)
  const sunIsAboveHorizon =
    sun != null && nowMs >= sun.sunriseMs && nowMs <= sun.sunsetMs
  const moon = celestial?.moon ?? null
  const moonCoordinates = moonArcCoordinates(
    moon ? skyArcProgressFromAzimuth(moon.azimuth) : 0,
  )
  const visiblePlanets = (celestial?.planets ?? []).filter((planet) => planet.aboveHorizon)

  const tooltip =
    tooltipOpen && tooltipCoords
      ? createPortal(
          <div
            className="sun-arc-tooltip sun-arc-tooltip--portal"
            id={tooltipId}
            role="tooltip"
            style={{ top: tooltipCoords.top, right: tooltipCoords.right }}
          >
            <div className="sun-arc-tooltip-grid" role="table">
              <div className="sun-arc-tooltip-row sun-arc-tooltip-row--head" role="row">
                <span className="sun-arc-tooltip-name" role="columnheader" />
                <span className="sun-arc-tooltip-colhead" role="columnheader">
                  Azimuth
                </span>
                <span className="sun-arc-tooltip-colhead" role="columnheader">
                  Elevation
                </span>
              </div>
              <div className="sun-arc-tooltip-row" role="row">
                <span className="sun-arc-tooltip-name sun-arc-tooltip-body" role="rowheader">
                  <span
                    className="sun-arc-tooltip-swatch sun-arc-tooltip-swatch--sun"
                    aria-hidden
                  />
                  Sun
                </span>
                <span className="sun-arc-tooltip-value" role="cell">
                  {celestial?.sun.azimuthLabel ?? '—'}
                </span>
                <span className="sun-arc-tooltip-value" role="cell">
                  {celestial?.sun.elevationLabel ?? '—'}
                </span>
              </div>
              <div className="sun-arc-tooltip-row" role="row">
                <span className="sun-arc-tooltip-name sun-arc-tooltip-body" role="rowheader">
                  <span
                    className="sun-arc-tooltip-swatch sun-arc-tooltip-swatch--moon"
                    aria-hidden
                  />
                  Moon
                </span>
                <span className="sun-arc-tooltip-value" role="cell">
                  {moon?.azimuthLabel ?? '—'}
                </span>
                <span className="sun-arc-tooltip-value" role="cell">
                  {moon?.elevationLabel ?? '—'}
                </span>
              </div>
              {moon?.phaseLabel ? (
                <div className="sun-arc-tooltip-section" role="row">
                  <span className="sun-arc-tooltip-phase">{moon.phaseLabel}</span>
                </div>
              ) : null}
              <div className="sun-arc-tooltip-section" role="row">
                <span className="sun-arc-tooltip-title">Planets</span>
              </div>
              {(celestial?.planets ?? []).map((planet) => (
                <PlanetTooltipRow key={planet.id} planet={planet} />
              ))}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <Link
      ref={wrapRef}
      to="/sky"
      className="sun-arc-wrap"
      aria-label="Open sky view"
      aria-describedby={tooltipOpen ? tooltipId : undefined}
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
      onFocus={() => setTooltipOpen(true)}
      onBlur={() => setTooltipOpen(false)}
    >
      <div className="sun-arc" aria-label="Sun, moon, and planet positions">
        <svg viewBox="0 -18 132 84" role="img" aria-hidden>
          <path
            className="sun-arc-path"
            d="M 20 54 A 46 46 0 0 1 112 54"
            fill="none"
          />
          <path
            className="moon-arc-path"
            d="M 27 54 A 39 39 0 0 1 105 54"
            fill="none"
          />
          <line className="sun-arc-horizon" x1="10" y1="54" x2="122" y2="54" />
          {sunIsAboveHorizon ? (
            <text className="sun-arc-azimuth" x="66" y="51" textAnchor="middle">
              {celestial?.sun.azimuthLabel ?? sun?.azimuthLabel ?? '—'}
            </text>
          ) : null}
          {visiblePlanets.map((planet) => {
            const point = planetArcCoordinates(planet.progress)
            return (
              <circle
                key={planet.id}
                className="planet-arc-dot"
                cx={point.x}
                cy={point.y}
                r="2"
                fill={planet.color}
              />
            )
          })}
          {moon?.aboveHorizon ? (
            <circle
              className="moon-arc-dot"
              cx={moonCoordinates.x}
              cy={moonCoordinates.y}
              r="3"
            />
          ) : null}
          {sunIsAboveHorizon ? (
            <circle className="sun-arc-dot" cx={x} cy={y} r="4.5" />
          ) : null}
        </svg>
        <div className="sun-arc-times">
          <span className="sun-arc-time">{sun?.sunriseLabel ?? '—'}</span>
          <span className="sun-arc-time">{sun?.sunsetLabel ?? '—'}</span>
        </div>
      </div>
      {tooltip}
    </Link>
  )
}

function PlanetTooltipRow({ planet }: { planet: PlanetSnapshot }) {
  const belowHorizon = planet.elevation < 0
  return (
    <div
      className={`sun-arc-tooltip-row${belowHorizon ? ' sun-arc-tooltip-row--below' : ''}`}
      role="row"
    >
      <span className="sun-arc-tooltip-name sun-arc-tooltip-body sun-arc-tooltip-planet" role="rowheader">
        <span
          className="sun-arc-tooltip-swatch"
          style={{ background: planet.color }}
          aria-hidden
        />
        {planet.name}
      </span>
      <span className="sun-arc-tooltip-value" role="cell">
        {planet.azimuthLabel}
      </span>
      <span className="sun-arc-tooltip-value" role="cell">
        {planet.elevationLabel}
      </span>
    </div>
  )
}
