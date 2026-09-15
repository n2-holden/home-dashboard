import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import {
  groupEventsByWeek,
  localWeekBounds,
  parseCalendarEvents,
  type CalendarDaySection,
} from '../ha/calendar'
import { HaClient } from '../ha/client'
import { loadBaseUrl, loadToken } from '../ha/storage'

export function CalendarPage() {
  const { calendar, connectionStatus } = useHouse()
  const [days, setDays] = useState<CalendarDaySection[]>([])
  const [status, setStatus] = useState('Loading week…')

  const rangeLabel = useMemo(() => {
    const { start, end } = localWeekBounds()
    const endDay = new Date(end.getTime() - 1)
    const fmt = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    })
    return `${fmt.format(start)} – ${fmt.format(endDay)}`
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (connectionStatus !== 'connected') {
        setDays([])
        setStatus('Connect to Home Assistant to view your calendar.')
        return
      }
      if (!calendar?.entityId) {
        setDays([])
        setStatus('No Outlook calendar connected yet.')
        return
      }

      const token = loadToken()
      if (!token) {
        setDays([])
        setStatus('Home Assistant token missing.')
        return
      }

      setStatus('Loading week…')
      try {
        const client = new HaClient(token, loadBaseUrl())
        const { start, end } = localWeekBounds()
        const raw = await client.getCalendarEvents(calendar.entityId, start, end)
        if (cancelled) return
        const nextDays = groupEventsByWeek(parseCalendarEvents(raw))
        const total = nextDays.reduce((sum, day) => sum + day.events.length, 0)
        setDays(nextDays)
        setStatus(
          total > 0
            ? `${total} event${total === 1 ? '' : 's'} over the next 7 days`
            : 'Nothing on the calendar this week.',
        )
      } catch {
        if (cancelled) return
        setDays([])
        setStatus('Could not load calendar events.')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [calendar?.entityId, connectionStatus])

  return (
    <main className="calendar-page">
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Calendar</h1>
        <p>
          {rangeLabel}
          {calendar?.name ? ` · ${calendar.name}` : ''}
        </p>
      </header>

      <p className="calendar-page-status">{status}</p>

      {days.length > 0 ? (
        <div className="calendar-week" aria-label="Week schedule">
          {days.map((day) => (
            <section key={day.key} className="calendar-week-day widget">
              <header className="calendar-week-day-header">
                <h2>{day.label}</h2>
                <span>{day.dateLabel}</span>
              </header>
              <div className="widget-body calendar-week-day-body">
                {day.events.length === 0 ? (
                  <p className="calendar-empty">No events</p>
                ) : (
                  <ul className="calendar-event-list calendar-event-list--page">
                    {day.events.map((event) => (
                      <li
                        key={event.key}
                        className={`calendar-event${
                          event.ongoing ? ' calendar-event--ongoing' : ''
                        }${event.past ? ' calendar-event--past' : ''}`}
                      >
                        <span className="calendar-event-time">{event.timeLabel}</span>
                        <span className="calendar-event-body">
                          <span className="calendar-event-summary">{event.summary}</span>
                          {event.locationLabel ? (
                            <span className="calendar-event-location">{event.locationLabel}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </main>
  )
}
