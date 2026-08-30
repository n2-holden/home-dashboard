import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { CRESTRON_ROOM_GROUPS } from '../ha/lights'

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
              <span>{floor.name}</span>
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
