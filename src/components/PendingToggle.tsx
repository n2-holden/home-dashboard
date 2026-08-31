type PendingToggleProps = {
  checked: boolean
  pending: boolean
  disabled: boolean
  label: string
  onToggle: (next: boolean) => void
}

export function PendingToggle({
  checked,
  pending,
  disabled,
  label,
  onToggle,
}: PendingToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      className={pending ? 'pending-toggle pending-toggle--pending' : 'pending-toggle'}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      aria-busy={pending}
      onClick={() => {
        if (pending || disabled) return
        onToggle(!checked)
      }}
    />
  )
}
