import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { CRESTRON_ROOM_GROUPS } from '../ha/lights'

function LightBulbIcon({ on }: { on: boolean }) {
  return (
    <svg
      className={on ? 'lights-widget-bulb lights-widget-bulb--on' : 'lights-widget-bulb'}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        d="M9 21h6M12 3a6 6 0 0 1 6 6c0 2.22-1.21 4.16-3 5.2V17a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2.8C7.21 13.16 6 11.22 6 9a6 6 0 0 1 6-6z"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LightsWidget() {
  const { crestronLights, crestronScenes, connectionStatus, activateCrestronScene } = useHouse()
  const floorCounts = CRESTRON_ROOM_GROUPS.map((floor) => {
    const lights = crestronLights.filter((light) => light.roomKey.startsWith(`${floor.id}::`))
    return {
      id: floor.id,
      name: floor.name,
      on: lights.filter((light) => light.on === true).length,
      total: lights.length,
    }
  })

  return (
    <article className="widget lights-widget widget--interactive">
      <div className="lights-widget-header">
        <Link className="lights-widget-main-link" to="/lights">
          <div>
          <h2 className="widget-title">Lights</h2>
          </div>
        </Link>
        {crestronScenes.length > 0 ? (
          <div className="lights-widget-scenes">
            {crestronScenes.map((scene) => (
              <button
                key={scene.entityId}
                type="button"
                className="btn btn--compact"
                disabled={connectionStatus !== 'connected'}
                onClick={() => activateCrestronScene(scene.entityId)}
              >
                {scene.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <Link className="lights-widget-body" to="/lights">
        <div className="lights-widget-counts">
          {floorCounts.map((floor) => (
            <Link
              key={floor.name}
              className="lights-widget-count"
              to={`/lights/${floor.id}`}
            >
              <span className="lights-widget-count-header">
                <LightBulbIcon on={floor.on > 0} />
                <span>{floor.name}</span>
              </span>
              <strong>
                {floor.on} / {floor.total}
              </strong>
            </Link>
          ))}
        </div>
      </Link>
    </article>
  )
}
