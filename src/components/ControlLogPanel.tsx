import { useCallback, useEffect, useState } from 'react'
import { useHouse } from '../data/HouseContext'
import {
  CONTROL_LOG_RETENTION_DAYS,
  fetchControlLog,
  formatControlLogDetail,
  formatControlLogTime,
  type ControlLogEntry,
} from '../ha/controlLog'

type Props = {
  /** Compact layout for embedding inside Settings. */
  embedded?: boolean
}

export function ControlLogPanel({ embedded = false }: Props) {
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
    <section className={`widget settings-card${embedded ? '' : ''}`}>
      <div className="widget-title-row" style={{ justifyContent: 'space-between', width: '100%' }}>
        <div>
          {!embedded ? <p className="widget-kicker">Activity</p> : null}
          <h2 className="widget-title">{embedded ? 'Control log' : 'Control log'}</h2>
          {embedded ? (
            <p className="widget-meta">{status}</p>
          ) : null}
        </div>
        <div className="toolbar" style={{ gap: '0.45rem' }}>
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
      </div>

      <p className="settings-copy">
        Device commands from the dashboard and Home Assistant automations. Entries older than{' '}
        {CONTROL_LOG_RETENTION_DAYS} days are removed automatically.
      </p>
      {!embedded ? <p className="widget-meta">{status}</p> : null}
      {error ? <p className="irrigation-empty">{error}</p> : null}

      {entries.length > 0 ? (
        <div className="control-log-list" style={{ marginTop: '0.75rem' }}>
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
    </section>
  )
}
