import { Link } from 'react-router-dom'
import { COMM_OUTAGE_SETTINGS_PATH } from '../ha/deviceCommWidgets'

/** Red warning triangle — opens Settings → Notification → Last Communication. */
export function CommOutageIcon({
  title = 'Communication problem — open Last Communication',
  className,
}: {
  title?: string
  className?: string
}) {
  return (
    <Link
      to={COMM_OUTAGE_SETTINGS_PATH}
      className={`comm-outage-icon${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={title}
      onClick={(event) => event.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="comm-outage-icon-svg">
        <path
          d="M12 3.2 L21.2 19.6 H2.8 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <path
          d="M12 9.2 V14.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16.85" r="1.05" fill="currentColor" />
      </svg>
    </Link>
  )
}
