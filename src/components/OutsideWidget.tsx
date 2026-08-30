import { useHouse } from '../data/HouseContext'
import { OUTSIDE_MODES, type OutsideMode } from '../ha/outside'

export function OutsideWidget() {
  const {
    outsideTransformers,
    outsideMode,
    connectionStatus,
    setOutsideTransformer,
    setOutsideMode,
  } = useHouse()
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
                {transformer.controls.map((control) => (
                  <label
                    key={control.key}
                    className={`outside-control ${control.entityId ? '' : 'outside-control--missing'}`}
                    title={
                      control.entityId
                        ? `${transformer.label} · ${control.label}`
                        : `${control.label} was not found in Home Assistant`
                    }
                  >
                    <input
                      type="checkbox"
                      checked={control.on === true}
                      disabled={
                        connectionStatus !== 'connected' ||
                        !control.entityId ||
                        control.on == null
                      }
                      onChange={(event) =>
                        setOutsideTransformer(control.key, event.target.checked)
                      }
                      aria-label={`${transformer.label} ${control.label}`}
                    />
                    <span>{control.label}</span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  )
}
