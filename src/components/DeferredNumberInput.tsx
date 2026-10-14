import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react'

type DeferredNumberInputProps = {
  value: number
  onCommit: (value: number) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number | string
  className?: string
  style?: CSSProperties
  'aria-label'?: string
  id?: string
}

/**
 * Number input that keeps a local draft while focused so clearing the field
 * does not immediately snap back to the committed/default value.
 * Commits on blur (and Enter).
 */
export function DeferredNumberInput({
  value,
  onCommit,
  disabled,
  min,
  max,
  step,
  className,
  style,
  id,
  'aria-label': ariaLabel,
}: DeferredNumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft != null

  useEffect(() => {
    if (!editing) return
    // If the control is disabled mid-edit, drop the draft.
    if (disabled) setDraft(null)
  }, [disabled, editing])

  const display = editing ? draft : formatNumberValue(value)

  const commit = () => {
    if (!editing) return
    const raw = draft.trim()
    setDraft(null)
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    onCommit(parsed)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      setDraft(null)
      event.currentTarget.blur()
    }
  }

  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      className={className}
      style={style}
      aria-label={ariaLabel}
      disabled={disabled}
      value={display}
      onFocus={() => setDraft(formatNumberValue(value))}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  )
}

function formatNumberValue(value: number): string {
  if (!Number.isFinite(value)) return ''
  // Avoid scientific notation / long floats for typical settings values.
  return String(value)
}
