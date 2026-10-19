import type { ShadeSunInterval } from '../ha/shadeSunSchedule'

export const DAY_START_MIN = 4 * 60
export const DAY_END_MIN = 20 * 60
const SPAN_MIN = DAY_END_MIN - DAY_START_MIN
export const TICK_HOURS = [4, 6, 8, 10, 12, 14, 16, 18, 20]

export function zoneParts(ms: number, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

export function formatClock(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' })
}

export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`
}

export function percentOf(minutes: number): number {
  return ((Math.min(DAY_END_MIN, Math.max(DAY_START_MIN, minutes)) - DAY_START_MIN) / SPAN_MIN) * 100
}

export function clockMinutes(hhmm: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function ScheduleBar({
  intervals,
  note,
  timeZone,
  nowMinutes,
  sunMarks,
}: {
  intervals: ShadeSunInterval[]
  note: string | null
  timeZone: string
  nowMinutes: number | null
  sunMarks: number[]
}) {
  return (
    <div className="shade-schedule-bar">
      {TICK_HOURS.slice(1, -1).map((hour) => (
        <span
          key={hour}
          className="shade-schedule-bar-grid"
          style={{ left: `${percentOf(hour * 60)}%` }}
          aria-hidden="true"
        />
      ))}
      {intervals.map((interval) => {
        const start = percentOf(zoneParts(interval.closeMs, timeZone).minutes)
        const end = percentOf(zoneParts(interval.openMs, timeZone).minutes)
        const label = `Closed ${formatClock(interval.closeMs, timeZone)} – ${formatClock(interval.openMs, timeZone)}`
        return (
          <span
            key={interval.closeMs}
            className="shade-schedule-bar-closed"
            style={{ left: `${start}%`, width: `${Math.max(0.4, end - start)}%` }}
            title={label}
            aria-label={label}
          />
        )
      })}
      {note ? <span className="shade-schedule-bar-note">{note}</span> : null}
      {sunMarks.map((minutes) => (
        <span
          key={minutes}
          className="shade-schedule-bar-sun"
          style={{ left: `${percentOf(minutes)}%` }}
          aria-hidden="true"
        />
      ))}
      {nowMinutes != null && nowMinutes >= DAY_START_MIN && nowMinutes <= DAY_END_MIN ? (
        <span
          className="shade-schedule-bar-now"
          style={{ left: `${percentOf(nowMinutes)}%` }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}

export function ScheduleAxis({ leadingColumns }: { leadingColumns: number }) {
  return (
    <div className="shade-schedule-axis" aria-hidden="true">
      {Array.from({ length: leadingColumns }, (_, i) => (
        <span key={i} />
      ))}
      <div className="shade-schedule-axis-ticks">
        {TICK_HOURS.map((hour) => (
          <span key={hour} style={{ left: `${percentOf(hour * 60)}%` }}>
            {hourLabel(hour)}
          </span>
        ))}
      </div>
    </div>
  )
}
