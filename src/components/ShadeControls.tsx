import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import {
  SHADE_FLOORS,
  shadeSummary,
  shadesForFloor,
  shadesForGroup,
  type Shade,
} from '../data/types'
import { shadeVisualStatus, type ShadeVisualStatus } from '../ha/positions'
import { ShadeScheduleTooltip } from './ShadeScheduleTooltip'
import { scheduleSummaryLines } from '../data/shadeSchedules'

function ShadeStatus({ shade }: { shade: Shade }) {
  const { setShadePosition, entityMap, covers, scheduleRevision } = useHouse()
  const entityId = entityMap[shade.id]
  void scheduleRevision
  const cover = entityId ? covers.find((c) => c.entityId === entityId) : undefined
  const mapped = Boolean(entityId)
  const closedPercent = cover?.closedPercent ?? shade.position
  const status: ShadeVisualStatus = shadeVisualStatus(closedPercent, cover?.state)
  const label =
    status === 'closed' ? 'Closed' : status === 'open' ? 'Open' : `${closedPercent}% closed`
  const scheduleHint = scheduleSummaryLines(shade, entityId).join('; ')

  return (
    <ShadeScheduleTooltip shade={shade}>
      <button
        type="button"
        className={`shade-chip shade-chip--${status} ${mapped ? '' : 'shade-chip--unmapped'}`}
        title={`${shade.group} ${shade.name}: ${label}. Schedule: ${scheduleHint}`}
        aria-label={`${shade.name}, ${label}. Activate to ${status === 'closed' ? 'open' : 'close'}.`}
        onClick={() => setShadePosition(shade.id, status === 'closed' ? 0 : 100)}
      >
        <span className="shade-chip-name">{shade.name}</span>
        <span className={`shade-chip-box shade-chip-box--${status}`} aria-hidden="true" />
      </button>
    </ShadeScheduleTooltip>
  )
}

function GroupRow({
  floorId,
  group,
  shades,
}: {
  floorId: string
  group: string
  shades: Shade[]
}) {
  const showLabel = !(floorId === 'basement' && group === 'Basement')

  return (
    <div className="group-row">
      {showLabel ? <h3 className="group-row-label">{group}</h3> : null}
      <div className="group-row-shades">
        {shades.map((shade) => (
          <ShadeStatus key={shade.id} shade={shade} />
        ))}
      </div>
    </div>
  )
}

export function ShadeControls() {
  const {
    shades,
    openAllShades,
    closeAllShades,
    setFloorPosition,
    connectionStatus,
    mappedCount,
    scheduledCoverCount,
    scheduleHomebridgeSource,
  } = useHouse()

  return (
    <>
      <div className="toolbar">
        <button type="button" className="btn btn--accent" onClick={openAllShades}>
          Open all
        </button>
        <button type="button" className="btn" onClick={closeAllShades}>
          Close all
        </button>
        {connectionStatus !== 'connected' || mappedCount < shades.length ? (
          <Link className="btn" to="/settings">
            Map entities
          </Link>
        ) : null}
      </div>

      {connectionStatus !== 'connected' ? (
        <p className="sync-banner">
          Not connected to Home Assistant.{' '}
          <Link to="/settings">Open Settings</Link> — remote access needs{' '}
          <code>ha-config.json</code> on the HA box (see Share mappings).
        </p>
      ) : mappedCount === 0 ? (
        <p className="sync-banner">
          Connected, but 0 shades mapped. Remote access doesn’t share mappings from your home
          browser — open Settings on the PC where shades are already mapped, export{' '}
          <code>shade-map.json</code>, and copy it to <code>config/www/home-dashboard/</code>.
        </p>
      ) : (
        <p className="sync-banner sync-banner--live">
          Live from Home Assistant · {mappedCount}/{shades.length} shades mapped
          {scheduledCoverCount > 0
            ? scheduleHomebridgeSource === 'homebridge'
              ? ` · ${scheduledCoverCount} schedules from Homebridge`
              : scheduleHomebridgeSource === 'cache'
                ? ` · ${scheduledCoverCount} schedules (cached from Homebridge)`
                : ` · ${scheduledCoverCount} schedules loaded`
            : ' · no schedules found'}
        </p>
      )}

      <div className="floor-stack">
        {SHADE_FLOORS.map((floor) => {
          const floorShades = shadesForFloor(shades, floor.id)
          return (
            <section key={floor.id} className="widget floor-section">
              <header className="floor-header">
                <div>
                  <h2 className="floor-title">{floor.label}</h2>
                  <p className="widget-meta">{shadeSummary(floorShades)}</p>
                </div>
                <div className="floor-actions">
                  <button
                    type="button"
                    className="btn btn--compact"
                    onClick={() => setFloorPosition(floor.id, 0)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="btn btn--compact"
                    onClick={() => setFloorPosition(floor.id, 100)}
                  >
                    Close
                  </button>
                </div>
              </header>

              <div className="group-row-stack">
                {floor.groups.map((group) => {
                  const groupShades = shadesForGroup(shades, floor.id, group)
                  if (groupShades.length === 0) return null
                  return (
                    <GroupRow
                      key={group}
                      floorId={floor.id}
                      group={group}
                      shades={groupShades}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
