import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import {
  COMM_OUTAGE_SETTINGS_PATH,
  groupCommStatus,
  networkCommStatus,
  type CommGroupStatus,
  type CommStatusGroupId,
} from '../ha/deviceCommWidgets'

function SettingsGearIcon() {
  return (
    <svg className="connectivity-rail-icon-svg" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M19.4 13a7.8 7.8 0 0 0 .05-1l2.05-1.6-2-3.46-2.45.98a7.6 7.6 0 0 0-1.73-1L15 4h-4l-.37 2.32a7.6 7.6 0 0 0-1.73 1l-2.45-.98-2 3.46L6.55 12a7.8 7.8 0 0 0 0 2l-2.05 1.6 2 3.46 2.45-.98a7.6 7.6 0 0 0 1.73 1L11 22h4l.37-2.32a7.6 7.6 0 0 0 1.73-1l2.45.98 2-3.46L19.4 13z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg className="connectivity-rail-icon-svg" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M3.5 12h17M12 3c2.8 2.4 4.2 5.4 4.2 9s-1.4 6.6-4.2 9c-2.8-2.4-4.2-5.4-4.2-9s1.4-6.6 4.2-9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M5.2 7.2c2.2.9 4.5 1.4 6.8 1.4s4.6-.5 6.8-1.4M5.2 16.8c2.2-.9 4.5-1.4 6.8-1.4s4.6.5 6.8 1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function SolarIcon() {
  return (
    <svg className="connectivity-rail-icon-svg" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 16.5 L12 5.5 L20 16.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M8 16.5 V19.5 M12 16.5 V20.5 M16 16.5 V19.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M6.5 12.2 H17.5 M8.2 9 H15.8" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  )
}

function PoolIcon() {
  return (
    <svg className="connectivity-rail-icon-svg" viewBox="0 0 24 24" aria-hidden>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="10"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M4.5 18.5c1.2-1.2 2.4-1.2 3.6 0s2.4 1.2 3.6 0 2.4-1.2 3.6 0 2.4 1.2 3.6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M6 10.2c1-.8 2-.8 3 0s2 .8 3 0 2-.8 3 0 2 .8 3 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function FlowerIcon() {
  return (
    <svg className="connectivity-rail-icon-svg" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="9.5" r="1.65" fill="currentColor" />
      <ellipse cx="12" cy="5.6" rx="1.55" ry="2.35" fill="currentColor" opacity="0.9" />
      <ellipse cx="15.7" cy="8" rx="1.55" ry="2.35" fill="currentColor" opacity="0.9" transform="rotate(60 15.7 8)" />
      <ellipse cx="14.3" cy="12.1" rx="1.55" ry="2.35" fill="currentColor" opacity="0.9" transform="rotate(120 14.3 12.1)" />
      <ellipse cx="9.7" cy="12.1" rx="1.55" ry="2.35" fill="currentColor" opacity="0.9" transform="rotate(60 9.7 12.1)" />
      <ellipse cx="8.3" cy="8" rx="1.55" ry="2.35" fill="currentColor" opacity="0.9" transform="rotate(120 8.3 8)" />
      <path
        d="M12 11.2 V19.2 M12 15.5c-1.4 0.7-2.5 1-3.5 0.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </svg>
  )
}

function HouseIcon() {
  return (
    <svg className="connectivity-rail-icon-svg" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4.5 11.2 L12 4.8 L19.5 11.2 V19.2 H14.2 V14.2 H9.8 V19.2 H4.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type RailItem = {
  id: string
  label: string
  title: string
  status: CommGroupStatus
  to: string
  icon: ReactNode
}

const STATUS_LABEL: Record<CommGroupStatus, string> = {
  ok: 'OK',
  bad: 'problem',
  unknown: 'unknown',
}

export function ConnectivityRail() {
  const { deviceCommStatus, internetOnline, connectionStatus, readOnly } = useHouse()

  const network = networkCommStatus(internetOnline, connectionStatus)
  const groups: Array<{ id: CommStatusGroupId; label: string; detail: string }> = [
    { id: 'solar', label: 'Solar', detail: 'Shed inverter, PV array, thermal' },
    { id: 'poolPond', label: 'Pool & pond', detail: 'Pool, pond, and hot tub' },
    { id: 'outside', label: 'Outside', detail: 'Outside lights, gate, driveway, irrigation, garage, cistern' },
    { id: 'house', label: 'House', detail: 'Lights, shades, audio, HVAC, power, weather' },
  ]

  const items: RailItem[] = [
    {
      id: 'network',
      label: 'Network',
      title:
        network === 'ok'
          ? 'Internet and local network OK'
          : network === 'bad'
            ? connectionStatus !== 'connected'
              ? 'Local network / Home Assistant connection problem'
              : 'Internet outage (WAN ping failed)'
            : 'Network status pending',
      status: network,
      to: COMM_OUTAGE_SETTINGS_PATH,
      icon: <GlobeIcon />,
    },
    ...groups.map((group) => {
      const status = groupCommStatus(deviceCommStatus, group.id)
      return {
        id: group.id,
        label: group.label,
        title: `${group.label}: ${STATUS_LABEL[status]} — ${group.detail}`,
        status,
        to: COMM_OUTAGE_SETTINGS_PATH,
        icon:
          group.id === 'solar' ? (
            <SolarIcon />
          ) : group.id === 'poolPond' ? (
            <PoolIcon />
          ) : group.id === 'outside' ? (
            <FlowerIcon />
          ) : (
            <HouseIcon />
          ),
      } satisfies RailItem
    }),
  ]

  return (
    <aside className="widget connectivity-rail" aria-label="Connectivity status">
      <div className="connectivity-rail__icons">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            className={`connectivity-rail__btn connectivity-rail__btn--${item.status}`}
            title={item.title}
            aria-label={item.title}
          >
            {item.icon}
          </Link>
        ))}
      </div>
      {readOnly ? (
        <span className="connectivity-rail__btn connectivity-rail__btn--muted" title="View only">
          <SettingsGearIcon />
        </span>
      ) : (
        <Link
          className="connectivity-rail__btn connectivity-rail__gear"
          to="/settings"
          aria-label="Settings"
          title="Settings"
        >
          <SettingsGearIcon />
        </Link>
      )}
    </aside>
  )
}
