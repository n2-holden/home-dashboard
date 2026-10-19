import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { HaClient } from '../ha/client'
import {
  loadShadeSunSchedule,
  previewShadeSunIntervals,
  saveShadeSunWindow,
  type ShadeSunRow,
  type ShadeSunSchedule,
  type ShadeSunSettings,
} from '../ha/shadeSunSchedule'
import { ScheduleAxis, ScheduleBar, clockMinutes, formatClock, zoneParts } from './ShadeScheduleBar'

type NumericKey = Exclude<keyof ShadeSunSettings, 'autoSun'>

const FIELDS: { key: NumericKey; label: string; unit: string; hint: string; min: number; max: number }[] = [
  {
    key: 'windowAzimuth',
    label: 'Window faces',
    unit: '°',
    hint: 'Compass direction: 90 east, 180 south, 270 west',
    min: 0,
    max: 360,
  },
  { key: 'left', label: 'Sun range left', unit: '°', hint: 'Counter-clockwise from window direction', min: 0, max: 360 },
  { key: 'right', label: 'Sun range right', unit: '°', hint: 'Clockwise from window direction', min: 0, max: 360 },
  { key: 'minElevation', label: 'Lowest sun', unit: '°', hint: 'Above horizon (negative = before sunrise)', min: -90, max: 100 },
  { key: 'maxElevation', label: 'Highest sun', unit: '°', hint: 'Above horizon (overhang cutoff)', min: -90, max: 100 },
  { key: 'closedPosition', label: 'Closed position', unit: '%', hint: '0 = fully closed', min: 0, max: 100 },
  { key: 'openPosition', label: 'Open position', unit: '%', hint: '100 = fully open', min: 0, max: 100 },
]

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

function compass(degrees: number): string {
  const d = ((degrees % 360) + 360) % 360
  return `${Math.round(d)}° ${COMPASS[Math.round(d / 22.5) % 16]}`
}

type Draft = { autoSun: boolean } & Record<NumericKey, string>

function toDraft(settings: ShadeSunSettings): Draft {
  const draft = { autoSun: settings.autoSun } as Draft
  for (const field of FIELDS) draft[field.key] = String(settings[field.key])
  return draft
}

function parseDraft(draft: Draft): { settings: ShadeSunSettings | null; error: string | null } {
  const settings = { autoSun: draft.autoSun } as ShadeSunSettings
  for (const field of FIELDS) {
    const raw = draft[field.key].trim()
    const value = Number(raw)
    if (raw === '' || !Number.isFinite(value)) {
      return { settings: null, error: `${field.label} must be a number.` }
    }
    if (value < field.min || value > field.max) {
      return { settings: null, error: `${field.label} must be between ${field.min} and ${field.max}.` }
    }
    settings[field.key] = value
  }
  if (settings.minElevation >= settings.maxElevation) {
    return { settings: null, error: 'Lowest sun must be below highest sun.' }
  }
  return { settings, error: null }
}

function sameSettings(a: ShadeSunSettings | undefined, b: ShadeSunSettings | undefined): boolean {
  if (!a || !b) return false
  return a.autoSun === b.autoSun && FIELDS.every((field) => a[field.key] === b[field.key])
}

type ShadeSunSettingsDialogProps = {
  title: string
  row: ShadeSunRow
  schedule: ShadeSunSchedule
  client: HaClient | null
  readOnly: boolean
  onClose: () => void
  onSaved: (schedule: ShadeSunSchedule) => void
}

