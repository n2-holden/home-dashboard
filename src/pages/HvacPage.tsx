import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ThermostatTempGauge } from '../components/ThermostatTempGauge'
import { useHouse } from '../data/HouseContext'
import {
  formatHvacModeLabel,
  HVAC_FLOOR_GROUPS,
  thermostatsGroupedByFloor,
  type HvacFloorGroup,
  type ThermostatSnapshot,
} from '../ha/hvac'

export function HvacPage() {
  const { hvac, connectionStatus } = useHouse()
  const groupedFloors = thermostatsGroupedByFloor(hvac.thermostats)
  const groupedCount = groupedFloors.reduce((sum, group) => sum + group.thermostats.length, 0)
  const groupedHeatingCount = groupedFloors.reduce(
    (sum, group) => sum + group.thermostats.filter((item) => item.heating).length,
    0,
  )

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Thermostats</h1>
        <p>
          {groupedHeatingCount} of {groupedCount} thermostats heating
        </p>
      </header>

      {connectionStatus !== 'connected' ? (
        <section className="widget hvac-page-card">
          <p className="lights-empty">Connect to Home Assistant to load thermostats.</p>
        </section>
      ) : groupedCount === 0 ? (
        <section className="widget hvac-page-card">
          <p className="lights-empty">No room thermostats found in Home Assistant.</p>
        </section>
      ) : (
        <div className="hvac-floor-stack">
          {HVAC_FLOOR_GROUPS.map((floor) => {
            const thermostats =
              groupedFloors.find((group) => group.floor.id === floor.id)?.thermostats ?? []
            if (thermostats.length === 0) return null

            return (
              <FloorSection key={floor.id} floor={floor} thermostats={thermostats} />
            )
          })}
        </div>
      )}
    </main>
  )
}

function FloorSection({
  floor,
  thermostats,
}: {
  floor: HvacFloorGroup
  thermostats: ThermostatSnapshot[]
}) {
  return (
    <section className="widget hvac-floor-section">
      <div className="hvac-floor-header">
        <h2 className="hvac-floor-title">{floor.label}</h2>
      </div>
      <div className="hvac-thermostat-grid">
        {thermostats.map((thermostat) => (
          <ThermostatTile key={thermostat.entityId} thermostat={thermostat} />
        ))}
      </div>
    </section>
  )
}

/** Rapid clicks are batched into one command after this pause. */
const SETPOINT_SEND_DELAY_MS = 800
/** Give up on the optimistic value if Nest never confirms it. */
const SETPOINT_CONFIRM_TIMEOUT_MS = 30_000

function ThermostatTile({ thermostat }: { thermostat: ThermostatSnapshot }) {
  const {
    setThermostatMode,
    setThermostatSetpoint,
    connectionStatus,
    readOnly,
  } = useHouse()
  const disabled = readOnly || connectionStatus !== 'connected'
  const setpointEnabled = !disabled && thermostat.mode !== 'off'
  const [pendingSetpoint, setPendingState] = useState<number | null>(null)
  const pendingRef = useRef<number | null>(null)
  const setPendingSetpoint = useCallback((value: number | null) => {
    pendingRef.current = value
    setPendingState(value)
  }, [])
  const sendTimerRef = useRef<number | null>(null)
  const confirmTimerRef = useRef<number | null>(null)
  const setpoint = pendingSetpoint ?? thermostat.setpointF ?? thermostat.minTemp
  const confirmedSetpoint = thermostat.setpointF ?? thermostat.minTemp

  useEffect(() => {
    if (pendingSetpoint == null || sendTimerRef.current != null) return
    if (thermostat.setpointF === pendingSetpoint && !thermostat.eco) setPendingSetpoint(null)
  }, [pendingSetpoint, setPendingSetpoint, thermostat.eco, thermostat.setpointF])

  useEffect(
    () => () => {
      if (sendTimerRef.current != null) window.clearTimeout(sendTimerRef.current)
      if (confirmTimerRef.current != null) window.clearTimeout(confirmTimerRef.current)
    },
    [],
  )

  const adjustSetpoint = useCallback(
    (delta: number) => {
      const base = pendingRef.current ?? confirmedSetpoint
      const next = Math.max(thermostat.minTemp, Math.min(thermostat.maxTemp, base + delta))
      setPendingSetpoint(next)
      if (sendTimerRef.current != null) window.clearTimeout(sendTimerRef.current)
      if (confirmTimerRef.current != null) window.clearTimeout(confirmTimerRef.current)
      sendTimerRef.current = window.setTimeout(() => {
        sendTimerRef.current = null
        confirmTimerRef.current = window.setTimeout(
          () => setPendingSetpoint(null),
          SETPOINT_CONFIRM_TIMEOUT_MS,
        )
        setThermostatSetpoint(thermostat.entityId, next).catch(() => setPendingSetpoint(null))
      }, SETPOINT_SEND_DELAY_MS)
    },
    [
      confirmedSetpoint,
      setPendingSetpoint,
      setThermostatSetpoint,
      thermostat.entityId,
      thermostat.maxTemp,
      thermostat.minTemp,
    ],
  )

  return (
    <article
      className={`hvac-thermostat-tile ${thermostat.heating ? 'hvac-thermostat-tile--heating' : ''}`}
      title={thermostat.entityId}
    >
      <div className="hvac-thermostat-tile-header">
        <h3 className="hvac-thermostat-tile-name">
          {thermostat.roomLabel ?? thermostat.name}
        </h3>
        <select
          className={`hvac-thermostat-mode-select ${
            thermostat.heating ? 'hvac-thermostat-mode-select--heating' : ''
          }`}
          value={thermostat.eco ? 'eco' : thermostat.mode}
          disabled={disabled}
          aria-label={`Mode for ${thermostat.roomLabel ?? thermostat.name}`}
          onChange={(event) =>
            void setThermostatMode(thermostat.entityId, event.target.value)
          }
        >
          {[
            ...thermostat.hvacModes,
            ...(thermostat.supportsEco || thermostat.eco ? ['eco'] : []),
          ].map((mode) => (
            <option key={mode} value={mode}>
              {formatHvacModeLabel(mode)}
            </option>
          ))}
        </select>
      </div>

      <div className="hvac-thermostat-tile-gauge">
        <ThermostatTempGauge
          value={thermostat.currentTempF}
          min={thermostat.minTemp}
          max={thermostat.maxTemp}
          heating={thermostat.heating}
        />
      </div>

      <div className="hvac-thermostat-setpoint-control">
        <button
          type="button"
          className="hvac-thermostat-step"
          disabled={!setpointEnabled || setpoint <= thermostat.minTemp}
          aria-label={`Decrease setpoint for ${thermostat.roomLabel ?? thermostat.name}`}
          onClick={() => adjustSetpoint(-1)}
        >
          −
        </button>
        <span
          className={`hvac-thermostat-setpoint-value${
            pendingSetpoint != null ? ' hvac-thermostat-setpoint-value--pending' : ''
          }`}
        >
          {thermostat.mode === 'off'
            ? 'Off'
            : pendingSetpoint != null
              ? `${pendingSetpoint}°`
              : thermostat.setpointLabel}
        </span>
        <button
          type="button"
          className="hvac-thermostat-step"
          disabled={!setpointEnabled || setpoint >= thermostat.maxTemp}
          aria-label={`Increase setpoint for ${thermostat.roomLabel ?? thermostat.name}`}
          onClick={() => adjustSetpoint(1)}
        >
          +
        </button>
      </div>
    </article>
  )
}
