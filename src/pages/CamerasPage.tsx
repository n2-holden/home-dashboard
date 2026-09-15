import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CameraFrame } from '../components/CameraFrame'
import { useHouse } from '../data/HouseContext'
import { DASHBOARD_CAMERAS } from '../ha/camera'

export function CamerasPage() {
  const { connectionStatus } = useHouse()
  const enabled = connectionStatus === 'connected'
  const [selectedId, setSelectedId] = useState(DASHBOARD_CAMERAS[0]?.id ?? 'shed')
  const selected =
    DASHBOARD_CAMERAS.find((cam) => cam.id === selectedId) ?? DASHBOARD_CAMERAS[0]

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Cameras</h1>
        <p>{selected ? selected.label : 'Live camera feeds'}</p>
      </header>

      {connectionStatus !== 'connected' ? (
        <p className="irrigation-empty">Connect to Home Assistant to view cameras.</p>
      ) : selected ? (
        <div className="cameras-page">
          <article className="widget camera-hero">
            <div className="widget-body">
              <CameraFrame
                key={selected.entityId}
                camera={selected}
                enabled={enabled}
                className="camera-frame camera-frame--hero"
              />
            </div>
          </article>

          <div className="cameras-thumbs" role="list" aria-label="Camera thumbnails">
            {DASHBOARD_CAMERAS.map((cam) => {
              const active = cam.id === selected.id
              return (
                <button
                  key={cam.id}
                  type="button"
                  role="listitem"
                  className={`camera-thumb${active ? ' camera-thumb--active' : ''}`}
                  aria-pressed={active}
                  aria-label={`Show ${cam.label}`}
                  onClick={() => setSelectedId(cam.id)}
                >
                  <CameraFrame
                    camera={
                      cam.feedMode === 'hls'
                        ? { ...cam, feedMode: 'snapshot', snapshotRefreshMs: 0 }
                        : cam
                    }
                    enabled={enabled}
                    showFeedBadge={false}
                    className="camera-frame camera-frame--thumb"
                  />
                  <span className="camera-thumb-label">{cam.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </main>
  )
}
