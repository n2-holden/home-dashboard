import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SkyChartView } from '../components/SkyChartView'
import { useHouse } from '../data/HouseContext'
import { useRepeatingPress } from '../hooks/useRepeatingPress'

const VIEW_DIRECTIONS = [
  { value: 0, label: 'North' },
  { value: 45, label: 'Northeast' },
  { value: 90, label: 'East' },
  { value: 135, label: 'Southeast' },
  { value: 180, label: 'South' },
  { value: 225, label: 'Southwest' },
  { value: 270, label: 'West' },
  { value: 315, label: 'Northwest' },
] as const

const TIME_STEP_MINUTES = 15

function startOfLocalDay(when = new Date()): Date {
  const d = new Date(when.getTime())
  d.setHours(0, 0, 0, 0)
  return d
}

function minutesOfDay(when: Date): number {
  return when.getHours() * 60 + when.getMinutes()
}

function snapMinutes(totalMinutes: number, step = TIME_STEP_MINUTES): number {
  const day = 24 * 60
  const snapped = Math.round(totalMinutes / step) * step
  return ((snapped % day) + day) % day
}

function combineDateAndMinutes(day: Date, totalMinutes: number): Date {
  const next = startOfLocalDay(day)
  const mins = snapMinutes(totalMinutes)
  next.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  return next
}

