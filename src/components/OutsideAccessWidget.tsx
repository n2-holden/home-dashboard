import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from './ConfirmDialog'
import { useHouse } from '../data/HouseContext'
import { usePendingToggles } from '../hooks/usePendingToggles'
import { displayToggleState } from '../ha/pendingToggle'
import { garageStatusLabel, type GarageDoorSnapshot } from '../ha/garage'
import {
  GATE_CLOSE_PENDING_MS,
  gateStatusLabel,
  type GateSnapshot,
  type GateStatus,
} from '../ha/gate'
import {
  DRIVEWAY_ALARM_OFF_SRC,
  DRIVEWAY_ALARM_ON_SRC,
} from '../assets/drivewayAlarmIcons'

const MAIN_GARAGE_KEY = 'mainGarage' as const
const WORKSHOP_GARAGE_KEY = 'workshopGarage' as const
const GATE_KEY = 'gate' as const
type GarageKey = typeof MAIN_GARAGE_KEY | typeof WORKSHOP_GARAGE_KEY
type AccessPendingKey = GarageKey | typeof GATE_KEY

function GarageDoorIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="outside-garage-icon">
        <path fill="currentColor" d="M12 3.4 20.8 10.8V20.6H3.2V10.8L12 3.4z" />
        <rect x="7.2" y="12.4" width="9.6" height="8.2" fill="#ffffff" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="outside-garage-icon">
      <path fill="currentColor" d="M12 3.4 20.8 10.8V20.6H3.2V10.8L12 3.4z" />
      <rect x="7.2" y="12.4" width="9.6" height="8.2" fill="#8a8a8a" />
      <path
        d="M7.2 20.6V12.4H16.8V20.6"
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="1.35"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

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

