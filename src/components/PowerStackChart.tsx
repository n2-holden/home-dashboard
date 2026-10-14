import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { HaClient } from '../ha/client'
import {
  EGAUGE_LIVE_GRID_ENTITY,
  SHED_SUBPANEL_ENTITY,
  SHED_SUBPANEL_LABEL,
  parseEgaugeRegisters,
  readingsFromRegisters,
  type EgaugePowerReading,
} from '../ha/egauge'
import { formatPower } from '../ha/energy'
import { loadBaseUrl, loadToken } from '../ha/storage'
import { fetchStatisticMeans } from '../ha/ws'

export type PowerRange = '10m' | '1h' | '24h'

/** bucketMs 0 = one point per live reading (about once a second). */
export const POWER_RANGES: Array<{
  id: PowerRange
  label: string
  windowMs: number
  bucketMs: number
  midLabel: string
}> = [
  { id: '10m', label: 'Last 10 minutes', windowMs: 10 * 60_000, bucketMs: 0, midLabel: '−5 min' },
  { id: '1h', label: 'Last hour', windowMs: 60 * 60_000, bucketMs: 60_000, midLabel: '−30 min' },
  {
    id: '24h',
    label: 'Last 24 hours',
    windowMs: 24 * 60 * 60_000,
    bucketMs: 5 * 60_000,
    midLabel: '−12 h',
  },
]

/** Per-second samples kept in memory: enough for the hour view plus the 24 h view's tail. */
const RAW_KEEP_MS = 65 * 60_000
/** Per-second history loaded for views other than "Last hour" (covers the 5-minute stats lag). */
const RAW_TAIL_MS = 15 * 60_000
const WIDTH = 800
const HEIGHT = 280
const PAD_L = 56
const PAD_R = 12
const PAD_T = 12
const PAD_B = 28

export const POWER_STACK_COLORS = [
  '#4fc3f7',
  '#ffb74d',
  '#81c784',
  '#e57373',
  '#ba68c8',
  '#4db6ac',
  '#fff176',
  '#f06292',
  '#9575cd',
  '#a1887f',
  '#90a4ae',
  '#aed581',
  '#ff8a65',
  '#7986cb',
  '#dce775',
  '#bdbdbd',
]

type Sample = { t: number; watts: Record<string, number> }

export function isGrid(label: string): boolean {
  return label.toLowerCase() === 'grid'
}

function isOther(label: string): boolean {
  return label.toLowerCase() === 'other'
}

function sampleFromReadings(t: number, readings: EgaugePowerReading[]): Sample | null {
  const watts: Record<string, number> = {}
  for (const reading of readings) {
    if (isGrid(reading.label) || reading.watts == null) continue
    watts[reading.label] = reading.watts
  }
  return Object.keys(watts).length > 0 ? { t, watts } : null
}

type HistoryRow = {
  entity_id?: string
  state?: string
  attributes?: { registers?: unknown }
  last_updated?: string
  last_changed?: string
}

function historyRows(raw: unknown, entityId: string): HistoryRow[] {
  if (!Array.isArray(raw)) return []
  const series = raw.find(
    (rows): rows is HistoryRow[] =>
      Array.isArray(rows) && (rows[0] as HistoryRow | undefined)?.entity_id === entityId,
  )
  return series ?? []
}

/**
 * Per-second samples from the egauge_live history, with the shed subpanel's (slower)
 * readings stepped in and taken back out of "Other", matching the live readings.
 */
function samplesFromHistory(raw: unknown): Sample[] {
  const subpanel = historyRows(raw, SHED_SUBPANEL_ENTITY)
    .map((row) => ({
      t: Date.parse(row.last_changed ?? row.last_updated ?? ''),
      watts: Number(row.state),
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.watts))
  let subpanelIndex = -1

  const samples: Sample[] = []
  for (const row of historyRows(raw, EGAUGE_LIVE_GRID_ENTITY)) {
    const t = Date.parse(row.last_updated ?? '')
    if (!Number.isFinite(t)) continue
    const registers = parseEgaugeRegisters(row.attributes?.registers)
    if (registers.length === 0) continue
    while (subpanelIndex + 1 < subpanel.length && subpanel[subpanelIndex + 1].t <= t) {
      subpanelIndex += 1
    }
    const extra: EgaugePowerReading[] =
      subpanelIndex >= 0
        ? [
            {
              entityId: SHED_SUBPANEL_ENTITY,
              label: SHED_SUBPANEL_LABEL,
              watts: subpanel[subpanelIndex].watts,
              formatted: '',
            },
          ]
        : []
    const sample = sampleFromReadings(t, readingsFromRegisters(registers, extra))
    if (sample) samples.push(sample)
  }
  return samples
}

/** Averages samples into fixed buckets, stamped at each bucket's start. */
function bucketize(samples: Sample[], bucketMs: number): Sample[] {
  const buckets = new Map<number, { sums: Record<string, number>; counts: Record<string, number> }>()
  for (const sample of samples) {
    const key = Math.floor(sample.t / bucketMs) * bucketMs
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { sums: {}, counts: {} }
      buckets.set(key, bucket)
    }
    for (const [label, watts] of Object.entries(sample.watts)) {
      bucket.sums[label] = (bucket.sums[label] ?? 0) + watts
      bucket.counts[label] = (bucket.counts[label] ?? 0) + 1
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, { sums, counts }]) => ({
      t,
      watts: Object.fromEntries(
        Object.entries(sums).map(([label, sum]) => [label, sum / counts[label]]),
      ),
    }))
}

function registerSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    row = next
  }
  return row[b.length]
}

/**
 * Maps register labels to power sensors. HA keeps a sensor's original entity id when a
 * register is renamed on the eGauge, so labels without an exact match take the closest
 * unclaimed sensor within two edits.
 */
function matchRegisterEntities(bySlug: Map<string, string>, labels: string[]): Map<string, string> {
  const matched = new Map<string, string>()
  const unclaimed = new Map(bySlug)
  for (const label of labels) {
    const slug = registerSlug(label)
    const id = unclaimed.get(slug)
    if (!id) continue
    matched.set(label, id)
    unclaimed.delete(slug)
  }
  for (const label of labels) {
    if (matched.has(label)) continue
    const slug = registerSlug(label)
    let best: { slug: string; id: string; distance: number } | null = null
    for (const [candidate, id] of unclaimed) {
      const distance = editDistance(slug, candidate)
      if (distance <= 2 && slug.length >= 6 && (!best || distance < best.distance)) {
        best = { slug: candidate, id, distance }
      }
    }
    if (best) {
      matched.set(label, best.id)
      unclaimed.delete(best.slug)
    }
  }
  return matched
}

/** 5-minute means from the eGauge integration's per-register power sensors. */
async function loadStatisticSamples(
  token: string,
  labels: string[],
  start: Date,
  end: Date,
): Promise<Sample[]> {
  const baseUrl = loadBaseUrl()
  const states = await new HaClient(token, baseUrl).getStates()
  const bySlug = new Map<string, string>()
  for (const state of states) {
    const match = /^sensor\.egauge\d*_(.+)_power$/.exec(state.entity_id)
    if (match) bySlug.set(match[1], state.entity_id)
  }
  const idByLabel = matchRegisterEntities(bySlug, [
    'Grid',
    ...labels.filter((label) => !isOther(label) && label !== SHED_SUBPANEL_LABEL),
  ])
  if (labels.includes(SHED_SUBPANEL_LABEL)) idByLabel.set(SHED_SUBPANEL_LABEL, SHED_SUBPANEL_ENTITY)
  if (idByLabel.size === 0) return []

  const means = await fetchStatisticMeans(token, baseUrl, [...idByLabel.values()], start, end, '5minute')
  const byTime = new Map<number, Record<string, number>>()
  for (const [label, id] of idByLabel) {
    for (const row of means[id] ?? []) {
      if (row.mean == null) continue
      const watts = byTime.get(row.start) ?? {}
      watts[label] = row.mean
      byTime.set(row.start, watts)
    }
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, watts]) => {
      const { Grid: grid, ...rest } = watts
      if (grid != null) {
        rest.Other = grid - Object.values(rest).reduce((sum, value) => sum + value, 0)
      }
      return { t, watts: rest }
    })
}

function niceMax(value: number): number {
  if (value <= 0) return 1000
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude
  }
  return 10 * magnitude
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Chart color for a register, by its position among the non-Grid readings. */
export function powerStackColor(readings: EgaugePowerReading[], label: string): string {
  const index = readings.filter((reading) => !isGrid(reading.label)).findIndex((r) => r.label === label)
  return POWER_STACK_COLORS[Math.max(0, index) % POWER_STACK_COLORS.length]
}

type Props = {
  readings: EgaugePowerReading[]
  connected: boolean
  hidden: ReadonlySet<string>
  range: PowerRange
}

