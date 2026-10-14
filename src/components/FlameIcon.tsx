import flameOffUrl from '../assets/flame-off.png'
import flameOnUrl from '../assets/flame-on.png'

/** Stylized flame — filled coral when active, outlined when off. */
export function FlameIcon({
  active,
  className = '',
}: {
  active: boolean
  className?: string
}) {
  const classes = [
    'flame-icon',
    active ? 'flame-icon--on' : 'flame-icon--off',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={classes}
      style={{ ['--flame-mask' as string]: `url(${active ? flameOnUrl : flameOffUrl})` }}
      aria-hidden
    />
  )
}
