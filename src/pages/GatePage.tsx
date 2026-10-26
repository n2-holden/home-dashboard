import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CameraFrame, findDashboardCamera } from '../components/CameraFrame'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DrivewayEventsStrip } from '../components/DrivewayEventsStrip'
import { useHouse } from '../data/HouseContext'
import { useDoorBirdIntercom } from '../hooks/useDoorBirdIntercom'
import { usePendingToggles } from '../hooks/usePendingToggles'
import { displayToggleState } from '../ha/pendingToggle'
import {
  GATE_CLOSE_PENDING_MS,
  gateStatusLabel,
  type GateSnapshot,
  type GateStatus,
} from '../ha/gate'

const GATE_CAMERA_ID = 'gate-doorbell'
const GATE_KEY = 'gate' as const

function GateIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="outside-garage-icon">
        <rect x="2" y="9.6" width="3.1" height="11" rx="0.45" fill="currentColor" />
        <rect x="18.9" y="9.6" width="3.1" height="11" rx="0.45" fill="currentColor" />
        <rect x="5.15" y="11" width="2.15" height="9.6" rx="0.25" fill="currentColor" />
        <rect x="16.7" y="11" width="2.15" height="9.6" rx="0.25" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="outside-garage-icon">
      <rect x="2" y="9.6" width="3.1" height="11" rx="0.45" fill="currentColor" />
      <rect x="18.9" y="9.6" width="3.1" height="11" rx="0.45" fill="currentColor" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M5.2 11h6.7v9.6H5.2V11zm1.05 0.9h.7v7.8h-.7V11.9zm1.45 0h.7v7.8h-.7V11.9zm1.45 0h.7v7.8h-.7V11.9zm1.45 0h.7v7.8h-.7V11.9zm1.45 0h.7v7.8h-.7V11.9z"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12.1 11h6.7v9.6H12.1V11zm1.05 0.9h.7v7.8h-.7V11.9zm1.45 0h.7v7.8h-.7V11.9zm1.45 0h.7v7.8h-.7V11.9zm1.45 0h.7v7.8h-.7V11.9zm1.45 0h.7v7.8h-.7V11.9z"
      />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="gate-intercom-icon">
      <path
        fill="currentColor"
        d="M4.5 9.2v5.6h3.1L12.2 19V5L7.6 9.2H4.5zm10.1 1.1a2.7 2.7 0 0 1 0 3.4l-1.1-1.1a1.15 1.15 0 0 0 0-1.2l1.1-1.1zm1.9-2.2a5.5 5.5 0 0 1 0 7.8l-1.15-1.15a3.9 3.9 0 0 0 0-5.5L16.5 8.1z"
      />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="gate-intercom-icon">
      <path
        fill="currentColor"
        d="M12 3.5a2.8 2.8 0 0 1 2.8 2.8v5.1a2.8 2.8 0 1 1-5.6 0V6.3A2.8 2.8 0 0 1 12 3.5zm6.1 7.9a.9.9 0 0 0-1.8.15 4.3 4.3 0 0 1-8.6 0 .9.9 0 1 0-1.8-.15 6.1 6.1 0 0 0 5.2 5.9v1.85H9.3a.9.9 0 0 0 0 1.8h5.4a.9.9 0 0 0 0-1.8h-1.8V17.4a6.1 6.1 0 0 0 5.2-5.9z"
      />
    </svg>
  )
}

