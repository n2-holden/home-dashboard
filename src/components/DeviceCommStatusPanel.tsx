import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { isDeviceCommNotifyEnabled } from '../ha/dashboardSettings'
import { formatDataAge } from '../ha/energy'
import { DeferredNumberInput } from './DeferredNumberInput'

type Props = {
  /** When true, open the table if URL has ?comm=1 (default true). */
  honorQuery?: boolean
  /** Start with the table expanded. */
  defaultOpen?: boolean
  /** Show master alert toggle + per-device Notify column (Communication tab). */
  showNotifyControls?: boolean
}

export function DeviceCommStatusPanel({
  honorQuery = true,
  defaultOpen = false,
  showNotifyControls = true,
}: Props) {
  const {
    deviceCommStatus,
    deviceCommFailureEmailEnabled,
    setDeviceCommFailureEmailEnabled,
    deviceCommFailureMinutes,
    setDeviceCommFailureMinutes,
    deviceCommNotifyEnabled,
    setDeviceCommNotifyEnabled,
    connectionStatus,
    readOnly,
  } = useHouse()
  const [searchParams, setSearchParams] = useSearchParams()
  const openFromQuery = honorQuery && searchParams.get('comm') === '1'
  const [open, setOpen] = useState(defaultOpen || openFromQuery)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (openFromQuery) setOpen(true)
  }, [openFromQuery])

  useEffect(() => {
    if (!open) return
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [open])

  const rows = useMemo(
    () =>
      [...deviceCommStatus]
        .map((row) => ({
          ...row,
          lastAttemptLabel:
            row.succeeded === false && row.lastAttemptAtMs != null
              ? formatDataAge(row.lastAttemptAtMs, nowMs) ?? '—'
              : row.succeeded === true
                ? '—'
                : row.lastAttemptLabel,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
    [deviceCommStatus, nowMs],
  )

  function toggleOpen() {
    const nextOpen = !open
    setOpen(nextOpen)
    if (!honorQuery) return
    const next = new URLSearchParams(searchParams)
    if (nextOpen) next.set('comm', '1')
    else next.delete('comm')
    setSearchParams(next, { replace: true })
  }

  const controlsDisabled = readOnly || connectionStatus !== 'connected'
  const colCount = showNotifyControls ? 4 : 3

  return (
    <div className="device-comm-status-panel">
      <div className="device-comm-status-panel__toolbar">
        <button
          type="button"
          className={`btn btn--compact${open ? ' btn--accent' : ''}`}
          onClick={toggleOpen}
          aria-expanded={open}
        >
          Last Communication
        </button>
      </div>
      {showNotifyControls ? (
        <div className="notify-device-comm" style={{ marginBottom: open ? '0.55rem' : 0 }}>
          <div className="notify-device-comm-row">
            <label className="trends-toggle" style={{ flexWrap: 'wrap', flex: '1 1 auto' }}>
              <input
                type="checkbox"
                checked={deviceCommFailureEmailEnabled}
                disabled={controlsDisabled}
                onChange={(e) => setDeviceCommFailureEmailEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label">Device communication failure</span>
              <span className="trends-toggle-label" style={{ opacity: 0.85, gap: '0.45rem' }}>
                Notify after
                <DeferredNumberInput
                  min={1}
                  max={1440}
                  step={1}
                  value={deviceCommFailureMinutes}
                  disabled={controlsDisabled || !deviceCommFailureEmailEnabled}
                  onCommit={setDeviceCommFailureMinutes}
                  style={{ width: '4.5rem' }}
                  aria-label="Minutes before communication failure notification"
                />
                minutes
              </span>
            </label>
          </div>
          {open ? (
            <p className="settings-copy" style={{ margin: '0.15rem 0 0' }}>
              Uncheck Notify on a row to mute alerts for that device. Master toggle above must also
              be on, along with email and/or phone under Notification.
            </p>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <div className="device-comm-table-wrap">
          <table className="device-comm-table">
            <thead>
              <tr>
                <th scope="col">Device</th>
                <th scope="col">Failure time</th>
                <th scope="col">Result</th>
                {showNotifyControls ? <th scope="col">Notify</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="device-comm-table-empty">
                    No device communication status yet
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const notifyOn = isDeviceCommNotifyEnabled(deviceCommNotifyEnabled, row.key)
                  return (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{row.lastAttemptLabel}</td>
                      <td>
                        <span
                          className={`device-comm-result device-comm-result--${
                            row.succeeded === true
                              ? 'ok'
                              : row.succeeded === false
                                ? 'fail'
                                : 'unknown'
                          }`}
                        >
                          {row.resultLabel}
                        </span>
                      </td>
                      {showNotifyControls ? (
                        <td>
                          <label className="device-comm-notify-cell">
                            <input
                              type="checkbox"
                              checked={notifyOn}
                              disabled={controlsDisabled || !deviceCommFailureEmailEnabled}
                              onChange={(e) =>
                                setDeviceCommNotifyEnabled(row.key, e.target.checked)
                              }
                              aria-label={`Notify for ${row.label}`}
                            />
                          </label>
                        </td>
                      ) : null}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
