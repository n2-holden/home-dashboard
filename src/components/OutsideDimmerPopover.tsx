import { useEffect, useId, useRef, useState } from 'react'
import type { OutsideControlKey } from '../ha/outside'

type OutsideDimmerPopoverProps = {
  controlKey: OutsideControlKey
  label: string
  brightness: number | null
  disabled: boolean
  onChange: (key: OutsideControlKey, percent: number) => void
}

function percentFromBrightness(brightness: number | null): number {
  return Math.round(((brightness ?? 255) / 255) * 100)
}

export function OutsideDimmerPopover({
  controlKey,
  label,
  brightness,
  disabled,
  onChange,
}: OutsideDimmerPopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()
  const adjustingRef = useRef(false)
  const devicePercent = percentFromBrightness(brightness)
  const [shownPercent, setShownPercent] = useState(devicePercent)

  useEffect(() => {
    if (!adjustingRef.current) {
      setShownPercent(devicePercent)
    }
  }, [devicePercent])

  useEffect(() => {
    if (!open) {
      adjustingRef.current = false
      setShownPercent(devicePercent)
    }
  }, [open, devicePercent])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const startAdjusting = () => {
    adjustingRef.current = true
  }

  const endAdjusting = () => {
    window.setTimeout(() => {
      adjustingRef.current = false
    }, 500)
  }

  const handleSliderChange = (value: number) => {
    setShownPercent(value)
    onChange(controlKey, value)
  }

  return (
    <div className="outside-dimmer-popover-wrap" ref={rootRef}>
      <button
        type="button"
        className="outside-dimmer-percent-btn"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={dialogId}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        {shownPercent}%
      </button>
      {open ? (
        <div
          className="outside-dimmer-popover"
          id={dialogId}
          role="dialog"
          aria-label={`Brightness for ${label}`}
        >
          <label className="light-control-dimmer">
            <span className="sr-only">Brightness for {label}</span>
            <input
              type="range"
              min="1"
              max="100"
              value={shownPercent}
              disabled={disabled}
              onPointerDown={startAdjusting}
              onPointerUp={endAdjusting}
              onPointerCancel={endAdjusting}
              onChange={(event) => handleSliderChange(Number(event.target.value))}
              aria-label={`Brightness for ${label}`}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
