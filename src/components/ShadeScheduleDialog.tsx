import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHouse } from '../data/HouseContext'
import { SHADE_FLOORS, shadesForFloor, shadesForGroup, type Shade } from '../data/types'
import { HaClient } from '../ha/client'
import {
  SHADE_SUN_AUTOMATION_ENTITY,
  loadShadeSunSchedule,
  loadShadeSunStatus,
  type ShadeSunRow,
  type ShadeSunSchedule,
  type ShadeSunStatus,
} from '../ha/shadeSunSchedule'
import { loadBaseUrl, loadToken } from '../ha/storage'
import { ScheduleAxis, ScheduleBar, clockMinutes, formatClock, zoneParts } from './ShadeScheduleBar'
import { ShadeSunSettingsDialog } from './ShadeSunSettingsDialog'

const REFRESH_MS = 60_000

type ShadeScheduleDialogProps = {
  open: boolean
  onClose: () => void
}

function rowNote(row: ShadeSunRow | undefined): string | null {
  if (!row) return 'No schedule'
  if (!row.autoSun) return 'Manual only'
  return row.intervals.length === 0 ? 'No sun today' : null
}

function ShadeRow({
  shade,
  groupLabel,
  row,
  timeZone,
  nowMinutes,
  sunMarks,
  holdUntilMs,
  onEdit,
}: {
  shade: Shade
  groupLabel: string | null
  row: ShadeSunRow | undefined
  timeZone: string
  nowMinutes: number | null
  sunMarks: number[]
  holdUntilMs: number | undefined
  onEdit: (() => void) | null
}) {
  const holdLabel = holdUntilMs ? `Paused until ${formatClock(holdUntilMs, timeZone)}` : null
  return (
    <li className="shade-schedule-row">
      <span className="shade-schedule-group-label">{groupLabel}</span>
      <div className="shade-schedule-name">
        {onEdit ? (
          <button
            type="button"
            className="shade-schedule-name-btn"
            onClick={onEdit}
            title={`${shade.name} settings`}
          >
            {shade.name}
            {row?.customized ? <span className="shade-schedule-custom" title="Customized" /> : null}
          </button>
        ) : (
          <span>{shade.name}</span>
        )}
        {holdLabel ? (
          <span className="shade-schedule-hold" title={holdLabel}>
            {holdLabel}
          </span>
        ) : null}
      </div>
      <ScheduleBar
        intervals={row?.intervals ?? []}
        note={rowNote(row)}
        timeZone={timeZone}
        nowMinutes={nowMinutes}
        sunMarks={sunMarks}
      />
    </li>
  )
}

export function ShadeScheduleDialog({ open, onClose }: ShadeScheduleDialogProps) {
  const { shades, readOnly, connectionStatus } = useHouse()
  const [schedule, setSchedule] = useState<ShadeSunSchedule | null>(null)
  const [status, setStatus] = useState<ShadeSunStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [toggling, setToggling] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState<{ title: string; shadeId: number } | null>(null)

  const client = useMemo(() => {
    const token = loadToken()
    return token ? new HaClient(token, loadBaseUrl()) : null
  }, [])

  const refresh = useCallback(async () => {
    setNow(Date.now())
    try {
      const [nextSchedule, nextStatus] = await Promise.all([
        loadShadeSunSchedule(),
        loadShadeSunStatus().catch(() => null),
      ])
      setSchedule(nextSchedule)
      setStatus(nextStatus)
      setLoadError(nextSchedule ? null : 'Home Assistant has not written today’s schedule yet.')
    } catch {
      setLoadError('Could not load the shade schedule.')
    }
    if (client && connectionStatus === 'connected') {
      try {
        const state = await client.getEntityState(SHADE_SUN_AUTOMATION_ENTITY)
        setEnabled(state.state === 'on')
      } catch {
        setEnabled(null)
      }
    }
  }, [client, connectionStatus])

  useEffect(() => {
    if (!open) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, refresh, onClose])

  useEffect(() => {
    if (!open) setEditing(null)
  }, [open])

  const closeEditor = useCallback(() => setEditing(null), [])

  const toggleAutomation = async (next: boolean) => {
    if (!client) return
    setToggling(true)
    try {
      await client.setInputBoolean(SHADE_SUN_AUTOMATION_ENTITY, next)
      setEnabled(next)
    } finally {
      setToggling(false)
    }
  }

  if (!open) return null

  const timeZone = schedule?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const rowsByKey = new Map((schedule?.shades ?? []).map((row) => [row.shadeKey, row]))
  const nowParts = zoneParts(now, timeZone)
  const nowMinutes = schedule && nowParts.date === schedule.date ? nowParts.minutes : null
  const holds = status?.manualHoldUntilMs ?? {}
  const sunMarks = [clockMinutes(schedule?.sunrise), clockMinutes(schedule?.sunset)].filter(
    (minutes): minutes is number => minutes != null,
  )
  const editingRow = editing ? schedule?.shades.find((row) => row.shadeId === editing.shadeId) : undefined

  return createPortal(
    <>
    <div className="confirm-dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className="confirm-dialog shade-schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shade-schedule-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shade-schedule-header">
          <div>
            <h2 id="shade-schedule-title" className="widget-title">
              Schedule
            </h2>
            <p className="widget-meta">
              {schedule
                ? `Today · sunrise ${schedule.sunrise} · sunset ${schedule.sunset} (dashed lines) · red = closed for sun · click a shade for its settings`
                : 'Today'}
            </p>
          </div>
          <div className="shade-schedule-header-actions">
            <label className="shade-schedule-toggle">
              <input
                type="checkbox"
                checked={enabled === true}
                disabled={readOnly || toggling || enabled === null}
                onChange={(event) => void toggleAutomation(event.target.checked)}
              />
              <span>Automatic control{enabled === null ? ' (unavailable)' : ''}</span>
            </label>
            <button type="button" className="btn btn--compact" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {loadError ? <p className="sync-banner">{loadError}</p> : null}

        <div className="shade-schedule-body">
          <ScheduleAxis leadingColumns={2} />
          {SHADE_FLOORS.map((floor) => {
            if (shadesForFloor(shades, floor.id).length === 0) return null
            return (
              <section key={floor.id} className="shade-schedule-floor">
                <h3 className="shade-schedule-floor-title">{floor.label}</h3>
                {floor.groups.map((group) => {
                  const groupShades = shadesForGroup(shades, floor.id, group)
                  if (groupShades.length === 0) return null
                  return (
                    <ul key={group} className="shade-schedule-list">
                      {groupShades.map((shade, index) => {
                        const row = rowsByKey.get(shade.id)
                        return (
                          <ShadeRow
                            key={shade.id}
                            shade={shade}
                            groupLabel={index === 0 ? group : null}
                            row={row}
                            timeZone={timeZone}
                            nowMinutes={nowMinutes}
                            sunMarks={sunMarks}
                            holdUntilMs={row?.entityId ? holds[row.entityId] : undefined}
                            onEdit={
                              row
                                ? () => setEditing({ title: `${group} ${shade.name}`, shadeId: row.shadeId })
                                : null
                            }
                          />
                        )
                      })}
                    </ul>
                  )
                })}
              </section>
            )
          })}
        </div>
      </div>
    </div>
      {editing && editingRow && schedule ? (
        <ShadeSunSettingsDialog
          title={editing.title}
          row={editingRow}
          schedule={schedule}
          client={client}
          readOnly={readOnly}
          onClose={closeEditor}
          onSaved={setSchedule}
        />
      ) : null}
    </>,
    document.body,
  )
}
