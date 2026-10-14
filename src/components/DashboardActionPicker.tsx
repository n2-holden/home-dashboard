import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  ActionPickerNode,
  DashboardActionSelection,
} from '../ha/dashboardActions'
import {
  formatDashboardActionLabel,
  withLightBrightnessPct,
} from '../ha/dashboardActions'

type DashboardActionPickerProps = {
  open: boolean
  catalog: ActionPickerNode[]
  value: DashboardActionSelection | null
  disabled?: boolean
  title?: string
  onClose: () => void
  onSelect: (action: DashboardActionSelection | null) => void
}

type BrightnessDraft = {
  action: DashboardActionSelection
  setLevel: boolean
  brightnessPct: number
}

function nodeChildren(node: ActionPickerNode | null, catalog: ActionPickerNode[]): ActionPickerNode[] {
  if (!node) return catalog
  if (node.kind === 'group') return node.children
  return []
}

export function DashboardActionPicker({
  open,
  catalog,
  value,
  disabled = false,
  title = 'Choose action',
  onClose,
  onSelect,
}: DashboardActionPickerProps) {
  const [path, setPath] = useState<ActionPickerNode[]>([])
  const [brightnessDraft, setBrightnessDraft] = useState<BrightnessDraft | null>(null)

  const current = path.length > 0 ? path[path.length - 1] : null
  const items = useMemo(() => nodeChildren(current, catalog), [catalog, current])
  const breadcrumb = useMemo(
    () => ['Dashboard', ...path.map((node) => node.label)],
    [path],
  )

  if (!open) return null

  const resetAndClose = () => {
    setPath([])
    setBrightnessDraft(null)
    onClose()
  }

  const goBack = () => {
    if (brightnessDraft) {
      setBrightnessDraft(null)
      return
    }
    setPath((prev) => prev.slice(0, -1))
  }

  const pickAction = (action: DashboardActionSelection) => {
    onSelect(action)
    setPath([])
    setBrightnessDraft(null)
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
            <p className="widget-kicker">Action</p>
            <h2 className="widget-title">{title}</h2>
            <p className="action-picker-breadcrumb">
              {brightnessDraft
                ? [...breadcrumb, 'On'].join(' › ')
                : breadcrumb.join(' › ')}
            </p>
          </div>
          <div className="action-picker-header-actions">
            {path.length > 0 || brightnessDraft ? (
              <button type="button" className="btn btn--compact" onClick={goBack}>
                Back
              </button>
            ) : null}
            <button type="button" className="btn btn--compact" onClick={resetAndClose}>
              Close
            </button>
          </div>
        </div>

        {value ? (
          <div className="action-picker-current">
            <span>Current: {formatDashboardActionLabel(value)}</span>
            <button
              type="button"
              className="btn btn--compact"
              disabled={disabled}
              onClick={() => {
                onSelect(null)
                setPath([])
                setBrightnessDraft(null)
                onClose()
              }}
            >
              Clear
            </button>
          </div>
        ) : null}

        {brightnessDraft ? (
          <div className="action-picker-brightness-entry">
            <label className="outside-settings-restore-control">
              <input
                type="checkbox"
                checked={brightnessDraft.setLevel}
                disabled={disabled}
                onChange={(event) =>
                  setBrightnessDraft((prev) =>
                    prev ? { ...prev, setLevel: event.target.checked } : prev,
                  )
                }
              />
              <span>Set light level</span>
            </label>
            <label className="map-row">
              <span className="map-label">Level</span>
              <div className="action-picker-brightness-controls">
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={brightnessDraft.brightnessPct}
                  disabled={disabled || !brightnessDraft.setLevel}
                  onChange={(event) =>
                    setBrightnessDraft((prev) =>
                      prev
                        ? { ...prev, brightnessPct: Number(event.target.value) }
                        : prev,
                    )
                  }
                  aria-label="Light level percent"
                />
                <span className="action-picker-brightness-value">
                  {brightnessDraft.brightnessPct}%
                </span>
              </div>
            </label>
            <button
              type="button"
              className="btn btn--compact btn--accent"
              disabled={disabled}
              onClick={() => {
                const action = brightnessDraft.setLevel
                  ? withLightBrightnessPct(
                      brightnessDraft.action,
                      brightnessDraft.brightnessPct,
                    )
                  : brightnessDraft.action
                pickAction(action)
              }}
            >
              Use On
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
                  onClick={() => {
                    if (choice.brightnessConfigurable) {
                      setBrightnessDraft({
                        action: choice.action,
                        setLevel: false,
                        brightnessPct: 100,
                      })
                      return
                    }
                    pickAction(choice.action)
                  }}
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
                      pickAction(item.action)
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
              <li className="action-picker-empty">No controls available here.</li>
            ) : null}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
