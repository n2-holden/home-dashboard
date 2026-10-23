import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHouse } from '../data/HouseContext'
import { SHADE_FLOORS, shadesForFloor, shadesForGroup, type Shade } from '../data/types'
import { HaClient } from '../ha/client'
import {
  SHADE_SUN_AUTOMATION_ENTITY,
  applyShadeScheduleMoves,
  loadShadeSunSchedule,
  scheduledShadeMoves,
  type ShadeScheduleMove,
  type ShadeSunRow,
  type ShadeSunSchedule,
} from '../ha/shadeSunSchedule'
import { loadBaseUrl, loadToken } from '../ha/storage'
import { ConfirmDialog } from './ConfirmDialog'
import { ScheduleAxis, ScheduleBar, clockMinutes, zoneParts } from './ShadeScheduleBar'
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
  onEdit,
}: {
  shade: Shade
  groupLabel: string | null
  row: ShadeSunRow | undefined
  timeZone: string
  nowMinutes: number | null
  sunMarks: number[]
  onEdit: (() => void) | null
}) {
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [toggling, setToggling] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState<{ title: string; shadeId: number } | null>(null)
  const [pendingMoves, setPendingMoves] = useState<ShadeScheduleMove[] | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchMessage, setMatchMessage] = useState<string | null>(null)

  const client = useMemo(() => {
    const token = loadToken()
    return token ? new HaClient(token, loadBaseUrl()) : null
  }, [])

  const refresh = useCallback(async () => {
    setNow(Date.now())
    try {
      const nextSchedule = await loadShadeSunSchedule()
      setSchedule(nextSchedule)
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
    return () => window.clearInterval(timer)
  }, [open, refresh])

  useEffect(() => {
    // The confirm prompt handles its own Escape.
    if (!open || pendingMoves) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, pendingMoves, onClose])

  useEffect(() => {
    if (!open) {
      setEditing(null)
      setPendingMoves(null)
      setMatchMessage(null)
    }
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

  const startMatch = () => {
    if (!schedule) return
    setMatchMessage(null)
    const shadesById = new Map(shades.map((shade) => [shade.id, shade]))
    const moves = scheduledShadeMoves(schedule, Date.now(), (row) => {
      const shade = row.shadeKey ? shadesById.get(row.shadeKey) : undefined
      // Dashboard shade position is 0 = open; HA cover position is 100 = open.
      return shade ? 100 - shade.position : null
    })
    if (moves.length === 0) {
      setMatchMessage('All shades already match the schedule.')
      return
    }
    setPendingMoves(moves)
  }

  const confirmMatch = async () => {
    const moves = pendingMoves
    setPendingMoves(null)
    if (!client || !moves) return
    setMatching(true)
    try {
      await applyShadeScheduleMoves(client, moves)
      setMatchMessage(`Moved ${moves.length} shade${moves.length === 1 ? '' : 's'} to match the schedule.`)
      void client
        .logControlEvent({
          actor: 'ui',
          action: 'shade_sun.match_schedule',
          detail: moves.map((move) => ({ entityId: move.entityId, position: move.position })),
        })
        .catch(() => undefined)
    } catch (err) {
      setMatchMessage(err instanceof Error ? err.message : 'Could not move the shades.')
    } finally {
      setMatching(false)
    }
  }

  if (!open) return null

  const timeZone = schedule?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const rowsByKey = new Map((schedule?.shades ?? []).map((row) => [row.shadeKey, row]))
  const nowParts = zoneParts(now, timeZone)
  const nowMinutes = schedule && nowParts.date === schedule.date ? nowParts.minutes : null
  const canMatch =
    !readOnly && client != null && connectionStatus === 'connected' && nowMinutes != null && !matching
  const closeCount = pendingMoves?.filter((move) => move.close).length ?? 0
  const openCount = (pendingMoves?.length ?? 0) - closeCount
  const confirmMessage = [
    closeCount ? `close ${closeCount} shade${closeCount === 1 ? '' : 's'}` : null,
    openCount ? `open ${openCount} shade${openCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' and ')
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
          <div className="shade-schedule-heading">
            <h2 id="shade-schedule-title" className="widget-title">
              Schedule
            </h2>
            <p className="widget-meta">
              {schedule
                ? `Today · sunrise ${schedule.sunrise} · sunset ${schedule.sunset} (dashed lines) · red = closed for sun · click a shade for its settings`
                : 'Today'}
            </p>
          </div>
          <button type="button" className="btn btn--compact shade-schedule-done" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="shade-schedule-controls">
          <label className="shade-schedule-toggle">
            <input
              type="checkbox"
              checked={enabled === true}
              disabled={readOnly || toggling || enabled === null}
              onChange={(event) => void toggleAutomation(event.target.checked)}
            />
            <span>Automatic control{enabled === null ? ' (unavailable)' : ''}</span>
          </label>
          <button
            type="button"
            className="btn btn--compact"
            disabled={!canMatch}
            onClick={startMatch}
            title="Open or close every automatic shade to where the schedule says it should be now"
          >
            {matching ? 'Matching…' : 'Match schedule'}
          </button>
          {matchMessage ? <span className="widget-meta">{matchMessage}</span> : null}
        </div>

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
      <ConfirmDialog
        open={pendingMoves != null}
        message={`This will ${confirmMessage} to match the schedule. Continue?`}
        onConfirm={() => void confirmMatch()}
        onCancel={() => setPendingMoves(null)}
      />
    </>,
    document.body,
  )
}
