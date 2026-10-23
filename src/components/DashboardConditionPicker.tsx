import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  buildSunConditionLabels,
  type ConditionPickerNode,
  type DashboardCondition,
} from '../ha/dashboardConditions'

type DashboardConditionPickerProps = {
  open: boolean
  catalog: ConditionPickerNode[]
  disabled?: boolean
  title?: string
  /** When editing, opens the picker at this condition with its values prefilled. */
  initial?: DashboardCondition | null
  onClose: () => void
  onSelect: (condition: DashboardCondition) => void
}

function sameLabels(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((label, i) => label === b[i])
}

/** Breadcrumb path to the screen that shows `condition`, or [] if not found. */
function pathToCondition(
  nodes: ConditionPickerNode[],
  condition: DashboardCondition,
): ConditionPickerNode[] {
  for (const node of nodes) {
    if (node.kind === 'time_entry') {
      if (condition.kind === 'time' && condition.compare === node.compare) return [node]
    } else if (node.kind === 'sun_entry') {
      if (
        condition.kind === 'sun' &&
        condition.compare === node.compare &&
        condition.event === node.event
      ) {
        return [node]
      }
    } else if (node.kind === 'choice') {
      if (node.choices.some((choice) => sameLabels(choice.condition.labels, condition.labels))) {
        return [node]
      }
    } else if (node.kind === 'group') {
      if (
        node.children.some(
          (child) => child.kind === 'leaf' && sameLabels(child.condition.labels, condition.labels),
        )
      ) {
        return [node]
      }
      const sub = pathToCondition(node.children, condition)
      if (sub.length > 0) return [node, ...sub]
    }
  }
  return []
}

function nodeChildren(
  node: ConditionPickerNode | null,
  catalog: ConditionPickerNode[],
): ConditionPickerNode[] {
  if (!node) return catalog
  if (node.kind === 'group') return node.children
  return []
}

function todayTimeValue(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function DashboardConditionPicker({
  open,
  catalog,
  disabled = false,
  title = 'Choose condition',
  initial = null,
  onClose,
  onSelect,
}: DashboardConditionPickerProps) {
  const [path, setPath] = useState<ConditionPickerNode[]>([])
  const [timeDraft, setTimeDraft] = useState(todayTimeValue)
  const [offsetDraft, setOffsetDraft] = useState('0')

  const wasOpen = useRef(false)
  useEffect(() => {
    const justOpened = open && !wasOpen.current
    wasOpen.current = open
    // Seed only on open: `initial` and `catalog` get new identities on every HA state update.
    if (!justOpened || !initial) return
    setPath(pathToCondition(catalog, initial))
    if (initial.kind === 'time') setTimeDraft(initial.time.slice(0, 5))
    if (initial.kind === 'sun') setOffsetDraft(String(initial.offsetHours ?? 0))
  }, [open, initial, catalog])
  const offsetValue = Number(offsetDraft)
  const offsetValid = offsetDraft.trim() !== '' && Number.isFinite(offsetValue) && Math.abs(offsetValue) <= 12

  const current = path.length > 0 ? path[path.length - 1] : null
  const items = useMemo(() => nodeChildren(current, catalog), [catalog, current])
  const breadcrumb = useMemo(
    () => ['Dashboard', ...path.map((node) => node.label)],
    [path],
  )

  if (!open) return null

  const resetAndClose = () => {
    setPath([])
    setTimeDraft(todayTimeValue())
    setOffsetDraft('0')
    onClose()
  }

  const goBack = () => {
    setPath((prev) => prev.slice(0, -1))
  }

  const pickCondition = (condition: DashboardCondition) => {
    onSelect(condition)
    setPath([])
    setTimeDraft(todayTimeValue())
    setOffsetDraft('0')
    onClose()
  }

  return createPortal(
    <div className="action-picker-overlay" role="presentation" onClick={resetAndClose}>
      <div
        className="action-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="action-picker-header">
          <div>
            <p className="widget-kicker">Condition</p>
            <h2 className="widget-title">{title}</h2>
            <p className="action-picker-breadcrumb">{breadcrumb.join(' › ')}</p>
          </div>
          <div className="action-picker-header-actions">
            {path.length > 0 ? (
              <button type="button" className="btn btn--compact" onClick={goBack}>
                Back
              </button>
            ) : null}
            <button type="button" className="btn btn--compact" onClick={resetAndClose}>
              Close
            </button>
          </div>
        </div>

        {current?.kind === 'time_entry' ? (
          <div className="action-picker-time-entry">
            <label className="map-row">
              <span className="map-label">
                {current.compare === 'before' ? 'Before' : 'After'} local time
              </span>
              <input
                type="time"
                value={timeDraft}
                disabled={disabled}
                onChange={(event) => setTimeDraft(event.target.value)}
                aria-label="Condition time"
              />
            </label>
            <button
              type="button"
              className="btn btn--compact btn--accent"
              disabled={disabled || !timeDraft}
              onClick={() => {
                const time = timeDraft.length === 5 ? `${timeDraft}:00` : timeDraft
                pickCondition({
                  kind: 'time',
                  labels: [
                    'Other',
                    'Time',
                    current.compare === 'before' ? 'Before' : 'After',
                    time.slice(0, 5),
                  ],
                  compare: current.compare,
                  time,
                })
              }}
            >
              Use time
            </button>
          </div>
        ) : current?.kind === 'sun_entry' ? (
          <div className="action-picker-time-entry">
            <label className="map-row">
              <span className="map-label">
                {current.compare === 'before' ? 'Before' : 'After'}{' '}
                {current.event === 'sunrise' ? 'sunrise' : 'sunset'} offset (hours, − = earlier)
              </span>
              <input
                type="number"
                step="0.25"
                min={-12}
                max={12}
                value={offsetDraft}
                disabled={disabled}
                onChange={(event) => setOffsetDraft(event.target.value)}
                aria-label="Sun offset hours"
              />
            </label>
            <button
              type="button"
              className="btn btn--compact btn--accent"
              disabled={disabled || !offsetValid}
              onClick={() => {
                const offsetHours = offsetValue
                pickCondition({
                  kind: 'sun',
                  labels: buildSunConditionLabels(current.event, current.compare, offsetHours),
                  compare: current.compare,
                  event: current.event,
                  ...(offsetHours !== 0 ? { offsetHours } : {}),
                })
              }}
            >
              Use condition
            </button>
          </div>
        ) : current?.kind === 'choice' ? (
          <ul className="action-picker-list">
            {current.choices.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  className="action-picker-item"
                  disabled={disabled}
                  onClick={() => pickCondition(choice.condition)}
                >
                  {choice.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="action-picker-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="action-picker-item"
                  disabled={disabled}
                  onClick={() => {
                    if (item.kind === 'leaf') {
                      pickCondition(item.condition)
                      return
                    }
                    setPath((prev) => [...prev, item])
                  }}
                >
                  <span>{item.label}</span>
                  {item.kind !== 'leaf' ? <span className="action-picker-chevron">›</span> : null}
                </button>
              </li>
            ))}
            {items.length === 0 ? (
              <li className="action-picker-empty">No conditions available here.</li>
            ) : null}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
