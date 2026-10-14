import { useMemo, useRef, useState } from 'react'
import { formatTrendValue, type TrendSeriesData, type TrendUnit } from '../ha/trends'

type Props = {
  series: TrendSeriesData[]
  start: Date
  end: Date
  height?: number
  rangeLabel?: string
  zoneNames?: Record<number, string>
}

type HoverState = {
  svgX: number
  clientX: number
  clientY: number
  timeMs: number
  values: Array<{ id: string; label: string; color: string; text: string }>
}

export function TrendsChart({
  series,
  start,
  end,
  height = 340,
  rangeLabel = 'selected',
  zoneNames,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<HoverState | null>(null)

  const geometry = useMemo(
    () => buildGeometry(series, start, end, height),
    [series, start, end, height],
  )

  if (series.length === 0) {
    return (
      <div className="thermal-chart thermal-chart--empty" style={{ minHeight: height }}>
        Select at least one series to display.
      </div>
    )
  }

  if (geometry.pointCount === 0) {
    return (
      <div className="thermal-chart thermal-chart--empty" style={{ minHeight: height }}>
        No samples in this {rangeLabel} window yet.
      </div>
    )
  }

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return

    const svgX = ((event.clientX - rect.left) / rect.width) * geometry.width
    if (svgX < geometry.padL || svgX > geometry.width - geometry.padR) {
      setHover(null)
      return
    }

    const plotW = geometry.width - geometry.padL - geometry.padR
    const frac = (svgX - geometry.padL) / Math.max(1, plotW)
    const timeMs = geometry.startMs + frac * geometry.tSpan

    const values = series
      .map((entry) => {
        const value = valueAtOrBefore(entry.points, timeMs)
        if (value == null || !Number.isFinite(value)) return null
        return {
          id: entry.id,
          label: entry.label,
          color: entry.color,
          text: formatTrendValue(entry.unit, value, zoneNames),
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)

    setHover({
      svgX,
      clientX: event.clientX,
      clientY: event.clientY,
      timeMs,
      values,
    })
  }

  const tooltipStyle = tooltipPosition(wrapRef.current, hover)

  return (
    <div className="thermal-chart trends-chart" ref={wrapRef}>
      <svg
        className="thermal-chart-svg"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="img"
        aria-label={`Site trends over ${rangeLabel}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {geometry.gridY.map((row) => (
          <line
            key={`gy-${row}`}
            x1={geometry.padL}
            x2={geometry.width - geometry.padR}
            y1={row}
            y2={row}
            className="thermal-chart-grid"
          />
        ))}
        {geometry.zeroY != null ? (
          <line
            x1={geometry.padL}
            x2={geometry.width - geometry.padR}
            y1={geometry.zeroY}
            y2={geometry.zeroY}
            className="trends-chart-zero"
          />
        ) : null}

        {geometry.percentTicks.map((tick) => (
          <text key={`pt-${tick.label}`} x={4} y={tick.y + 4} className="thermal-chart-axis">
            {tick.label}
          </text>
        ))}
        {geometry.tempTicks.map((tick) => (
          <text
            key={`tt-${tick.label}`}
            x={geometry.tempTickX}
            y={tick.y + 4}
            className="thermal-chart-axis"
          >
            {tick.label}
          </text>
        ))}
        {geometry.inchTicks.map((tick) => (
          <text
            key={`it-${tick.label}`}
            x={geometry.width - geometry.padZone - 4}
            y={tick.y + 4}
            textAnchor="end"
            className="thermal-chart-axis"
          >
            {tick.label}
          </text>
        ))}
        {geometry.wattTicks.map((tick) => (
          <text
            key={`wt-${tick.label}`}
            x={geometry.width - geometry.padZone - geometry.padInches - 4}
            y={tick.y + 4}
            textAnchor="end"
            className="thermal-chart-axis"
          >
            {tick.label}
          </text>
        ))}
        {geometry.zoneTicks.map((tick) => (
          <text
            key={`zt-${tick.label}`}
            x={geometry.width - 4}
            y={tick.y + 4}
            textAnchor="end"
            className="thermal-chart-axis trends-chart-axis--zone"
          >
            {tick.label}
          </text>
        ))}

        {geometry.lines.map((line) => (
          <path
            key={line.id}
            d={line.path}
            fill="none"
            stroke={line.color}
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {hover ? (
          <line
            x1={hover.svgX}
            x2={hover.svgX}
            y1={geometry.padT}
            y2={geometry.height - geometry.padB}
            className="trends-chart-crosshair"
          />
        ) : null}

        <text x={geometry.padL} y={geometry.height - 8} className="thermal-chart-axis">
          {geometry.startLabel}
        </text>
        <text
          x={(geometry.padL + geometry.width - geometry.padR) / 2}
          y={geometry.height - 8}
          textAnchor="middle"
          className="thermal-chart-axis"
        >
          {geometry.midLabel}
        </text>
        <text
          x={geometry.width - geometry.padR}
          y={geometry.height - 8}
          textAnchor="end"
          className="thermal-chart-axis"
        >
          {geometry.endLabel}
        </text>
      </svg>

      {hover && hover.values.length > 0 ? (
        <div className="trends-chart-tooltip" style={tooltipStyle}>
          <div className="trends-chart-tooltip-time">{formatAxisTime(new Date(hover.timeMs))}</div>
          <ul>
            {hover.values.map((row) => (
              <li key={row.id}>
                <span style={{ background: row.color }} />
                <span className="trends-chart-tooltip-label">{row.label}</span>
                <span className="trends-chart-tooltip-value">{row.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="thermal-chart-legend">
        {series.map((entry) => (
          <li key={entry.id}>
            <span style={{ background: entry.color }} />
            {entry.label}
            {entry.unit === 'zone'
              ? ' (zone #)'
              : entry.unit === 'percent'
                ? ' (%)'
                : entry.unit === 'temperature'
                  ? ' (°F)'
                  : entry.unit === 'inches'
                    ? ' (in)'
                    : ' (W)'}
          </li>
        ))}
      </ul>
    </div>
  )
}

function tooltipPosition(
  wrap: HTMLDivElement | null,
  hover: HoverState | null,
): { left: number; top: number } | undefined {
  if (!wrap || !hover) return undefined
  const rect = wrap.getBoundingClientRect()
  const localX = hover.clientX - rect.left
  const localY = hover.clientY - rect.top
  const left = Math.min(rect.width - 180, Math.max(8, localX + 14))
  const top = Math.min(rect.height - 120, Math.max(8, localY + 14))
  return { left, top }
}

function valueAtOrBefore(
  points: Array<{ timestamp: string; value: number }>,
  timeMs: number,
): number | null {
  if (points.length === 0) return null
  let best: number | null = null
  for (const point of points) {
    const t = Date.parse(point.timestamp)
    if (!Number.isFinite(t)) continue
    if (t <= timeMs) best = point.value
    else break
  }
  return best
}

function buildGeometry(series: TrendSeriesData[], start: Date, end: Date, height: number) {
  const hasPercent = series.some((s) => s.unit === 'percent')
  const hasWatts = series.some((s) => s.unit === 'watts')
  const hasZone = series.some((s) => s.unit === 'zone')
  const hasTemp = series.some((s) => s.unit === 'temperature')
  const hasInches = series.some((s) => s.unit === 'inches')

  const percentAxisW = hasPercent ? 40 : 0
  const padL = Math.max(16, 4 + percentAxisW + (hasTemp ? 40 : 0))
  const padZone = hasZone ? 36 : 0
  const padInches = hasInches ? 44 : 0
  const padWatts = hasWatts ? 48 : 0
  const padR = Math.max(16, padZone + padInches + padWatts)
  const padT = 18
  const padB = 28
  const width = 960
  const startMs = start.getTime()
  const endMs = end.getTime()
  const tSpan = Math.max(1, endMs - startMs)

  const wattSeries = series.filter((s) => s.unit === 'watts')
  const allPoints = series.flatMap((s) => s.points)
  const pointCount = allPoints.length

  const percentDomain = { lo: 0, hi: 100, ticks: [0, 25, 50, 75, 100] }
  const zoneDomain = { lo: 0, hi: 21, ticks: [0, 5, 10, 15, 21] }
  const wattDomain = domainForWatts(wattSeries)
  const tempDomain = domainForTemperature(series.filter((s) => s.unit === 'temperature'))
  const inchDomain = domainForInches(series.filter((s) => s.unit === 'inches'))

  const xFor = (iso: string) =>
    padL + ((Date.parse(iso) - startMs) / tSpan) * (width - padL - padR)

  const yForDomain = (domain: { lo: number; hi: number }, value: number) => {
    const span = Math.max(1e-6, domain.hi - domain.lo)
    return padT + (1 - (value - domain.lo) / span) * (height - padT - padB)
  }

  const yForUnit = (unit: TrendUnit, value: number) => {
    if (unit === 'watts') return yForDomain(wattDomain, value)
    if (unit === 'zone') return yForDomain(zoneDomain, value)
    if (unit === 'temperature') return yForDomain(tempDomain, value)
    if (unit === 'inches') return yForDomain(inchDomain, value)
    return yForDomain(percentDomain, value)
  }

  const lines = series.map((entry) => {
    let d = ''
    let penDown = false
    for (const point of entry.points) {
      const x = xFor(point.timestamp)
      if (!Number.isFinite(x)) continue
      if (!Number.isFinite(point.value)) {
        if (penDown && (entry.unit === 'zone' || entry.unit === 'percent')) d += ` H ${x}`
        penDown = false
        continue
      }
      const y = yForUnit(entry.unit, point.value)
      if (!penDown) {
        d += `${d ? ' ' : ''}M ${x} ${y}`
        penDown = true
      } else if (entry.unit === 'zone' || entry.unit === 'percent') {
        d += ` H ${x} V ${y}`
      } else {
        d += ` L ${x} ${y}`
      }
    }
    return { id: entry.id, color: entry.color, path: d }
  })

  const mid = new Date((startMs + endMs) / 2)

  return {
    width,
    height,
    padL,
    padR,
    padZone,
    padInches,
    padT,
    padB,
    startMs,
    tSpan,
    pointCount,
    gridY: [0.25, 0.5, 0.75].map((f) => padT + f * (height - padT - padB)),
    percentTicks: hasPercent
      ? percentDomain.ticks.map((value) => ({
          y: yForDomain(percentDomain, value),
          label: `${value}%`,
        }))
      : [],
    tempTickX: 4 + percentAxisW,
    tempTicks: hasTemp
      ? tempDomain.ticks.map((value) => ({
          y: yForDomain(tempDomain, value),
          label: `${value}°`,
        }))
      : [],
    inchTicks: hasInches
      ? inchDomain.ticks.map((value) => ({
          y: yForDomain(inchDomain, value),
          label: `${Number.isInteger(value) ? value : value.toFixed(1)}″`,
        }))
      : [],
    wattTicks: hasWatts
      ? wattDomain.ticks.map((value) => ({
          y: yForDomain(wattDomain, value),
          label: formatWattTick(value),
        }))
      : [],
    zoneTicks: hasZone
      ? zoneDomain.ticks.map((value) => ({
          y: yForDomain(zoneDomain, value),
          label: value === 0 ? '0' : `${value}`,
        }))
      : [],
    zeroY:
      hasWatts && wattDomain.lo < 0 && wattDomain.hi > 0 ? yForDomain(wattDomain, 0) : null,
    lines,
    startLabel: formatAxisTime(start),
    midLabel: formatAxisTime(mid),
    endLabel: formatAxisTime(end),
  }
}

function domainForTemperature(series: TrendSeriesData[]) {
  let lo = Infinity
  let hi = -Infinity
  for (const entry of series) {
    for (const point of entry.points) {
      if (!Number.isFinite(point.value)) continue
      if (point.value < lo) lo = point.value
      if (point.value > hi) hi = point.value
    }
  }
  if (!Number.isFinite(lo)) return { lo: 60, hi: 90, ticks: [60, 70, 80, 90] }
  const step = hi - lo > 30 ? 10 : 5
  lo = Math.floor((lo - 1) / step) * step
  hi = Math.ceil((hi + 1) / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi; v += step) ticks.push(v)
  return { lo, hi, ticks }
}

function domainForInches(series: TrendSeriesData[]) {
  let lo = Infinity
  let hi = -Infinity
  for (const entry of series) {
    for (const point of entry.points) {
      if (!Number.isFinite(point.value)) continue
      if (point.value < lo) lo = point.value
      if (point.value > hi) hi = point.value
    }
  }
  if (!Number.isFinite(lo)) return { lo: -2, hi: 2, ticks: [-2, 0, 2] }
  const span = hi - lo
  const step = span > 12 ? 4 : span > 6 ? 2 : span > 2 ? 1 : 0.5
  lo = Math.floor((lo - step / 2) / step) * step
  hi = Math.ceil((hi + step / 2) / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10)
  return { lo, hi, ticks }
}

function domainForWatts(series: TrendSeriesData[]) {
  const values = series.flatMap((s) => s.points.map((p) => p.value))
  if (values.length === 0) return { lo: 0, hi: 1000, ticks: [0, 500, 1000] }

  // Iterate — do not Math.min(...values). House-power history can be huge enough
  // that a spread blows the call stack and blanks the page.
  let lo = 0
  let hi = 0
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    if (value < lo) lo = value
    if (value > hi) hi = value
  }
  if (lo === hi) {
    lo -= 100
    hi += 100
  }
  const pad = Math.max(50, (hi - lo) * 0.08)
  lo -= pad
  hi += pad
  const ticks = [lo, (lo + hi) / 2, hi]
  return { lo, hi, ticks }
}

function formatWattTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`
  return `${Math.round(value)}`
}

function formatAxisTime(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
