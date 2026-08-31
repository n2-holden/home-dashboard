import { useCallback, useEffect, useMemo } from 'react'
import { PendingToggle } from './PendingToggle'
import { useHouse } from '../data/HouseContext'
import { usePendingToggles } from '../hooks/usePendingToggles'
import { displayToggleState } from '../ha/pendingToggle'
import { OUTSIDE_MODES, type OutsideControlKey, type OutsideMode } from '../ha/outside'

export function OutsideWidget() {
  const {
    outsideTransformers,
    outsideMode,
    connectionStatus,
    setOutsideTransformer,
    setOutsideMode,
  } = useHouse()
  const { pendingByKey, startPending, clearPending, reconcile } = usePendingToggles<OutsideControlKey>()
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

  return (
    <article className="widget">
      <div className="widget-body">
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
                  disabled={connectionStatus !== 'connected'}
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
                      <span>{control.label}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  )
}
