import { useCallback, useEffect, useMemo } from 'react'
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

function GateControl({
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
  startPending: (key: AccessPendingKey, desiredOn: boolean) => void
  clearPending: (key: AccessPendingKey) => void
  setGateOpen: (open: boolean) => Promise<void>
}) {
  const offline = gate.offline
  const { checked: open, unavailable } = displayToggleState(
    offline ? false : gate.isOpen,
    offline ? null : pending,
  )
  const status: GateStatus | null = pending
    ? pending.desiredOn
      ? 'opening'
      : 'closing'
    : gate.status
  const flashing = !offline && pending != null
  const disabled = readOnly || !connected || offline || unavailable || pending != null
  const tooltip = offline ? 'Gate offline' : `Gate: ${gateStatusLabel(status)}`

  const handleToggle = useCallback(() => {
    if (offline || pending || disabled) return
    const desiredOpen = !open
    startPending(GATE_KEY, desiredOpen)
    void setGateOpen(desiredOpen).catch(() => clearPending(GATE_KEY))
  }, [clearPending, disabled, offline, open, pending, setGateOpen, startPending])

  return (
    <div className="outside-garage">
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
    mainGarage,
    workshopGarage,
    connectionStatus,
    setGateOpen,
    setMainGarageDoor,
    setWorkshopGarageDoor,
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
      : gate.offline && mainGarage.offline && workshopGarage.offline
        ? 'Offline'
        : 'Live'

  const row = (
    <div className="outside-garage-row">
      <GateControl
        gate={gate}
        pending={pendingByKey[GATE_KEY] ?? null}
        readOnly={readOnly}
        connected={connected}
        startPending={startPending}
        clearPending={clearPending}
        setGateOpen={setGateOpen}
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
