import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { displayToggleState, SONOS_PENDING_GIVE_UP_MS } from '../ha/pendingToggle'
import {
  formatSonosState,
  isAppleTouchDevice,
  openSonosApp,
  type SonosUnit,
} from '../ha/sonos'
import { usePendingToggles } from '../hooks/usePendingToggles'

function UnitPlayStopButton({
  unit,
  playing,
  pending,
  disabled,
  onPlay,
  onStop,
}: {
  unit: SonosUnit
  /** Displayed transport state (may be optimistic while pending). */
  playing: boolean
  pending: boolean
  disabled: boolean
  onPlay: () => void
  onStop: () => void
}) {
  const showStop = playing
  return (
    <button
      type="button"
      className={`audio-unit-transport${showStop ? ' audio-unit-transport--stop' : ''}${
        pending ? ' audio-unit-transport--pending' : ''
      }`}
      disabled={disabled || pending}
      aria-busy={pending}
      title={
        pending
          ? showStop
            ? `Starting ${unit.label}…`
            : `Stopping ${unit.label}…`
          : showStop
            ? `Stop ${unit.label}`
            : unit.paused
              ? `Resume ${unit.label}`
              : `Play ${unit.label}`
      }
      aria-label={
        pending
          ? showStop
            ? `Starting ${unit.label}`
            : `Stopping ${unit.label}`
          : showStop
            ? `Stop ${unit.label}`
            : unit.paused
              ? `Resume ${unit.label}`
              : `Play ${unit.label}`
      }
      onClick={() => (showStop ? onStop() : onPlay())}
    >
      {showStop ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 6.5v11l9-5.5-9-5.5z" fill="currentColor" />
        </svg>
      )}
    </button>
  )
}

