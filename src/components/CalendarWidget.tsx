import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import type { CalendarEventRow } from '../ha/calendar'
import { visibleCalendarReminders, type DashboardReminder } from '../ha/reminders'

export function CalendarWidget() {
  const { calendar, reminders, connectionStatus, dismissReminder, readOnly } = useHouse()

  if (connectionStatus !== 'connected') {
    return (
      <article className="widget calendar-widget">
        <Link className="widget-link calendar-widget-link" to="/calendar">
          <p className="calendar-empty">Connect to Home Assistant to load your schedule.</p>
        </Link>
      </article>
    )
  }

  if (!calendar) {
    return (
      <article className="widget calendar-widget">
        <Link className="widget-link calendar-widget-link" to="/calendar">
          <p className="calendar-empty">No Outlook calendar connected yet.</p>
        </Link>
      </article>
    )
  }

  const todayEvents = calendar.events.filter((event) => event.dayGroup === 'today')
  const tomorrowEvents = calendar.events.filter((event) => event.dayGroup === 'tomorrow')
  const activeReminders = visibleCalendarReminders(reminders)

  return (
    <article className="widget widget--interactive calendar-widget">
      <div className="calendar-widget-body">
        <div className="calendar-columns">
          <CalendarDayColumn
            title="Today"
            events={todayEvents}
            reminders={activeReminders}
            onDismiss={(id) => {
              if (readOnly) return
              dismissReminder(id)
            }}
            readOnly={readOnly}
          />
          <CalendarDayColumn title="Tomorrow" events={tomorrowEvents} />
        </div>
      </div>
    </article>
  )
}

const MAX_VISIBLE_EVENTS = 3

function CalendarDayColumn({
  title,
  events,
  reminders,
  onDismiss,
  readOnly,
}: {
  title: string
  events: CalendarEventRow[]
  reminders?: DashboardReminder[]
  onDismiss?: (id: 1 | 2) => void
  readOnly?: boolean
}) {
  const visible = events.slice(0, MAX_VISIBLE_EVENTS)
  const moreCount = events.length - visible.length

  return (
    <div className="calendar-column">
      <div className="calendar-day-header">
        <div className="calendar-day-group solar-pane-title">{title}</div>
        {reminders && reminders.length > 0 ? (
          <div className="calendar-reminder-row">
            {reminders.map((reminder) => (
              <button
                key={reminder.id}
                type="button"
                className="calendar-reminder-btn calendar-reminder-btn--lit"
                disabled={readOnly}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onDismiss?.(reminder.id)
                }}
              >
                {reminder.message}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <Link
        className="calendar-column-link"
        to="/calendar"
        aria-label={`Open week calendar — ${title}`}
      >
        {events.length === 0 ? (
          <p className="calendar-column-empty">None</p>
        ) : (
          <div className="calendar-column-events">
            <ul className="calendar-event-list">
              {visible.map((event) => (
                <CalendarEventItem key={event.key} event={event} />
              ))}
            </ul>
            {moreCount > 0 ? (
              <span className="calendar-more" aria-label={`${moreCount} more events`}>
                + {moreCount} more
              </span>
            ) : null}
          </div>
        )}
      </Link>
    </div>
  )
}

function CalendarEventItem({ event }: { event: CalendarEventRow }) {
  return (
    <li
      className={`calendar-event${event.ongoing ? ' calendar-event--ongoing' : ''}${
        event.past ? ' calendar-event--past' : ''
      }`}
    >
      <span className="calendar-event-time">{event.timeLabel}</span>
      <span className="calendar-event-summary">{event.summary}</span>
    </li>
  )
}