/** Stacked area of every eGauge register except Grid over the selected range. */
export function PowerStackChart({ readings, connected, hidden, range }: Props) {
  const config = POWER_RANGES.find((entry) => entry.id === range) ?? POWER_RANGES[0]
  const [raw, setRaw] = useState<Sample[]>([])
  const [stats, setStats] = useState<Sample[]>([])
  const [hoverX, setHoverX] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const rawLoadedMsRef = useRef(0)

  const series = useMemo(
    () =>
      readings
        .filter((reading) => !isGrid(reading.label))
        .map((reading, i) => ({
          label: reading.label,
          color: POWER_STACK_COLORS[i % POWER_STACK_COLORS.length],
        }))
        .filter((entry) => !hidden.has(entry.label)),
    [readings, hidden],
  )

  const labelKey = readings.map((reading) => reading.label).join('|')

  useEffect(() => {
    const sample = sampleFromReadings(Date.now(), readings)
    if (!sample) return
    setRaw((previous) => {
      const cutoff = sample.t - RAW_KEEP_MS
      const kept = previous.filter((entry) => entry.t >= cutoff && entry.t < sample.t)
      return [...kept, sample]
    })
  }, [readings])

  useEffect(() => {
    const token = loadToken()
    const spanMs = range === '1h' ? config.windowMs : RAW_TAIL_MS
    if (!connected || !token || rawLoadedMsRef.current >= spanMs) return
    let cancelled = false
    const end = new Date()
    const start = new Date(end.getTime() - spanMs)
    new HaClient(token, loadBaseUrl())
      .getEntitiesHistory([EGAUGE_LIVE_GRID_ENTITY, SHED_SUBPANEL_ENTITY], start, end, {
        minimalResponse: false,
        significantChangesOnly: false,
      })
      .then((response) => {
        if (cancelled) return
        const history = samplesFromHistory(response)
        if (history.length === 0) return
        rawLoadedMsRef.current = spanMs
        setRaw((previous) => {
          const lastHistory = history[history.length - 1].t
          return [...history, ...previous.filter((entry) => entry.t > lastHistory)]
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [connected, range, config.windowMs])

  useEffect(() => {
    const token = loadToken()
    if (range !== '24h' || !connected || !token) return
    let cancelled = false
    const labels = labelKey.split('|').filter((label) => label && !isGrid(label))
    const load = () => {
      const end = new Date()
      const start = new Date(end.getTime() - config.windowMs - config.bucketMs)
      loadStatisticSamples(token, labels, start, end)
        .then((samples) => {
          if (!cancelled) setStats(samples)
        })
        .catch(() => undefined)
    }
    load()
    const id = window.setInterval(load, config.bucketMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [range, connected, labelKey, config.windowMs, config.bucketMs])

  const samples = useMemo(() => {
    if (config.bucketMs === 0) return raw
    if (range !== '24h') return bucketize(raw, config.bucketMs)
    const lastStat = stats.length > 0 ? stats[stats.length - 1].t : -Infinity
    const tail = raw.filter((sample) => sample.t >= lastStat + config.bucketMs)
    return [...stats, ...bucketize(tail, config.bucketMs)]
  }, [raw, stats, range, config.bucketMs])

  const geometry = useMemo(() => {
    if (samples.length < 2) return null
    // Stack bottom-up from the last listed register so the chart reads top-down like the list.
    const stackOrder = [...series].reverse()
    const labels = stackOrder.map((entry) => entry.label)
    const lastRaw = raw.length > 0 ? raw[raw.length - 1].t : 0
    const endMs = Math.max(samples[samples.length - 1].t, lastRaw)
    const startMs = endMs - config.windowMs
    const visible = samples.filter((sample) => sample.t >= startMs)
    if (visible.length < 2) return null
    const plotW = WIDTH - PAD_L - PAD_R
    const plotH = HEIGHT - PAD_T - PAD_B

    // Positive values stack up from zero and negative values (export) stack down from it.
    // bands[j][i] = [inner, outer] edge of layer i at sample j.
    let maxPos = 0
    let minNeg = 0
    const bands = visible.map((sample) => {
      let pos = 0
      let neg = 0
      const row = labels.map((label) => {
        const watts = sample.watts[label] ?? 0
        if (watts >= 0) {
          pos += watts
          return [pos - watts, pos] as const
        }
        neg += watts
        return [neg - watts, neg] as const
      })
      maxPos = Math.max(maxPos, pos)
      minNeg = Math.min(minNeg, neg)
      return row
    })
    const step = niceMax(Math.max(maxPos, -minNeg)) / 4
    const top = Math.max(step, Math.ceil(maxPos / step) * step)
    // Size the export area to the export itself rather than a whole axis step.
    const bottom = minNeg < 0 ? -Math.min(niceMax(-minNeg), Math.ceil(-minNeg / step) * step) : 0
    const x = (t: number) => PAD_L + ((t - startMs) / config.windowMs) * plotW
    const y = (w: number) => PAD_T + plotH - ((w - bottom) / (top - bottom)) * plotH

    const layers = stackOrder.map(({ label, color }, i) => {
      const outer = visible.map((sample, j) => `${x(sample.t).toFixed(1)},${y(bands[j][i][1]).toFixed(1)}`)
      const inner = visible
        .map((sample, j) => `${x(sample.t).toFixed(1)},${y(bands[j][i][0]).toFixed(1)}`)
        .reverse()
      return {
        label,
        color,
        path: `M${outer.join('L')}L${inner.join('L')}Z`,
      }
    })

    const ticks: Array<{ y: number; label: string }> = []
    for (let watts = Math.ceil(bottom / step) * step; watts <= top + step / 2; watts += step) {
      ticks.push({ y: y(watts), label: formatPower(watts) })
    }
    if (bottom < 0 && y(bottom) - y(0) >= 14 && !ticks.some((tick) => tick.y >= y(bottom) - 1)) {
      ticks.unshift({ y: y(bottom), label: formatPower(bottom) })
    }
    const zeroY = bottom < 0 ? y(0) : null

    return { startMs, endMs, visible, layers, ticks, zeroY, x, plotW }
  }, [samples, raw, series, config.windowMs])

  if (!geometry) {
    return (
      <div className="thermal-chart thermal-chart--empty" style={{ minHeight: HEIGHT }}>
        {range === '10m' ? 'Collecting eGauge readings…' : 'Loading eGauge history…'}
      </div>
    )
  }

  const onMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH
    setHoverX(svgX >= PAD_L && svgX <= WIDTH - PAD_R ? svgX : null)
  }

  const hoverSample =
    hoverX == null
      ? null
      : (() => {
          const t = geometry.startMs + ((hoverX - PAD_L) / geometry.plotW) * config.windowMs
          let best = geometry.visible[0]
          for (const sample of geometry.visible) {
            if (Math.abs(sample.t - t) < Math.abs(best.t - t)) best = sample
          }
          return best
        })()

  return (
    <div className="thermal-chart trends-chart power-stack-chart">
      <svg
        ref={svgRef}
        className="thermal-chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`eGauge registers, ${config.label.toLowerCase()}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverX(null)}
      >
        {geometry.ticks.map((tick) => (
          <g key={tick.label}>
            <line
              x1={PAD_L}
              x2={WIDTH - PAD_R}
              y1={tick.y}
              y2={tick.y}
              className="thermal-chart-grid"
            />
            <text x={PAD_L - 6} y={tick.y + 4} textAnchor="end" className="thermal-chart-axis">
              {tick.label}
            </text>
          </g>
        ))}

        {geometry.layers.map((layer) => (
          <path
            key={layer.label}
            d={layer.path}
            fill={layer.color}
            fillOpacity={0.75}
            stroke={layer.color}
            strokeWidth={0.8}
          />
        ))}

        {geometry.zeroY != null ? (
          <line
            x1={PAD_L}
            x2={WIDTH - PAD_R}
            y1={geometry.zeroY}
            y2={geometry.zeroY}
            className="trends-chart-zero"
          />
        ) : null}

        {hoverSample ? (
          <line
            x1={geometry.x(hoverSample.t)}
            x2={geometry.x(hoverSample.t)}
            y1={PAD_T}
            y2={HEIGHT - PAD_B}
            className="trends-chart-crosshair"
          />
        ) : null}

        <text x={PAD_L} y={HEIGHT - 8} className="thermal-chart-axis">
          {formatClock(geometry.startMs)}
        </text>
        <text
          x={(PAD_L + WIDTH - PAD_R) / 2}
          y={HEIGHT - 8}
          textAnchor="middle"
          className="thermal-chart-axis"
        >
          {config.midLabel}
        </text>
        <text x={WIDTH - PAD_R} y={HEIGHT - 8} textAnchor="end" className="thermal-chart-axis">
          {formatClock(geometry.endMs)}
        </text>
      </svg>

      {hoverSample ? (
        <div className="trends-chart-tooltip power-stack-chart-tooltip">
          <div className="trends-chart-tooltip-time">
            {config.bucketMs === 0
              ? new Date(hoverSample.t).toLocaleTimeString()
              : `${formatClock(hoverSample.t)}–${formatClock(hoverSample.t + config.bucketMs)} avg`}
          </div>
          <ul>
            {[...geometry.layers].reverse().map((layer) => (
              <li key={layer.label}>
                <span style={{ background: layer.color }} />
                <span className="trends-chart-tooltip-label">{layer.label}</span>
                <span className="trends-chart-tooltip-value">
                  {formatPower(hoverSample.watts[layer.label] ?? null)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
