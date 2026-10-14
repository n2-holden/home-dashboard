import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  drivewayEventFileUrl,
  fetchDrivewayEvents,
  type DrivewayEvent,
} from '../ha/drivewayEvents'

const POLL_MS = 30_000

function formatEventTime(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `Today ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`
}

function DrivewayEventViewer({
  event,
  onClose,
}: {
  event: DrivewayEvent
  onClose: () => void
}) {
  const [view, setView] = useState<string>(event.video ? 'video' : event.snapshots[0] ?? '')

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div className="confirm-dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className="driveway-event-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`Driveway event ${formatEventTime(event.timeMs)}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="driveway-event-viewer-header">
          <span>{formatEventTime(event.timeMs)}</span>
          <button type="button" className="btn btn--compact" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="driveway-event-viewer-media">
          {view === 'video' && event.video ? (
            <video
              key={event.video}
              src={drivewayEventFileUrl(event.video)}
              controls
              autoPlay
              muted
              playsInline
            />
          ) : view ? (
            <img src={drivewayEventFileUrl(view)} alt="Driveway snapshot" />
          ) : null}
        </div>
        <div className="driveway-event-viewer-thumbs">
          {event.video ? (
            <button
              type="button"
              className={`driveway-event-thumb driveway-event-thumb--video${
                view === 'video' ? ' driveway-event-thumb--active' : ''
              }`}
              onClick={() => setView('video')}
            >
              {event.snapshots[0] ? (
                <img src={drivewayEventFileUrl(event.snapshots[0])} alt="" />
              ) : null}
              <span className="driveway-event-play" aria-hidden="true">
                ▶
              </span>
              <span className="driveway-event-thumb-label">Video</span>
            </button>
          ) : null}
          {event.snapshots.map((name, i) => (
            <button
              key={name}
              type="button"
              className={`driveway-event-thumb${view === name ? ' driveway-event-thumb--active' : ''}`}
              onClick={() => setView(name)}
            >
              <img src={drivewayEventFileUrl(name)} alt="" />
              <span className="driveway-event-thumb-label">Photo {i + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DrivewayEventsStrip() {
  const [events, setEvents] = useState<DrivewayEvent[] | null>(null)
  const [selected, setSelected] = useState<DrivewayEvent | null>(null)

  const load = useCallback(async () => {
    setEvents(await fetchDrivewayEvents())
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  return (
    <article className="widget driveway-events">
      <div className="widget-body">
        <h2 className="driveway-events-title">Recent driveway events</h2>
        {events == null ? null : events.length === 0 ? (
          <p className="driveway-events-empty">No driveway alarm captures in the last 7 days.</p>
        ) : (
          <div className="driveway-events-row">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                className="driveway-event-card"
                onClick={() => setSelected(event)}
                title={formatEventTime(event.timeMs)}
              >
                <span className="driveway-event-card-image">
                  {event.snapshots[0] ? (
                    <img
                      src={drivewayEventFileUrl(event.snapshots[0])}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className="driveway-event-card-placeholder">No photo</span>
                  )}
                  {event.video ? (
                    <span className="driveway-event-play" aria-hidden="true">
                      ▶
                    </span>
                  ) : null}
                </span>
                <span className="driveway-event-card-time">{formatEventTime(event.timeMs)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected ? (
        <DrivewayEventViewer event={selected} onClose={() => setSelected(null)} />
      ) : null}
    </article>
  )
}
