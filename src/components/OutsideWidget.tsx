import { useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PendingToggle } from './PendingToggle'
import { CommOutageIcon } from './CommOutageIcon'
import { OutsideDimmerPopover } from './OutsideDimmerPopover'
import { OutsideAccessWidget } from './OutsideAccessWidget'
import { useHouse } from '../data/HouseContext'
import { usePendingToggles } from '../hooks/usePendingToggles'
import { displayToggleState } from '../ha/pendingToggle'
import { widgetHasCommOutage } from '../ha/deviceCommWidgets'
import { OUTSIDE_MODES, type OutsideControlKey, type OutsideMode } from '../ha/outside'

const BALL_FOUNTAIN_FILL_KEY = 'ballFountainFill' as const

export function OutsideWidget() {
  const {
    outsideTransformers,
    outsideMode,
    outsideButtons,
    outsideButtonActiveIds,
    cistern,
    ballFountain,
    setBallFountainFill,
    connectionStatus,
    setOutsideTransformer,
    setOutsideTransformerBrightness,
    setOutsideMode,
    runOutsideButton,
    deactivateOutsideButton,
    readOnly,
    deviceCommStatus,
  } = useHouse()
  const { pendingByKey, startPending, clearPending, reconcile } =
    usePendingToggles<OutsideControlKey>()
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
  const commOutage = widgetHasCommOutage(deviceCommStatus, 'outside')

  const actualByKey = useMemo(
    () => Object.fromEntries(controls.map((control) => [control.key, control.on])),
    [controls],
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

  const {
    pendingByKey: fillPendingByKey,
    startPending: startFillPending,
    clearPending: clearFillPending,
    reconcile: reconcileFill,
  } = usePendingToggles<typeof BALL_FOUNTAIN_FILL_KEY>()
  useEffect(() => {
    reconcileFill({ [BALL_FOUNTAIN_FILL_KEY]: ballFountain.fillOn })
  }, [ballFountain.fillOn, reconcileFill])
  const handleFillToggle = useCallback(
    (desiredOn: boolean) => {
      startFillPending(BALL_FOUNTAIN_FILL_KEY, desiredOn)
      void setBallFountainFill(desiredOn).catch(() => clearFillPending(BALL_FOUNTAIN_FILL_KEY))
    },
    [clearFillPending, setBallFountainFill, startFillPending],
  )
  const fillPending = fillPendingByKey[BALL_FOUNTAIN_FILL_KEY] ?? null
  const { checked: fillChecked, unavailable: fillUnavailable } = displayToggleState(
    ballFountain.fillOn,
    fillPending,
  )

  return (
    <article className="widget">
      <div className="widget-body outside-widget-body">
        <div className="thermal-overview-header outside-header">
          <div>
            <div className="widget-title-row">
              <h2 className="widget-title">Outside</h2>
              {commOutage ? <CommOutageIcon /> : null}
              {status !== 'Live' ? <span className="widget-meta">{status}</span> : null}
            </div>
          </div>
          <div className="outside-header-actions">
            <div className="outside-mode-buttons" role="group" aria-label="Outside mode">
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
            {outsideButtons.length > 0 ? (
              <div
                className="outside-custom-buttons"
                role="group"
                aria-label="Custom Outside buttons"
              >
                {outsideButtons.map((button) => {
                  const active = outsideButtonActiveIds.includes(button.id)
                  if (active) {
                    const activeLabel = button.activeName.trim() || 'Active'
                    return (
                      <button
                        key={button.id}
                        type="button"
                        className="btn btn--compact outside-custom-button outside-custom-button--active"
                        disabled={readOnly || connectionStatus !== 'connected'}
                        title={`${activeLabel} — click to deactivate`}
                        aria-label={`${activeLabel} — deactivate`}
                        onClick={() => void deactivateOutsideButton(button.id)}
                      >
                        {activeLabel}
                      </button>
                    )
                  }
                  return (
                    <button
                      key={button.id}
                      type="button"
                      className="btn btn--compact outside-custom-button"
                      disabled={
                        readOnly ||
                        connectionStatus !== 'connected' ||
                        button.actions.length === 0
                      }
                      title={
                        button.actions.length === 0
                          ? `${button.name} (no actions configured)`
                          : button.name
                      }
                      onClick={() => void runOutsideButton(button.id)}
                    >
                      {button.name}
                    </button>
                  )
                })}
              </div>
            ) : null}
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
          <div className="outside-water">
            <Link
              className="outside-cistern"
              to="/trends?tab=water"
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
            <div
              className="outside-cistern outside-ball-fountain"
              title={
                ballFountain.levelInches == null
                  ? 'Ball Fountain water level unavailable'
                  : `Ball Fountain water level ${ballFountain.levelLabel}`
              }
            >
              <span className="outside-cistern-label">Ball Fountain</span>
              <span
                className={`outside-cistern-value${
                  ballFountain.levelInches == null ? ' outside-cistern-value--empty' : ''
                }`}
              >
                {ballFountain.levelLabel}
              </span>
              <div
                className="outside-ball-fountain-fill"
                title={
                  ballFountain.fillOn == null
                    ? 'Ball fountain filler unavailable'
                    : ballFountain.fillOn
                      ? 'Ball fountain filler open — click to close'
                      : 'Ball fountain filler closed — click to open'
                }
              >
                <PendingToggle
                  checked={fillChecked}
                  pending={fillPending != null}
                  disabled={readOnly || connectionStatus !== 'connected' || fillUnavailable}
                  label="Ball fountain fill"
                  onToggle={handleFillToggle}
                />
                <span>Fill</span>
              </div>
              {ballFountain.fillError ? (
                <Link
                  className="pond-fill-error-badge"
                  to="/settings?tab=automation"
                  title="Auto fill paused: the level didn't rise or the valve didn't open. Clear it in Settings."
                >
                  Fill error
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <OutsideAccessWidget />
      </div>
    </article>
  )
}