function toDateInputValue(when: Date): string {
  const y = when.getFullYear()
  const m = String(when.getMonth() + 1).padStart(2, '0')
  const d = String(when.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toTimeInputValue(totalMinutes: number): string {
  const mins = snapMinutes(totalMinutes)
  const h = String(Math.floor(mins / 60)).padStart(2, '0')
  const m = String(mins % 60).padStart(2, '0')
  return `${h}:${m}`
}

function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : startOfLocalDay(date)
}

function parseTimeInputValue(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return snapMinutes(hours * 60 + minutes)
}

function shiftLocalDay(when: Date, deltaDays: number): Date {
  const next = startOfLocalDay(when)
  next.setDate(next.getDate() + deltaDays)
  return next
}

function shiftMinutes(totalMinutes: number, delta: number): number {
  return snapMinutes(totalMinutes + delta)
}

export function SkyViewPage() {
  const { sun } = useHouse()
  const [viewDirectionDeg, setViewDirectionDeg] = useState(180)
  const [viewDate, setViewDate] = useState(() => startOfLocalDay())
  const [viewMinutes, setViewMinutes] = useState(() => snapMinutes(minutesOfDay(new Date())))
  const [showStars, setShowStars] = useState(true)
  const [showStarLabels, setShowStarLabels] = useState(false)
  const [showConstellationLines, setShowConstellationLines] = useState(true)
  const [showConstellationLabels, setShowConstellationLabels] = useState(false)

  const viewWhen = useMemo(
    () => combineDateAndMinutes(viewDate, viewMinutes),
    [viewDate, viewMinutes],
  )

  const isNow =
    toDateInputValue(viewDate) === toDateInputValue(startOfLocalDay()) &&
    viewMinutes === snapMinutes(minutesOfDay(new Date()))

  const goToNow = () => {
    const now = new Date()
    setViewDate(startOfLocalDay(now))
    setViewMinutes(snapMinutes(minutesOfDay(now)))
  }

  const prevDayPress = useRepeatingPress(() => setViewDate((prev) => shiftLocalDay(prev, -1)))
  const nextDayPress = useRepeatingPress(() => setViewDate((prev) => shiftLocalDay(prev, 1)))
  const earlierTimePress = useRepeatingPress(() =>
    setViewMinutes((prev) => shiftMinutes(prev, -TIME_STEP_MINUTES)),
  )
  const laterTimePress = useRepeatingPress(() =>
    setViewMinutes((prev) => shiftMinutes(prev, TIME_STEP_MINUTES)),
  )

  return (
    <main className="sky-view-page">
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Sky View</h1>
      </header>

      <section className="widget sky-view-card">
        <div className="widget-body sky-view-body">
          <div className="sky-view-controls" role="group" aria-label="Sky view controls">
            <label className="sky-view-control">
              <span className="sky-view-control-label">View direction</span>
              <select
                value={viewDirectionDeg}
                onChange={(event) => setViewDirectionDeg(Number(event.target.value))}
                aria-label="View direction"
              >
                {VIEW_DIRECTIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="sky-view-control sky-view-control--date">
              <span className="sky-view-control-label" id="sky-view-date-label">
                Date
              </span>
              <div className="sky-view-date-row">
                <button
                  type="button"
                  className="btn btn--compact"
                  aria-label="Previous day"
                  {...prevDayPress}
                >
                  ←
                </button>
                <input
                  type="date"
                  value={toDateInputValue(viewDate)}
                  aria-labelledby="sky-view-date-label"
                  onChange={(event) => {
                    const next = parseDateInputValue(event.target.value)
                    if (next) setViewDate(next)
                  }}
                />
                <button
                  type="button"
                  className="btn btn--compact"
                  aria-label="Next day"
                  {...nextDayPress}
                >
                  →
                </button>
              </div>
            </div>

            <div className="sky-view-control sky-view-control--time">
              <span className="sky-view-control-label" id="sky-view-time-label">
                Time
              </span>
              <div className="sky-view-date-row">
                <button
                  type="button"
                  className="btn btn--compact"
                  aria-label={`Earlier by ${TIME_STEP_MINUTES} minutes`}
                  {...earlierTimePress}
                >
                  ←
                </button>
                <input
                  type="time"
                  step={TIME_STEP_MINUTES * 60}
                  value={toTimeInputValue(viewMinutes)}
                  aria-labelledby="sky-view-time-label"
                  onChange={(event) => {
                    const next = parseTimeInputValue(event.target.value)
                    if (next != null) setViewMinutes(next)
                  }}
                />
                <button
                  type="button"
                  className="btn btn--compact"
                  aria-label={`Later by ${TIME_STEP_MINUTES} minutes`}
                  {...laterTimePress}
                >
                  →
                </button>
                <button
                  type="button"
                  className="btn btn--compact"
                  disabled={isNow}
                  onClick={goToNow}
                >
                  Now
                </button>
              </div>
            </div>

            <div className="sky-view-control sky-view-control--stars">
              <div className="sky-view-date-row">
                <label className="sky-view-check">
                  <input
                    type="checkbox"
                    checked={showStars}
                    onChange={(event) => {
                      const next = event.target.checked
                      setShowStars(next)
                      if (!next) setShowStarLabels(false)
                    }}
                  />
                  Show stars
                </label>
                <label className={`sky-view-check${showStars ? '' : ' sky-view-check--disabled'}`}>
                  <input
                    type="checkbox"
                    checked={showStarLabels}
                    disabled={!showStars}
                    onChange={(event) => setShowStarLabels(event.target.checked)}
                  />
                  Labels
                </label>
                <span className="sky-view-check-gap" aria-hidden="true" />
                <label className={`sky-view-check${showStars ? '' : ' sky-view-check--disabled'}`}>
                  <input
                    type="checkbox"
                    checked={showConstellationLines}
                    disabled={!showStars}
                    onChange={(event) => {
                      const next = event.target.checked
                      setShowConstellationLines(next)
                      if (!next) setShowConstellationLabels(false)
                    }}
                  />
                  Constellations
                </label>
                <label
                  className={`sky-view-check${
                    showStars && showConstellationLines ? '' : ' sky-view-check--disabled'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={showConstellationLabels}
                    disabled={!showStars || !showConstellationLines}
                    onChange={(event) => setShowConstellationLabels(event.target.checked)}
                  />
                  Labels
                </label>
              </div>
            </div>
          </div>

          <SkyChartView
            sun={sun}
            viewDirectionDeg={viewDirectionDeg}
            viewWhen={viewWhen}
            showStars={showStars}
            showStarLabels={showStars && showStarLabels}
            showConstellationLines={showStars && showConstellationLines}
            showConstellationLabels={
              showStars && showConstellationLines && showConstellationLabels
            }
          />
        </div>
      </section>
    </main>
  )
}
