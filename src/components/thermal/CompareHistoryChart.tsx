import { useMemo } from 'react'
import type { ChartSeries } from '../../zynect/types'

type Props = {
  series: ChartSeries[]
  height?: number
}

export function CompareHistoryChart({ series, height = 280 }: Props) {
  const geometry = useMemo(() => buildGeometry(series, height), [series, height])

  if (series.length === 0 || geometry.pointCount === 0) {
    return (
      <div className="thermal-chart thermal-chart--empty" style={{ minHeight: height }}>
        No history points for this range.
      </div>
    )
  }

  return (
    <div className="thermal-chart">
      <svg
        className="thermal-chart-svg"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="img"
        aria-label="Compare history chart"
      >
        {geometry.gridY.map((y) => (
          <line
            key={`gy-${y}`}
            x1={geometry.padL}
            x2={geometry.width - geometry.padR}
            y1={y}
            y2={y}
            className="thermal-chart-grid"
          />
        ))}
        {geometry.lines.map((line) => (
          <path key={line.name} d={line.path} fill="none" stroke={line.color} strokeWidth="2.2" />
        ))}
        <text x={geometry.padL} y={18} className="thermal-chart-axis">
          {geometry.maxLabel}
        </text>
        <text x={geometry.padL} y={geometry.height - 8} className="thermal-chart-axis">
          {geometry.minLabel}
        </text>
      </svg>
      <ul className="thermal-chart-legend">
        {series.map((s) => (
          <li key={s.name}>
            <span style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

function buildGeometry(series: ChartSeries[], height: number) {
  const width = 900
  const padL = 16
  const padR = 16
  const padT = 24
  const padB = 28
  const allPoints = series.flatMap((s) => s.points)
  const pointCount = allPoints.length

  if (pointCount === 0) {
    return {
      width,
      height,
      padL,
      padR,
      pointCount: 0,
      minLabel: '',
      maxLabel: '',
      gridY: [] as number[],
      lines: [] as Array<{ name: string; color: string; path: string }>,
    }
  }

  const times = allPoints.map((p) => new Date(p.timestamp).getTime())
  const values = allPoints.map((p) => p.value)
  const minT = Math.min(...times)
  const maxT = Math.max(...times)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const vPad = Math.max(2, (maxV - minV) * 0.08)
  const lo = minV - vPad
  const hi = maxV + vPad
  const tSpan = Math.max(1, maxT - minT)
  const vSpan = Math.max(1, hi - lo)

  const xFor = (iso: string) =>
    padL + ((new Date(iso).getTime() - minT) / tSpan) * (width - padL - padR)
  const yFor = (value: number) =>
    padT + (1 - (value - lo) / vSpan) * (height - padT - padB)

  const lines = series.map((s) => {
    const pts = s.points
    if (pts.length === 0) return { name: s.name, color: s.color, path: '' }
    let d = `M ${xFor(pts[0].timestamp)} ${yFor(pts[0].value)}`
    for (let i = 1; i < pts.length; i += 1) {
      d += ` L ${xFor(pts[i].timestamp)} ${yFor(pts[i].value)}`
    }
    return { name: s.name, color: s.color, path: d }
  })

  return {
    width,
    height,
    padL,
    padR,
    pointCount,
    minLabel: `${lo.toFixed(0)}°`,
    maxLabel: `${hi.toFixed(0)}°`,
    gridY: [0.25, 0.5, 0.75].map((f) => padT + f * (height - padT - padB)),
    lines,
  }
}