function GarageDoorControl({
  title,
  name,
  garage,
  pendingKey,
  pending,
  readOnly,
  connected,
  startPending,
  clearPending,
  setGarageDoor,
}: {
  title: string
  name: string
  garage: GarageDoorSnapshot
  pendingKey: GarageKey
  pending: { desiredOn: boolean; requestedAt: number } | null
  readOnly: boolean
  connected: boolean
  startPending: (key: AccessPendingKey, desiredOn: boolean) => void
  clearPending: (key: AccessPendingKey) => void
  setGarageDoor: (open: boolean) => Promise<void>
}) {
  const offline = garage.offline || !garage.entityId
  const moving = !offline && (garage.status === 'opening' || garage.status === 'closing')
  const flashing = !offline && (moving || pending != null)
  const { checked: open, unavailable } = displayToggleState(
    offline ? false : garage.isOpen,
    offline ? null : pending,
  )
  const disabled = readOnly || !connected || offline || unavailable
  const tooltip = offline
    ? 'Offline'
    : !garage.entityId
      ? `${name} door not found in Home Assistant`
      : `${name}: ${garageStatusLabel(garage.status)}`

  const handleToggle = useCallback(() => {
    if (offline || pending || disabled || moving) return
    const desiredOpen = !open
    startPending(pendingKey, desiredOpen)
    void setGarageDoor(desiredOpen).catch(() => clearPending(pendingKey))
  }, [
    clearPending,
    disabled,
    moving,
    offline,
    open,
    pending,
    pendingKey,
    setGarageDoor,
    startPending,
  ])

  return (
    <div className="outside-garage">
      <span className="outside-garage-label">{title}</span>
      <button
        type="button"
        className={`outside-garage-btn${flashing ? ' outside-garage-btn--pending' : ''}${
          !offline && open ? ' outside-garage-btn--open' : ''
        }${garage.status === 'stuck' && !offline ? ' outside-garage-btn--stuck' : ''}${
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
            <GarageDoorIcon open={false} />
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
          <GarageDoorIcon open={open} />
        )}
      </button>
    </div>
  )
}

function DoorbellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="outside-doorbell-icon">
      {/* Station body */}
      <rect
        x="4.5"
        y="2.5"
        width="11.5"
        height="19"
        rx="2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1="4.5"
        y1="9.1"
        x2="16"
        y2="9.1"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {/* Camera + side sensors */}
      <circle cx="10.25" cy="5.8" r="1.55" fill="currentColor" />
      <circle cx="6.85" cy="5.8" r="0.55" fill="currentColor" />
      <circle cx="13.65" cy="5.8" r="0.55" fill="currentColor" />
      {/* Bell */}
      <path
        d="M10.25 11.15v0.85M7.15 14.1c0-1.85 1.25-3.05 3.1-3.05s3.1 1.2 3.1 3.05c0 1.15.35 1.7.7 2.15H6.45c.35-.45.7-1 .7-2.15z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 16.25c.25.55.7.9 1.05.9s.8-.35 1.05-.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <line
        x1="10.25"
        y1="17.15"
        x2="10.25"
        y2="18.05"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      {/* Signal waves */}
      <path
        d="M17.35 9.4c1.05 1.15 1.05 3.05 0 4.2M19.55 7.85c2.05 2.05 2.05 5.25 0 7.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function OfflineXIcon() {
  return (
    <svg className="outside-garage-offline-x" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Red prohibition / “no” symbol — gate closed-sensor Off for too long. */
function NoSymbolIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'outside-driveway-blocked-icon'}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <path
        d="M6.8 6.8 17.2 17.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Uses the provided off/on PNGs so geometry matches the art (crossing driveway edges). */
function DrivewayAlarmIcons() {
  return (
    <>
      <img
        src={DRIVEWAY_ALARM_OFF_SRC}
        alt=""
        draggable={false}
        className="outside-driveway-alarm-icon outside-driveway-alarm-icon--off"
      />
      <img
        src={DRIVEWAY_ALARM_ON_SRC}
        alt=""
        draggable={false}
        className="outside-driveway-alarm-icon outside-driveway-alarm-icon--on"
      />
    </>
  )
}

function GateControl({
  gate,
  doorbellRinging,
  drivewayAlarmActive,
  drivewayAlarmEnabled,
  pending,
  readOnly,
  connected,
  startPending,
  clearPending,
  setGateOpen,
  activateDrivewayAlarm,
  resetDrivewayAlarm,
}: {
  gate: GateSnapshot
  doorbellRinging: boolean
  drivewayAlarmActive: boolean
  drivewayAlarmEnabled: boolean
  pending: { desiredOn: boolean; requestedAt: number } | null
  readOnly: boolean
  connected: boolean
  startPending: (key: AccessPendingKey, desiredOn: boolean) => void
  clearPending: (key: AccessPendingKey) => void
  setGateOpen: (open: boolean) => Promise<void>
  activateDrivewayAlarm: () => Promise<void>
  resetDrivewayAlarm: () => Promise<void>
}) {
  const offline = gate.doorbirdOffline
  const sensorOffline = gate.sensorOffline
  const sensorBlocked = gate.sensorBlocked
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

  const drivewayClickable = !readOnly && connected && drivewayAlarmEnabled
  const handleDrivewayClick = useCallback(() => {
    if (!drivewayClickable) return
    if (drivewayAlarmActive) void resetDrivewayAlarm()
    else void activateDrivewayAlarm()
  }, [
    activateDrivewayAlarm,
    drivewayAlarmActive,
    drivewayClickable,
    resetDrivewayAlarm,
  ])

  return (
    <div className="outside-garage outside-garage--gate">
      <div className="outside-gate-alerts" aria-live="polite">
        <span className="outside-garage-label">Driveway</span>
        <div className="outside-gate-alerts-icons">
          <button
            type="button"
            className={`outside-driveway-alarm${
              drivewayAlarmActive
                ? ' outside-driveway-alarm--active'
                : ' outside-driveway-alarm--idle'
            }${drivewayClickable ? ' outside-driveway-alarm--clickable' : ''}${
              sensorOffline ? ' outside-driveway-alarm--offline' : ''
            }`}
            title={
              sensorOffline
                ? 'Driveway alarm sensor offline (Shelly)'
                : drivewayAlarmActive
                  ? 'Driveway alarm active — click to run reset actions'
                  : drivewayAlarmEnabled
                    ? 'Driveway alarm idle — click to run trigger'
                    : 'Driveway alarm disabled'
            }
            aria-label={
              sensorOffline
                ? 'Driveway alarm sensor offline'
                : drivewayAlarmActive
                  ? 'Driveway alarm active — run reset'
                  : 'Driveway alarm idle — run trigger'
            }
            disabled={!drivewayClickable}
            onClick={handleDrivewayClick}
          >
            <DrivewayAlarmIcons />
            {sensorOffline ? <OfflineXIcon /> : null}
          </button>
          {sensorBlocked ? (
            <span
              className="outside-driveway-blocked"
              title="Gate - Sensor (driveway blocked) — Off for over 30 minutes"
              aria-label="Gate - Sensor (driveway blocked)"
            >
              <NoSymbolIcon />
            </span>
          ) : null}
          <Link
            to="/gate"
            className={`outside-doorbell${
              doorbellRinging ? ' outside-doorbell--active' : ' outside-doorbell--idle'
            }`}
            title={doorbellRinging ? 'Doorbell pressed — open Gate' : 'Open Gate'}
            aria-label={doorbellRinging ? 'Doorbell pressed — open Gate page' : 'Open Gate page'}
          >
            <DoorbellIcon />
          </Link>
        </div>
      </div>
      <span className="outside-garage-label">Gate</span>
      <button
        type="button"
        className={`outside-garage-btn${flashing ? ' outside-garage-btn--pending' : ''}${
          !offline && open ? ' outside-garage-btn--open' : ''
        }${offline ? ' outside-garage-btn--offline' : ''}`}
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
            <OfflineXIcon />
          </>
        ) : (
          <GateIcon open={open} />
        )}
      </button>
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

type Props = {
  /** When true, render as a standalone widget with title (Mini Dash). */
  standalone?: boolean
}

/** Gate + Detached + Main garage controls from the Outside widget. */
export function OutsideAccessWidget({ standalone = false }: Props) {
  const {
    gate,
    doorbellRinging,
    drivewayAlarmActive,
    drivewayAlarmEnabled,
    mainGarage,
    workshopGarage,
    connectionStatus,
    setGateOpen,
    setMainGarageDoor,
    setWorkshopGarageDoor,
    activateDrivewayAlarm,
    resetDrivewayAlarm,
    readOnly,
  } = useHouse()
  const { pendingByKey, startPending, clearPending, reconcile } =
    usePendingToggles<AccessPendingKey>({ giveUpMs: GATE_CLOSE_PENDING_MS })

  const actualByKey = useMemo(
    () => ({
      [GATE_KEY]: gate.isOpen,
      [MAIN_GARAGE_KEY]: mainGarage.isOpen,
      [WORKSHOP_GARAGE_KEY]: workshopGarage.isOpen,
    }),
    [gate.isOpen, mainGarage.isOpen, workshopGarage.isOpen],
  )

  useEffect(() => {
    reconcile(actualByKey)
  }, [actualByKey, reconcile])

  const connected = connectionStatus === 'connected'
  const status =
    connectionStatus !== 'connected'
      ? 'Not connected'
      : gate.doorbirdOffline && gate.sensorOffline && mainGarage.offline && workshopGarage.offline
        ? 'Offline'
        : 'Live'

  const row = (
    <div className="outside-garage-row">
      <GateControl
        gate={gate}
        doorbellRinging={doorbellRinging}
        drivewayAlarmActive={drivewayAlarmActive}
        drivewayAlarmEnabled={drivewayAlarmEnabled}
        pending={pendingByKey[GATE_KEY] ?? null}
        readOnly={readOnly}
        connected={connected}
        startPending={startPending}
        clearPending={clearPending}
        setGateOpen={setGateOpen}
        activateDrivewayAlarm={activateDrivewayAlarm}
        resetDrivewayAlarm={resetDrivewayAlarm}
      />
      <GarageDoorControl
        title="Detached"
        name="Detached garage"
        garage={workshopGarage}
        pendingKey={WORKSHOP_GARAGE_KEY}
        pending={pendingByKey[WORKSHOP_GARAGE_KEY] ?? null}
        readOnly={readOnly}
        connected={connected}
        startPending={startPending}
        clearPending={clearPending}
        setGarageDoor={setWorkshopGarageDoor}
      />
      <GarageDoorControl
        title="Main"
        name="Main garage"
        garage={mainGarage}
        pendingKey={MAIN_GARAGE_KEY}
        pending={pendingByKey[MAIN_GARAGE_KEY] ?? null}
        readOnly={readOnly}
        connected={connected}
        startPending={startPending}
        clearPending={clearPending}
        setGarageDoor={setMainGarageDoor}
      />
    </div>
  )

  if (!standalone) return row

  return (
    <article className="widget outside-access-standalone">
      <div className="widget-body">
        <div className="widget-title-row">
          <h2 className="widget-title">Outside</h2>
          {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
        </div>
        {row}
      </div>
    </article>
  )
}
