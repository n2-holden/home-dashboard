import { useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PendingToggle } from './PendingToggle'
import { OutsideDimmerPopover } from './OutsideDimmerPopover'
import { useHouse } from '../data/HouseContext'
import { usePendingToggles } from '../hooks/usePendingToggles'
import { displayToggleState } from '../ha/pendingToggle'
import { garageStatusLabel, type GarageDoorSnapshot } from '../ha/garage'
import { OUTSIDE_MODES, type OutsideControlKey, type OutsideMode } from '../ha/outside'

const MAIN_GARAGE_KEY = 'mainGarage' as const
const WORKSHOP_GARAGE_KEY = 'workshopGarage' as const
type GarageKey = typeof MAIN_GARAGE_KEY | typeof WORKSHOP_GARAGE_KEY

function GarageDoorIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="outside-garage-icon">
        <path fill="currentColor" d="M12 3.4 20.8 10.8V20.6H3.2V10.8L12 3.4z" />
        <rect x="7.2" y="12.4" width="9.6" height="6.6" fill="#ffffff" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="outside-garage-icon">
      <path fill="currentColor" d="M12 3.4 20.8 10.8V20.6H3.2V10.8L12 3.4z" />
      <rect
        x="7.2"
        y="12.4"
        width="9.6"
        height="6.6"
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="1.35"
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
  startPending: (key: GarageKey, desiredOn: boolean) => void
  clearPending: (key: GarageKey) => void
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
            <svg
              className="outside-garage-offline-x"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
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

export function OutsideWidget() {
  const {
    outsideTransformers,
    outsideMode,
    cistern,
    mainGarage,
    workshopGarage,
    connectionStatus,
    setOutsideTransformer,
    setOutsideTransformerBrightness,
    setOutsideMode,
    setMainGarageDoor,
    setWorkshopGarageDoor,
    readOnly,
  } = useHouse()
  const { pendingByKey, startPending, clearPending, reconcile } =
    usePendingToggles<OutsideControlKey | GarageKey>()
  const controls = outsideTransformers.flatMap((transformer) => transformer.controls)
  const availableCount = controls.filter((control) => control.entityId).length
  const status =
    connectionStatus !== 'connected'
      ? 'Not connected'
      : outsideTransformers.length === 0
        ? 'Waiting for data'
        : availableCount === controls.length
          ? 'Live'
          : availableCount > 0
            ? 'Live (partial)'
            : 'Transformers not found'

  const actualByKey = useMemo(
    () => ({
      ...Object.fromEntries(controls.map((control) => [control.key, control.on])),
      [MAIN_GARAGE_KEY]:
        mainGarage.status === 'open' ? true : mainGarage.status === 'closed' ? false : null,
      [WORKSHOP_GARAGE_KEY]:
        workshopGarage.status === 'open'
          ? true
          : workshopGarage.status === 'closed'
            ? false
            : null,
    }),
    [controls, mainGarage.status, workshopGarage.status],
  )

  useEffect(() => {
    reconcile(actualByKey)
  }, [actualByKey, reconcile])

  const handleToggle = useCallback(
    (key: OutsideControlKey, desiredOn: boolean) => {
      startPending(key, desiredOn)
      void setOutsideTransformer(key, desiredOn).catch(() => clearPending(key))
    },
    [clearPending, setOutsideTransformer, startPending],
  )

  return (
    <article className="widget">
      <div className="widget-body outside-widget-body">
        <div className="thermal-overview-header outside-header">
          <div>
            <div className="widget-title-row">
              <h2 className="widget-title">Outside</h2>
              {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
            </div>
          </div>
          <div className="outside-mode">
            <div className="outside-mode-buttons">
              {OUTSIDE_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`btn btn--compact outside-mode-button ${
                    mode === outsideMode ? 'outside-mode-button--active' : ''
                  }`}
                  disabled={readOnly || connectionStatus !== 'connected'}
                  onClick={() => setOutsideMode(mode as OutsideMode)}
                  aria-pressed={mode === outsideMode}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="outside-transformers">
          {outsideTransformers.map((transformer) => (
            <section key={transformer.key} className="outside-transformer">
              <h3 className="outside-transformer-label">{transformer.label}</h3>
              <div className="outside-transformer-controls">
                {transformer.controls.map((control) => {
                  const pending = pendingByKey[control.key] ?? null
                  const { checked, unavailable } = displayToggleState(control.on, pending)
                  const isPending = pending != null
                  const label = `${transformer.label} ${control.label}`
                  const disabled =
                    readOnly ||
                    connectionStatus !== 'connected' ||
                    !control.entityId ||
                    unavailable

                  return (
                    <div
                      key={control.key}
                      className={`outside-control ${control.entityId ? '' : 'outside-control--missing'}`}
                      title={
                        control.entityId
                          ? label
                          : `${control.label} was not found in Home Assistant`
                      }
                    >
                      <PendingToggle
                        checked={checked}
                        pending={isPending}
                        disabled={disabled}
                        label={label}
                        onToggle={(next) => handleToggle(control.key, next)}
                      />
                      <div className="outside-control-label-row">
                        <span>{control.label}</span>
                        {control.dimmable ? (
                          <OutsideDimmerPopover
                            controlKey={control.key}
                            label={control.label}
                            brightness={control.brightness}
                            disabled={disabled}
                            onChange={setOutsideTransformerBrightness}
                          />
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          <Link
            className="outside-cistern"
            to="/trends"
            title={
              cistern.levelPercent == null
                ? 'Cistern water level unavailable — open trends'
                : `Cistern water level ${cistern.formatted} — open trends`
            }
          >
            <span className="outside-cistern-label">Cistern</span>
            <span
              className={`outside-cistern-value${
                cistern.levelPercent == null ? ' outside-cistern-value--empty' : ''
              }`}
            >
              {cistern.formatted}
            </span>
          </Link>
        </div>

        <div className="outside-garage-row">
          <GarageDoorControl
            title="Workshop"
            name="Workshop garage"
            garage={workshopGarage}
            pendingKey={WORKSHOP_GARAGE_KEY}
            pending={pendingByKey[WORKSHOP_GARAGE_KEY] ?? null}
            readOnly={readOnly}
            connected={connectionStatus === 'connected'}
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
            connected={connectionStatus === 'connected'}
            startPending={startPending}
            clearPending={clearPending}
            setGarageDoor={setMainGarageDoor}
          />
        </div>
      </div>
    </article>
  )
}