function GatePageControl({
  gate,
  pending,
  readOnly,
  connected,
  startPending,
  clearPending,
  setGateOpen,
}: {
  gate: GateSnapshot
  pending: { desiredOn: boolean; requestedAt: number } | null
  readOnly: boolean
  connected: boolean
  startPending: (key: typeof GATE_KEY, desiredOn: boolean) => void
  clearPending: (key: typeof GATE_KEY) => void
  setGateOpen: (open: boolean) => Promise<void>
}) {
  const offline = gate.doorbirdOffline
  const sensorOffline = gate.sensorOffline
  const { checked: open } = displayToggleState(
    offline ? false : gate.isOpen,
    offline ? null : pending,
  )
  const status: GateStatus | null = pending
    ? pending.desiredOn
      ? 'opening'
      : 'closing'
    : gate.status
  const flashing = !offline && pending != null
  // DoorBird can still toggle the latch even if the Shelly closed-sensor is down.
  const disabled = readOnly || !connected || offline || pending != null
  const tooltip = offline
    ? 'Gate offline (DoorBird)'
    : sensorOffline
      ? `Gate: ${gateStatusLabel(status)} (sensor offline)`
      : `Gate: ${gateStatusLabel(status)}`
  const [confirmOpen, setConfirmOpen] = useState(false)

  const openGate = useCallback(() => {
    startPending(GATE_KEY, true)
    void setGateOpen(true).catch(() => clearPending(GATE_KEY))
  }, [clearPending, setGateOpen, startPending])

  const handleToggle = useCallback(() => {
    if (offline || pending || disabled) return
    if (!open) {
      setConfirmOpen(true)
      return
    }
    startPending(GATE_KEY, false)
    void setGateOpen(false).catch(() => clearPending(GATE_KEY))
  }, [clearPending, disabled, offline, open, pending, setGateOpen, startPending])

  return (
    <div className="gate-page-control">
      <button
        type="button"
        className={`outside-garage-btn gate-page-gate-btn${
          flashing ? ' outside-garage-btn--pending' : ''
        }${!offline && open ? ' outside-garage-btn--open' : ''}${
          offline ? ' outside-garage-btn--offline' : ''
        }`}
        aria-label={tooltip}
        aria-pressed={offline ? false : open}
        aria-busy={flashing}
        disabled={disabled}
        title={tooltip}
        onClick={handleToggle}
      >
        {offline ? (
          <>
            <GateIcon open={false} />
            <svg className="outside-garage-offline-x" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
              />
            </svg>
          </>
        ) : (
          <GateIcon open={open} />
        )}
      </button>
      <div className="gate-page-control-meta">
        <span className="gate-page-control-label">Gate</span>
        <span className="gate-page-control-status">{tooltip}</span>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        message="Gate is closed. Are you sure you want to open it?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => {
          setConfirmOpen(false)
          openGate()
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

function GateIntercomControls({
  connected,
  readOnly,
}: {
  connected: boolean
  readOnly: boolean
}) {
  const { listening, talking, status, error, toggleListen, toggleTalk } = useDoorBirdIntercom(
    connected,
  )

  const unavailable =
    status != null && status.available === false
      ? status.reason === 'proxy_missing'
        ? 'Intercom proxy not loaded — restart Home Assistant after deploy'
        : status.reason === 'no_doorbird'
          ? 'DoorBird integration not found on Home Assistant'
          : 'Intercom unavailable'
      : null

  const disabled = readOnly || !connected || unavailable != null
  const showIpadHaPanelHint = (() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
    // Only the HA Companion Webpage iframe (not a normal full-page Safari tab).
    if (window.top == null || window.top === window.self) return false
    const ua = navigator.userAgent
    // iPadOS 13+ often reports as Mac; platform + touch covers that.
    const iPadUa = /iPad/i.test(ua)
    const iPadDesktopMode =
      navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number'
        ? navigator.maxTouchPoints > 1
        : false
    return iPadUa || iPadDesktopMode
  })()

  return (
    <div className="gate-intercom">
      <div className="gate-intercom-row">
        <button
          type="button"
          className={`gate-intercom-btn${listening ? ' gate-intercom-btn--active' : ''}`}
          aria-pressed={listening}
          disabled={disabled}
          title={unavailable ?? (listening ? 'Stop listening' : 'Listen to DoorBird')}
          onClick={toggleListen}
        >
          <SpeakerIcon />
          <span>{listening ? 'Listening' : 'Listen'}</span>
        </button>
        <button
          type="button"
          className={`gate-intercom-btn${talking ? ' gate-intercom-btn--talk' : ''}`}
          aria-pressed={talking}
          disabled={disabled}
          title={unavailable ?? (talking ? 'Stop talking' : 'Talk to DoorBird')}
          onClick={toggleTalk}
        >
          <MicIcon />
          <span>{talking ? 'Talking' : 'Talk'}</span>
        </button>
      </div>
      {showIpadHaPanelHint ? (
        <p className="gate-intercom-hint">
          iPad blocks the mic inside the HA app panel.{' '}
          <a
            className="gate-intercom-open"
            href={typeof location !== 'undefined' ? location.href : '#'}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open full page
          </a>{' '}
          for Talk.
        </p>
      ) : null}
      {unavailable ? <p className="gate-intercom-hint">{unavailable}</p> : null}
      {!unavailable && error ? (
        <p className="gate-intercom-hint gate-intercom-hint--error">{error}</p>
      ) : null}
    </div>
  )
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`
}

function DrivewayAlarmPanel({ connected }: { connected: boolean }) {
  const {
    gate,
    drivewayAlarmActive,
    drivewayAlarmLastTriggerAt,
    drivewayAlarmEnabled,
    setDrivewayAlarmEnabled,
    drivewayAlarmResetSeconds,
    drivewayAlarmTrigger,
    activateDrivewayAlarm,
    resetDrivewayAlarm,
    readOnly,
  } = useHouse()
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const resolveAtMs =
    drivewayAlarmActive && drivewayAlarmLastTriggerAt != null
      ? drivewayAlarmLastTriggerAt + drivewayAlarmResetSeconds * 1000
      : null
  const remainingMs = resolveAtMs != null ? resolveAtMs - now : null
  const countdownActive = remainingMs != null && remainingMs > 0

  useEffect(() => {
    if (resolveAtMs == null) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [resolveAtMs])

  const sensorTone =
    gate.drivewaySensorOn == null
      ? 'offline'
      : gate.drivewaySensorOn === (drivewayAlarmTrigger === 'on')
        ? 'detecting'
        : 'clear'
  const sensorLabel =
    sensorTone === 'offline' ? 'Offline' : sensorTone === 'detecting' ? 'Detecting' : 'Clear'
  const alarmLabel = !drivewayAlarmEnabled ? 'Turned off' : drivewayAlarmActive ? 'Active' : 'Idle'
  const canRun = !readOnly && connected && drivewayAlarmEnabled && !busy

  const run = (action: () => Promise<void>) => {
    setBusy(true)
    void action().finally(() => setBusy(false))
  }

  return (
    <article className="widget driveway-alarm-panel">
      <div className="widget-body">
        <div className="widget-title-row driveway-alarm-head">
          <h2 className="widget-title">Driveway alarm</h2>
          <label className="driveway-alarm-enabled">
            <input
              type="checkbox"
              checked={drivewayAlarmEnabled}
              disabled={readOnly || !connected}
              onChange={(e) => setDrivewayAlarmEnabled(e.target.checked)}
            />
            <span>Enabled</span>
          </label>
        </div>
        <div className="driveway-alarm-status">
          <span className={`driveway-alarm-dot driveway-alarm-dot--${sensorTone}`} aria-hidden="true" />
          <span>
            Sensor: <strong>{sensorLabel}</strong>
          </span>
          <span>
            Alarm: <strong>{alarmLabel}</strong>
          </span>
        </div>
        {gate.sensorBlocked ? (
          <p className="driveway-alarm-warning">Driveway blocked — sensor Off for over 30 minutes</p>
        ) : null}
        <div className="toolbar driveway-alarm-actions">
          <button
            type="button"
            className="btn"
            disabled={!canRun || drivewayAlarmActive}
            onClick={() => run(activateDrivewayAlarm)}
          >
            Trigger alarm
          </button>
          <button
            type="button"
            className="btn"
            disabled={readOnly || !connected || busy || !countdownActive}
            onClick={() => run(resetDrivewayAlarm)}
          >
            Resolve alarm
          </button>
          {countdownActive ? (
            <span className="driveway-alarm-countdown">
              Resolves in {formatCountdown(remainingMs ?? 0)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function GatePage() {
  const { gate, connectionStatus, setGateOpen, readOnly } = useHouse()
  const { pendingByKey, startPending, clearPending, reconcile } = usePendingToggles<
    typeof GATE_KEY
  >({ giveUpMs: GATE_CLOSE_PENDING_MS })

  useEffect(() => {
    reconcile({ [GATE_KEY]: gate.isOpen })
  }, [gate.isOpen, reconcile])

  const camera = useMemo(() => findDashboardCamera(GATE_CAMERA_ID), [])
  const enabled = connectionStatus === 'connected'

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Gate</h1>
        <p>DoorBird camera and driveway gate</p>
      </header>

      {connectionStatus !== 'connected' ? (
        <p className="irrigation-empty">Connect to Home Assistant to view the gate camera.</p>
      ) : (
        <div className="gate-page">
          <article className="widget camera-hero">
            <div className="widget-body">
              {camera ? (
                <CameraFrame
                  camera={camera}
                  enabled={enabled}
                  className="camera-frame camera-frame--hero"
                />
              ) : (
                <div className="camera-frame camera-frame--hero">
                  <div className="camera-frame-placeholder">Camera not configured</div>
                </div>
              )}
            </div>
          </article>

          <div className="gate-page-toolbar">
            <GatePageControl
              gate={gate}
              pending={pendingByKey[GATE_KEY] ?? null}
              readOnly={readOnly}
              connected={enabled}
              startPending={startPending}
              clearPending={clearPending}
              setGateOpen={setGateOpen}
            />
            <GateIntercomControls connected={enabled} readOnly={readOnly} />
          </div>

          <DrivewayEventsStrip />

          <DrivewayAlarmPanel connected={enabled} />
        </div>
      )}
    </main>
  )
}
