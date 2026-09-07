import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'

function StopAllIcon() {
  return (
    <svg className="audio-stop-icon audio-stop-icon--active" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="audio-play-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" />
    </svg>
  )
}

/** Circular TV / receiver icon matching the play/stop control style. */
function TvReceiverIcon({ on }: { on: boolean }) {
  return (
    <svg
      className={`audio-tv-icon${on ? ' audio-tv-icon--on' : ' audio-tv-icon--off'}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect
        x="7"
        y="8"
        width="10"
        height="7.5"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9.5 17.5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {on ? <rect x="8.5" y="9.5" width="7" height="4.5" rx="0.4" fill="currentColor" opacity="0.9" /> : null}
    </svg>
  )
}

export function AudioWidget() {
  const { audio, receiver, connectionStatus, stopAllSonos, toggleReceiver, readOnly } = useHouse()
  const { units, anyPlaying, playingUnits } = audio
  const canStop = !readOnly && connectionStatus === 'connected' && anyPlaying
  const canToggleReceiver =
    !readOnly &&
    connectionStatus === 'connected' &&
    receiver.entityId != null &&
    receiver.available

  const summary =
    units.length === 0
      ? 'No Sonos units found'
      : anyPlaying
        ? playingUnits.length === 1
          ? playingUnits[0].mediaTitle
            ? `${playingUnits[0].label} · ${playingUnits[0].mediaTitle}`
            : playingUnits[0].station
              ? `${playingUnits[0].label} · ${playingUnits[0].station}`
              : playingUnits[0].label
          : playingUnits.length <= 3
            ? playingUnits.map((unit) => unit.label).join(', ')
            : `${playingUnits.length} playing`
        : `${units.length} unit${units.length !== 1 ? 's' : ''} · idle`

  const receiverTitle = !receiver.entityId
    ? 'TV receiver not found in Home Assistant'
    : receiver.on
      ? `Turn off ${receiver.label}`
      : `Turn on ${receiver.label}`

  return (
    <article className="widget widget--interactive widget--compact audio-widget">
      <Link className="widget-link audio-widget-link" to="/audio">
        <div className="audio-widget-header">
          <div className="audio-widget-copy">
            <h2 className="widget-title">Audio</h2>
            <p className={`widget-meta${anyPlaying ? ' widget-meta--live' : ''}`}>{summary}</p>
          </div>
          <div className="audio-widget-actions">
            <button
              type="button"
              className="audio-action-btn"
              disabled={!canToggleReceiver}
              title={receiverTitle}
              aria-label={receiverTitle}
              aria-pressed={receiver.on}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!canToggleReceiver) return
                void toggleReceiver()
              }}
            >
              <TvReceiverIcon on={receiver.on} />
            </button>
            {anyPlaying ? (
              <button
                type="button"
                className="audio-action-btn"
                disabled={!canStop}
                title="Stop all Sonos"
                aria-label="Stop all Sonos"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (!canStop) return
                  void stopAllSonos()
                }}
              >
                <StopAllIcon />
              </button>
            ) : (
              <span className="audio-action-btn" aria-hidden="true">
                <PlayIcon />
              </span>
            )}
          </div>
        </div>
      </Link>
    </article>
  )
}
