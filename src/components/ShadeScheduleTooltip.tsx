import { useId, type ReactNode } from 'react'
import { useHouse } from '../data/HouseContext'
import {
  formatScheduleTime24,
  scheduleIntervalsForShade,
} from '../data/shadeSchedules'
import type { Shade } from '../data/types'

type ShadeScheduleTooltipProps = {
  shade: Shade
  children: ReactNode
}

function formatInterval(interval: { close: string; open: string }): string {
  if (interval.close && interval.open) {
    return `CLOSE ${formatScheduleTime24(interval.close)} → OPEN ${formatScheduleTime24(interval.open)}`
  }
  if (interval.close) return `CLOSE ${formatScheduleTime24(interval.close)}`
  return `OPEN ${formatScheduleTime24(interval.open)}`
}

export function ShadeScheduleTooltip({ shade, children }: ShadeScheduleTooltipProps) {
  const tooltipId = useId()
  const { entityMap, scheduleRevision } = useHouse()
  const entityId = entityMap[shade.id]
  const intervals = scheduleIntervalsForShade(shade, entityId)
  void scheduleRevision

  return (
    <span className="shade-chip-wrap">
      <span aria-describedby={tooltipId}>{children}</span>
      <span className="shade-tooltip" id={tooltipId} role="tooltip">
        <span className="shade-tooltip-title">{shade.name}</span>
        <ul className="shade-tooltip-list">
          {intervals.length === 0 ? (
            <li className="shade-tooltip-empty">No open/close schedule</li>
          ) : (
            intervals.map((interval, index) => (
              <li key={`${interval.close}-${interval.open}-${index}`}>
                <span className="shade-tooltip-time">{formatInterval(interval)}</span>
              </li>
            ))
          )}
        </ul>
      </span>
    </span>
  )
}
