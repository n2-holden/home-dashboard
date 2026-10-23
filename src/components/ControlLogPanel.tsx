import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHouse } from '../data/HouseContext'
import {
  CONTROL_LOG_RETENTION_DAYS,
  commLogStatus,
  fetchControlLog,
  formatControlLogDetail,
  formatControlLogTime,
  type ControlLogEntry,
  type ControlLogKind,
} from '../ha/controlLog'
import { DeviceCommStatusPanel } from './DeviceCommStatusPanel'

type Props = {
  /** Compact layout for embedding inside Settings. */
  embedded?: boolean
  /** Which log file to show. */
  kind?: ControlLogKind
  /** Open Last Communication when kind is communication (from ?comm=1). */
  openCommStatus?: boolean
}

const COPY: Record<
  ControlLogKind,
  { title: string; kicker: string; description: string; empty: string; clearConfirm: string }
> = {
  activity: {
    title: 'Activity log',
    kicker: 'Activity',
    description:
      'Device commands from the dashboard and Home Assistant automations. Entries older than',
    empty: 'No activity events yet',
    clearConfirm: 'Clear the activity log on this device and Home Assistant?',
  },
  communication: {
    title: 'Communication log',
    kicker: 'Communication',
    description:
      'Failed commands and connectivity alerts (device communication, internet outage). Entries older than',
    empty: 'No communication events yet',
    clearConfirm: 'Clear the communication log on this device and Home Assistant?',
  },
}

export function ControlLogPanel({
  embedded = false,
  kind = 'activity',
  openCommStatus = false,
}: Props) {
  const { clearControlLog, readOnly } = useHouse()
  const [entries, setEntries] = useState<ControlLogEntry[]>([])
  const [status, setStatus] = useState('Loading…')
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [deviceFilter, setDeviceFilter] = useState('')
  const copy = COPY[kind]
  const isComm = kind === 'communication'

  const deviceOptions = useMemo(
    () =>
      Array.from(
        new Set(entries.map((entry) => entry.entity_id).filter((id): id is string => Boolean(id))),
      ).sort((a, b) => a.localeCompare(b)),
    [entries],
  )
  const visibleEntries = deviceFilter
    ? entries.filter((entry) => entry.entity_id === deviceFilter)
    : entries

  useEffect(() => {
    if (deviceFilter && !deviceOptions.includes(deviceFilter)) setDeviceFilter('')
  }, [deviceFilter, deviceOptions])

  const load = useCallback(async () => {
    setError(null)
    setStatus('Loading…')
    try {
      const next = await fetchControlLog(kind)
      setEntries(next)
      setStatus(
        next.length === 0
          ? copy.empty
          : `${next.length} event${next.length === 1 ? '' : 's'} · last ${CONTROL_LOG_RETENTION_DAYS} days`,
      )
    } catch (err) {
      setEntries([])
      setError(err instanceof Error ? err.message : `Failed to load ${kind} log`)
      setStatus('Unavailable')
    }
  }, [copy.empty, kind])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className={`widget settings-card${embedded ? '' : ''}`}>
      <div className="widget-title-row" style={{ justifyContent: 'space-between', width: '100%' }}>
        <div>
          {!embedded ? <p className="widget-kicker">{copy.kicker}</p> : null}
          <h2 className="widget-title">{copy.title}</h2>
          {embedded ? <p className="widget-meta">{status}</p> : null}
        </div>
        <div className="toolbar" style={{ gap: '0.45rem' }}>
          <button
            type="button"
            className="btn btn--compact"
            disabled={readOnly || clearing}
            onClick={() => {
              if (!window.confirm(copy.clearConfirm)) return
              setClearing(true)
              void clearControlLog(kind)
                .then(() => load())
                .catch((err) =>
                  setError(err instanceof Error ? err.message : `Failed to clear ${kind} log`),
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
        {copy.description} {CONTROL_LOG_RETENTION_DAYS} days are removed automatically.
      </p>
      {!embedded ? <p className="widget-meta">{status}</p> : null}
      {error ? <p className="irrigation-empty">{error}</p> : null}

      {kind === 'communication' ? (
        <DeviceCommStatusPanel honorQuery defaultOpen={openCommStatus} />
      ) : null}

      {deviceOptions.length > 0 ? (
        <label className="control-log-filter">
          <span>Device</span>
          <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}>
            <option value="">All devices</option>
            {deviceOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          {deviceFilter ? (
            <span className="control-log-filter-count">
              {visibleEntries.length} of {entries.length}
            </span>
          ) : null}
        </label>
      ) : null}

      {visibleEntries.length > 0 ? (
        <div
          className={`control-log-list${isComm ? ' control-log-list--comm' : ''}`}
          style={{ marginTop: '0.75rem' }}
        >
          <div className="control-log-head" aria-hidden="true">
            {isComm ? <span>Status</span> : null}
            <span>When</span>
            <span>Source</span>
            <span>Action</span>
            <span>Device</span>
          </div>
          {visibleEntries.map((entry, index) => {
            const commStatus = isComm ? commLogStatus(entry) : null
            return (
            <div
              key={`${entry.ts}-${entry.action}-${index}`}
              className={`control-log-row${
                entry.ok === false || commStatus === 'Failed' ? ' control-log-row--error' : ''
              }${commStatus === 'Resumed' ? ' control-log-row--resumed' : ''}`}
            >
              {commStatus ? (
                <span
                  className={`control-log-status control-log-status--${commStatus.toLowerCase()}`}
                >
                  {commStatus}
                </span>
              ) : null}
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
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
