import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PendingToggle } from '../components/PendingToggle'
import { useHouse } from '../data/HouseContext'
import { usePendingToggles } from '../hooks/usePendingToggles'
import { displayToggleState } from '../ha/pendingToggle'
import { CRESTRON_ROOM_GROUPS, UNASSIGNED_ROOM_KEY, type CrestronLight } from '../ha/lights'

function orphanLightsForFloor(
  floorId: string,
  lightsByRoom: Map<string, CrestronLight[]>,
): CrestronLight[] {
  const knownRoomKeys = new Set(
    CRESTRON_ROOM_GROUPS.find((floor) => floor.id === floorId)?.rooms.map(
      (room) => `${floorId}::${room.id}`,
    ) ?? [],
  )
  const orphans: CrestronLight[] = []
  for (const [roomKey, lights] of lightsByRoom) {
    if (roomKey.startsWith(`${floorId}::`) && !knownRoomKeys.has(roomKey)) {
      orphans.push(...lights)
    }
  }
  return orphans.sort((a, b) => a.name.localeCompare(b.name))
}

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
    readOnly,
  } = useHouse()
  const [setupMode, setSetupMode] = useState(false)
  const { pendingByKey, startPending, clearPending, reconcile } = usePendingToggles<string>()

  const handleToggle = useCallback(
    (entityId: string, desiredOn: boolean) => {
      startPending(entityId, desiredOn)
      void setCrestronLight(entityId, desiredOn).catch(() => clearPending(entityId))
    },
    [clearPending, setCrestronLight, startPending],
  )

  const actualByEntity = useMemo(
    () => Object.fromEntries(crestronLights.map((light) => [light.entityId, light.on])),
    [crestronLights],
  )

  useEffect(() => {
    reconcile(actualByEntity)
  }, [actualByEntity, reconcile])

  if (groupId && !selectedGroup) return <Navigate to="/lights" replace />

  const visibleGroups = selectedGroup ? [selectedGroup] : CRESTRON_ROOM_GROUPS
  const visibleLights = selectedGroup
    ? crestronLights.filter((light) => light.roomKey.startsWith(`${selectedGroup.id}::`))
    : crestronLights
  const onCount = visibleLights.filter((light) => {
    const pending = pendingByKey[light.entityId]
    const { checked } = displayToggleState(light.on, pending ?? null)
    return checked
  }).length
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
          {!readOnly ? (
            <label className="lights-setup-toggle">
              <input
                type="checkbox"
                checked={setupMode}
                onChange={(event) => setSetupMode(event.target.checked)}
              />
              Setup
            </label>
          ) : null}
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
                                pending={pendingByKey[light.entityId] ?? null}
                                connectionStatus={connectionStatus}
                                setupMode={setupMode && !readOnly}
                                readOnly={readOnly}
                                onToggle={handleToggle}
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
                  {(() => {
                    const orphans = orphanLightsForFloor(floor.id, lightsByRoom)
                    if (orphans.length === 0) return null
                    return (
                      <section key={`${floor.id}::other`} className="lights-room">
                        <h3 className="lights-room-title">
                          <span>Other</span>
                          <span>{orphans.length}</span>
                        </h3>
                        <div className="lights-list">
                          {orphans.map((light) => (
                            <LightControl
                              key={light.entityId}
                              light={light}
                              pending={pendingByKey[light.entityId] ?? null}
                              connectionStatus={connectionStatus}
                              setupMode={setupMode && !readOnly}
                              readOnly={readOnly}
                              onToggle={handleToggle}
                              onBrightnessChange={setCrestronLightBrightness}
                              onRoomChange={setCrestronLightRoom}
                            />
                          ))}
                        </div>
                      </section>
                    )
                  })()}
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
                      pending={pendingByKey[light.entityId] ?? null}
                      connectionStatus={connectionStatus}
                      setupMode={setupMode && !readOnly}
                      readOnly={readOnly}
                      onToggle={handleToggle}
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
  pending,
  connectionStatus,
  setupMode,
  readOnly,
  onToggle,
  onBrightnessChange,
  onRoomChange,
}: {
  light: CrestronLight
  pending: { desiredOn: boolean; requestedAt: number } | null
  connectionStatus: string
  setupMode: boolean
  readOnly: boolean
  onToggle: (entityId: string, on: boolean) => void
  onBrightnessChange: (entityId: string, percent: number) => void
  onRoomChange: (entityId: string, room: string) => void
}) {
  const { checked, unavailable } = displayToggleState(light.on, pending)
  const isPending = pending != null
  const disabled = readOnly || connectionStatus !== 'connected' || unavailable

  return (
    <div
      className={`light-control ${setupMode ? 'light-control--setup' : 'light-control--compact'}`}
      title={light.entityId}
    >
      <PendingToggle
        checked={checked}
        pending={isPending}
        disabled={disabled}
        label={light.name}
        onToggle={(next) => onToggle(light.entityId, next)}
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
            disabled={disabled}
            onChange={(event) =>
              onBrightnessChange(light.entityId, Number(event.target.value))
            }
            aria-label={`Brightness for ${light.name}`}
          />
        </label>
      ) : null}
      <span className="light-control-status">
        {unavailable ? 'Unavailable' : checked ? 'On' : 'Off'}
      </span>
      {setupMode ? (
        <label className="light-control-room">
          <span>Room</span>
          <select
            value={light.roomKey}
            aria-label={`Room for ${light.name}`}
            disabled={readOnly}
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