export function ShadeSunSettingsDialog({
  title,
  row,
  schedule,
  client,
  readOnly,
  onClose,
  onSaved,
}: ShadeSunSettingsDialogProps) {
  const current = row.settings
  const defaults = row.defaults ?? current
  const [draft, setDraft] = useState<Draft | null>(() => (current ? toDraft(current) : null))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const parsed = useMemo(() => (draft ? parseDraft(draft) : { settings: null, error: null }), [draft])
  const preview = useMemo(
    () => (parsed.settings ? previewShadeSunIntervals(schedule, parsed.settings) : null),
    [parsed.settings, schedule],
  )

  const timeZone = schedule.timeZone
  const sunMarks = [clockMinutes(schedule.sunrise), clockMinutes(schedule.sunset)].filter(
    (minutes): minutes is number => minutes != null,
  )
  const nowParts = zoneParts(Date.now(), timeZone)
  const nowMinutes = nowParts.date === schedule.date ? nowParts.minutes : null
  const dirty = parsed.settings != null && !sameSettings(parsed.settings, current)
  const canEdit = !readOnly && client != null && !saving

  const save = async (settings: ShadeSunSettings | null) => {
    if (!client) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveShadeSunWindow(client, row.shadeId, settings)
      const next = await loadShadeSunSchedule()
      const updated = next?.shades.find((r) => r.shadeId === row.shadeId)
      const expected = settings ?? defaults
      if (!next || !sameSettings(updated?.settings, expected)) {
        setSaveError('Home Assistant did not apply the change. Check the HA log for shade_sun.py.')
        return
      }
      void client
        .logControlEvent({
          actor: 'ui',
          action: settings ? 'shade_sun.update_settings' : 'shade_sun.reset_settings',
          entityId: row.entityId,
          detail: settings ?? undefined,
        })
        .catch(() => undefined)
      onSaved(next)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const setField = (key: NumericKey, value: string) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))

  const s = parsed.settings
  const summary = !s
    ? null
    : !s.autoSun
      ? 'Automatic sun control is off for this shade; it only moves when you move it.'
      : `Closes to ${s.closedPosition}% while the sun is between ${compass(s.windowAzimuth - s.left)} and ${compass(
          s.windowAzimuth + s.right,
        )}, more than ${s.minElevation}° and at most ${s.maxElevation}° above the horizon; otherwise opens to ${s.openPosition}%.`

  const previewNote = !s
    ? 'Invalid settings'
    : !s.autoSun
      ? 'Manual only'
      : preview == null
        ? 'Preview unavailable'
        : preview.length === 0
          ? 'No sun today'
          : null
  const previewText =
    preview && preview.length > 0
      ? preview
          .map((iv) => `${formatClock(iv.closeMs, timeZone)} – ${formatClock(iv.openMs, timeZone)}`)
          .join(', ')
      : null

  return createPortal(
    <div className="confirm-dialog-overlay shade-settings-overlay" role="presentation" onClick={onClose}>
      <div
        className="confirm-dialog shade-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shade-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shade-schedule-header">
          <div>
            <h2 id="shade-settings-title" className="widget-title">
              {title}
            </h2>
            <p className="widget-meta">
              {row.name}
              {row.entityId ? ` · ${row.entityId}` : ''}
              {row.customized ? ' · customized' : ''}
            </p>
          </div>
        </header>

        {!draft ? (
          <p className="sync-banner">
            Home Assistant has not published settings for this shade yet. Try again in a minute.
          </p>
        ) : (
          <>
            <label className="shade-settings-auto">
              <input
                type="checkbox"
                checked={draft.autoSun}
                disabled={!canEdit}
                onChange={(event) => setDraft({ ...draft, autoSun: event.target.checked })}
              />
              <span>Close automatically when the sun is in this window</span>
            </label>

            <div className="shade-settings-grid">
              {FIELDS.map((field) => {
                const def = defaults?.[field.key]
                const changed = def != null && draft[field.key].trim() !== String(def)
                return (
                  <label key={field.key} className="shade-settings-field">
                    <span className="shade-settings-label">{field.label}</span>
                    <span className="shade-settings-input">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft[field.key]}
                        disabled={!canEdit || (!draft.autoSun && field.key !== 'openPosition' && field.key !== 'closedPosition')}
                        onChange={(event) => setField(field.key, event.target.value)}
                      />
                      <span>{field.unit}</span>
                    </span>
                    <span className="shade-settings-hint">
                      {field.hint}
                      {changed ? ` · default ${def}` : ''}
                    </span>
                  </label>
                )
              })}
            </div>

            <div className="shade-settings-preview">
              <div className="shade-settings-preview-title">
                Today{dirty ? ' with these changes' : ''}
                {previewText ? `: closed ${previewText}` : ''}
              </div>
              <ScheduleAxis leadingColumns={0} />
              <ScheduleBar
                intervals={preview ?? []}
                note={previewNote}
                timeZone={timeZone}
                nowMinutes={nowMinutes}
                sunMarks={sunMarks}
              />
            </div>

            {summary ? <p className="shade-settings-summary">{summary}</p> : null}
          </>
        )}

        {parsed.error || saveError ? <p className="shade-settings-error">{saveError ?? parsed.error}</p> : null}

        <div className="confirm-dialog-actions shade-settings-actions">
          {row.customized && !readOnly ? (
            <button
              type="button"
              className="btn btn--compact"
              disabled={!canEdit}
              onClick={() => void save(null)}
            >
              Reset to defaults
            </button>
          ) : null}
          <span className="shade-settings-spacer" />
          <button type="button" className="btn btn--compact" onClick={onClose}>
            {dirty ? 'Cancel' : 'Close'}
          </button>
          {!readOnly ? (
            <button
              type="button"
              className="btn btn--compact btn--accent"
              disabled={!canEdit || !dirty || parsed.settings == null}
              onClick={() => parsed.settings && void save(parsed.settings)}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
