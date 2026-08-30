import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { CRESTRON_ROOM_GROUPS, UNASSIGNED_ROOM_KEY, type CrestronLight } from '../ha/lights'

export function LightsPage() {
  const { groupId } = useParams<{ groupId?: string }>()
  const selectedGroup = groupId
    ? CRESTRON_ROOM_GROUPS.find((group) => group.id === groupId)
    : undefined
  const {
    crestronLights,
    connectionStatus,
    connectionError,
    setCrestronLight,
    setCrestronLightBrightness,
    setCrestronLightRoom,
  } = useHouse()
  if (groupId && !selectedGroup) return <Navigate to="/lights" replace />

  const [setupMode, setSetupMode] = useState(false)
  const visibleGroups = selectedGroup ? [selectedGroup] : CRESTRON_ROOM_GROUPS
  const visibleLights = selectedGroup
    ? crestronLights.filter((light) => light.roomKey.startsWith(`${selectedGroup.id}::`))
    : crestronLights
  const onCount = visibleLights.filter((light) => light.on === true).length
  const lightsByRoom = new Map<string, CrestronLight[]>()
  crestronLights.forEach((light) => {
    const lights = lightsByRoom.get(light.roomKey) ?? []
    lights.push(light)
    lightsByRoom.set(light.roomKey, lights)
  })

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <div className="lights-page-title-row">
          <h1>{selectedGroup ? `${selectedGroup.name} Lights` : 'Crestron Lights'}</h1>
          <label className="lights-setup-toggle">
            <input
              type="checkbox"
              checked={setupMode}
              onChange={(event) => setSetupMode(event.target.checked)}
            />
            Setup
          </label>
        </div>
        <p>
          {onCount} of {visibleLights.length} lights on
        </p>
      </header>

      {connectionError ? <p className="sync-banner">{connectionError}</p> : null}

      <section className="widget lights-control-card">
        {crestronLights.length === 0 ? (
          <p className="lights-empty">
            {connectionStatus === 'connected'
              ? 'No Crestron light entities are currently exposed by Home Assistant.'
              : 'Connect to Home Assistant to load the Crestron lights.'}
          </p>
        ) : (
          <div className="lights-floors">
            {visibleGroups.map((floor) => (
              <section key={floor.id} className="lights-floor">
                <h2 className="lights-floor-title">{floor.name}</h2>
                <div className="lights-rooms">
                  {floor.rooms.map((room) => {
                    const roomKey = `${floor.id}::${room.id}`
                    const lights = lightsByRoom.get(roomKey) ?? []
                    return (
                      <section key={roomKey} className="lights-room">
                        <h3 className="lights-room-title">
                          <span>{room.name}</span>
                          <span>{lights.length}</span>
                        </h3>
                        {lights.length > 0 ? (
                          <div className="lights-list">
                            {lights.map((light) => (
                              <LightControl
                                key={light.entityId}
                                light={light}
                                connectionStatus={connectionStatus}
                                setupMode={setupMode}
                                onToggle={setCrestronLight}
                                onBrightnessChange={setCrestronLightBrightness}
                                onRoomChange={setCrestronLightRoom}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="lights-room-empty">No lights assigned</p>
                        )}
                      </section>
                    )
                  })}
                </div>
              </section>
            ))}
            {!selectedGroup && (lightsByRoom.get(UNASSIGNED_ROOM_KEY) ?? []).length > 0 ? (
              <section className="lights-floor lights-floor--unassigned">
                <h2 className="lights-floor-title">Unassigned</h2>
                <div className="lights-list">
                  {(lightsByRoom.get(UNASSIGNED_ROOM_KEY) ?? []).map((light) => (
                    <LightControl
                      key={light.entityId}
                      light={light}
                      connectionStatus={connectionStatus}
                      setupMode={setupMode}
                      onToggle={setCrestronLight}
                      onBrightnessChange={setCrestronLightBrightness}
                      onRoomChange={setCrestronLightRoom}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </section>
    </main>
  )
}

function LightControl({
  light,
  connectionStatus,
  setupMode,
  onToggle,
  onBrightnessChange,
  onRoomChange,
}: {
  light: CrestronLight
  connectionStatus: string
  setupMode: boolean
  onToggle: (entityId: string, on: boolean) => void
  onBrightnessChange: (entityId: string, percent: number) => void
  onRoomChange: (entityId: string, room: string) => void
}) {
  return (
    <div
      className={`light-control ${setupMode ? 'light-control--setup' : 'light-control--compact'}`}
      title={light.entityId}
    >
      <input
        type="checkbox"
        checked={light.on === true}
        disabled={connectionStatus !== 'connected' || light.on == null}
        onChange={(event) => onToggle(light.entityId, event.target.checked)}
        aria-label={light.name}
      />
      <span className="light-control-name">{light.name}</span>
      {light.dimmable ? (
        <label className="light-control-dimmer">
          <span className="sr-only">Brightness for {light.name}</span>
          <input
            type="range"
            min="1"
            max="100"
            value={Math.round(((light.brightness ?? 255) / 255) * 100)}
            disabled={connectionStatus !== 'connected' || light.on == null}
            onChange={(event) =>
              onBrightnessChange(light.entityId, Number(event.target.value))
            }
            aria-label={`Brightness for ${light.name}`}
          />
        </label>
      ) : null}
      <span className="light-control-status">
        {light.on == null ? 'Unavailable' : light.on ? 'On' : 'Off'}
      </span>
      {setupMode ? (
        <label className="light-control-room">
          <span>Room</span>
          <select
            value={light.roomKey}
            aria-label={`Room for ${light.name}`}
            onChange={(event) => onRoomChange(light.entityId, event.target.value)}
          >
            <option value={UNASSIGNED_ROOM_KEY}>Unassigned</option>
            {CRESTRON_ROOM_GROUPS.map((floor) => (
              <optgroup key={floor.id} label={floor.name}>
                {floor.rooms.map((room) => (
                  <option key={`${floor.id}::${room.id}`} value={`${floor.id}::${room.id}`}>
                    {room.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}
