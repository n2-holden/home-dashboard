import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import {
  CONTROL_LOG_RETENTION_DAYS,
  fetchControlLog,
  formatControlLogDetail,
  formatControlLogTime,
  type ControlLogEntry,
} from '../ha/controlLog'

export function ControlLogPage() {
  const { clearControlLog, readOnly } = useHouse()
  const [entries, setEntries] = useState<ControlLogEntry[]>([])
  const [status, setStatus] = useState('Loading…')
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setStatus('Loading…')
    try {
      const next = await fetchControlLog()
      setEntries(next)
      setStatus(
        next.length === 0
          ? 'No control events yet'
          : `${next.length} event${next.length === 1 ? '' : 's'} · last ${CONTROL_LOG_RETENTION_DAYS} days`,
      )
    } catch (err) {
      setEntries([])
      setError(err instanceof Error ? err.message : 'Failed to load control log')
      setStatus('Unavailable')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main>
      <Link className="back-link" to="/settings">
        ← Settings
      </Link>
      <header className="page-header page-header--with-action">
        <div>
          <h1>Control log</h1>
          <p>Device commands from the dashboard and Home Assistant automations</p>
        </div>
        <div className="audio-page-actions">
          <button
            type="button"
            className="btn btn--compact"
            disabled={readOnly || clearing}
            onClick={() => {
              if (!window.confirm('Clear the control log on this device and Home Assistant?')) return
              setClearing(true)
              void clearControlLog()
                .then(() => load())
                .catch((err) =>
                  setError(err instanceof Error ? err.message : 'Failed to clear control log'),
                )
                .finally(() => setClearing(false))
            }}
          >
            Clear
          </button>
          <button type="button" className="btn btn--compact" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      <p className="widget-meta">{status}</p>
      <p className="audio-page-hint">
        Entries older than {CONTROL_LOG_RETENTION_DAYS} days are removed automatically. Clearing
        wipes this browser’s copy and the shared log on Home Assistant.
      </p>
      {error ? <p className="irrigation-empty">{error}</p> : null}

      {entries.length > 0 ? (
        <div className="control-log-list">
          <div className="control-log-head" aria-hidden="true">
            <span>When</span>
            <span>Source</span>
            <span>Action</span>
            <span>Device</span>
          </div>
          {entries.map((entry, index) => (
            <div
              key={`${entry.ts}-${entry.action}-${index}`}
              className={`control-log-row${entry.ok === false ? ' control-log-row--error' : ''}`}
            >
              <span className="control-log-time">{formatControlLogTime(entry.ts)}</span>
              <span className="control-log-source">
                {entry.source}
                {entry.actor ? ` · ${entry.actor}` : ''}
              </span>
              <span className="control-log-action">{entry.action}</span>
              <span className="control-log-device">
                {entry.entity_id || '—'}
                {entry.detail != null ? (
                  <span className="control-log-detail">{formatControlLogDetail(entry.detail)}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  )
}