function ReceiverPowerButton({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`audio-unit-transport${on ? ' audio-receiver-power--on' : ''}`}
      disabled={disabled}
      title={on ? `Turn off ${label}` : `Turn on ${label}`}
      aria-label={on ? `Turn off ${label}` : `Turn on ${label}`}
      aria-pressed={on}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3v8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M7.05 6.05a7 7 0 1 0 9.9 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

export function AudioPage() {
  const {
    audio,
    receiver,
    connectionStatus,
    playSonos,
    stopSonos,
    setSonosVolume,
    selectSonosSource,
    stopAllSonos,
    toggleReceiver,
    selectReceiverSource,
    setReceiverVolume,
    readOnly,
  } = useHouse()
  const { units, anyPlaying } = audio
  const controlsDisabled = readOnly || connectionStatus !== 'connected'
  const showOpenSonos = isAppleTouchDevice()
  const receiverReady = receiver.entityId != null && receiver.available
  const receiverControlsDisabled = controlsDisabled || !receiverReady

  const { pendingByKey, startPending, clearPending, reconcile } = usePendingToggles<string>({
    giveUpMs: SONOS_PENDING_GIVE_UP_MS,
  })

  const actualByKey = useMemo(() => {
    const map: Record<string, boolean | null> = {}
    for (const unit of units) {
      // Paused is transitional for Sonos — don't confirm play or stop on it.
      // Play confirms only on playing; stop confirms only on idle/off.
      map[unit.entityId] = unit.playing ? true : unit.paused ? null : false
    }
    return map
  }, [units])

  useEffect(() => {
    reconcile(actualByKey)
  }, [actualByKey, reconcile])

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header page-header--with-action">
        <div>
          <h1>Audio</h1>
          <p>TV receiver · Sonos speakers</p>
        </div>
        <div className="audio-page-actions">
          {showOpenSonos ? (
            <button type="button" className="btn btn--compact" onClick={() => openSonosApp()}>
              Open Sonos
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--compact"
            disabled={controlsDisabled || !anyPlaying}
            onClick={() => {
              for (const unit of units) {
                if (unit.playing || unit.paused) startPending(unit.entityId, false)
              }
              void stopAllSonos().catch(() => {
                for (const unit of units) clearPending(unit.entityId)
              })
            }}
          >
            Stop all
          </button>
        </div>
      </header>

      {showOpenSonos ? (
        <p className="audio-page-hint">
          For Spotify, TuneIn search, and browsing services, use the Sonos app. Favorites below are
          what Home Assistant exposes for each speaker.
        </p>
      ) : (
        <p className="audio-page-hint">
          Streaming search isn’t available here — pick a Sonos favorite below, or open the Sonos app
          on an iPhone/iPad for full browse and search.
        </p>
      )}

      {connectionStatus === 'connected' ? (
        <div className="audio-unit-list audio-unit-list--receiver">
          {receiver.entityId == null ? (
            <p className="irrigation-empty">
              No TV receiver found. Expected media_player.family_room_tv_receiver from the Denon
              AVR integration.
            </p>
          ) : (
            <section
              className={`audio-unit-card audio-receiver-card${
                receiver.on ? ' audio-unit-card--playing' : ''
              }`}
            >
              <div className="audio-unit-top">
                <ReceiverPowerButton
                  on={receiver.on}
                  disabled={receiverControlsDisabled}
                  label={receiver.label}
                  onToggle={() => void toggleReceiver()}
                />
                <div className="audio-unit-copy">
                  <div className="audio-unit-title-row">
                    <h2 className="audio-unit-name">{receiver.label}</h2>
                    <span
                      className={`audio-unit-state${receiver.on ? ' audio-unit-state--live' : ''}`}
                    >
                      {receiver.on ? 'On' : 'Off'}
                    </span>
                  </div>
                  <p className="audio-unit-details">
                    {receiver.on
                      ? receiver.source
                        ? `Input · ${receiver.source}`
                        : 'Input · —'
                      : 'Marantz NR1510'}
                  </p>
                </div>
              </div>

              <label className="audio-unit-source">
                <span className="audio-unit-source-label">Input Source</span>
                <select
                  value={
                    receiver.source && receiver.sources.includes(receiver.source)
                      ? receiver.source
                      : ''
                  }
                  disabled={receiverControlsDisabled || receiver.sources.length === 0}
                  onChange={(event) => {
                    const next = event.target.value
                    if (!next) return
                    void selectReceiverSource(next)
                  }}
                >
                  <option value="">
                    {receiver.sources.length === 0
                      ? 'No sources from Home Assistant'
                      : receiver.source && !receiver.sources.includes(receiver.source)
                        ? `Current: ${receiver.source}`
                        : 'Choose an input…'}
                  </option>
                  {receiver.sources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>

              <label className="audio-unit-volume">
                <span className="audio-unit-volume-label">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={receiver.volumePercent ?? 0}
                  disabled={
                    receiverControlsDisabled || !receiver.on || receiver.volumePercent == null
                  }
                  onChange={(event) => {
                    void setReceiverVolume(Number(event.target.value))
                  }}
                />
                <strong className="audio-unit-volume-value">
                  {!receiver.on
                    ? 'Off'
                    : receiver.muted
                      ? 'Muted'
                      : receiver.volumePercent != null
                        ? `${receiver.volumePercent}%`
                        : '—'}
                </strong>
              </label>
            </section>
          )}
        </div>
      ) : null}

      {connectionStatus !== 'connected' ? (
        <p className="irrigation-empty">Connect to Home Assistant to load Sonos units.</p>
      ) : units.length === 0 ? (
        <p className="irrigation-empty">
          No Sonos media players found. Make sure the Sonos integration is configured in Home
          Assistant.
        </p>
      ) : (
        <div className="audio-unit-list">
          {units.map((unit) => {
            const pending = pendingByKey[unit.entityId] ?? null
            const { checked: displayPlaying } = displayToggleState(unit.playing, pending)
            const detailBits = [
              displayPlaying || unit.paused
                ? [unit.mediaArtist, unit.mediaTitle].filter(Boolean).join(' — ')
                : null,
            ].filter(Boolean)
            const selectedSource = unit.source ?? unit.station ?? ''
            const stateLabel = pending
              ? displayPlaying
                ? 'Starting…'
                : 'Stopping…'
              : formatSonosState(
                  displayPlaying && !unit.playing
                    ? { ...unit, playing: true, paused: false, state: 'playing' }
                    : !displayPlaying && unit.playing
                      ? { ...unit, playing: false, paused: false, state: 'idle' }
                      : unit,
                )

            return (
              <section
                key={unit.entityId}
                className={`audio-unit-card${displayPlaying ? ' audio-unit-card--playing' : ''}`}
              >
                <div className="audio-unit-top">
                  <UnitPlayStopButton
                    unit={unit}
                    playing={displayPlaying}
                    pending={pending != null}
                    disabled={controlsDisabled}
                    onPlay={() => {
                      startPending(unit.entityId, true)
                      void playSonos(unit.entityId).catch(() => clearPending(unit.entityId))
                    }}
                    onStop={() => {
                      startPending(unit.entityId, false)
                      void stopSonos(unit.entityId).catch(() => clearPending(unit.entityId))
                    }}
                  />
                  <div className="audio-unit-copy">
                    <div className="audio-unit-title-row">
                      <h2 className="audio-unit-name">{unit.label}</h2>
                      <span
                        className={`audio-unit-state${
                          displayPlaying ? ' audio-unit-state--live' : ''
                        }`}
                      >
                        {stateLabel}
                      </span>
                    </div>
                    {detailBits.length > 0 ? (
                      <p className="audio-unit-details">{detailBits.join(' · ')}</p>
                    ) : null}
                  </div>
                </div>

                <label className="audio-unit-source">
                  <span className="audio-unit-source-label">Favorite Source</span>
                  <select
                    value={
                      unit.favorites.includes(selectedSource) ? selectedSource : ''
                    }
                    disabled={controlsDisabled || unit.favorites.length === 0 || pending != null}
                    onChange={(event) => {
                      const next = event.target.value
                      if (!next) return
                      startPending(unit.entityId, true)
                      void selectSonosSource(unit.entityId, next).catch(() =>
                        clearPending(unit.entityId),
                      )
                    }}
                  >
                    <option value="">
                      {unit.favorites.length === 0
                        ? 'No favorites in Home Assistant'
                        : selectedSource && !unit.favorites.includes(selectedSource)
                          ? `Current: ${selectedSource}`
                          : 'Choose a favorite…'}
                    </option>
                    {unit.favorites.map((favorite) => (
                      <option key={favorite} value={favorite}>
                        {favorite}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="audio-unit-volume">
                  <span className="audio-unit-volume-label">Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={unit.volumePercent ?? 0}
                    disabled={controlsDisabled || unit.volumePercent == null}
                    onChange={(event) => {
                      void setSonosVolume(unit.entityId, Number(event.target.value))
                    }}
                  />
                  <strong className="audio-unit-volume-value">
                    {unit.muted
                      ? 'Muted'
                      : unit.volumePercent != null
                        ? `${unit.volumePercent}%`
                        : '—'}
                  </strong>
                </label>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
