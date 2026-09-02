import { useCallback, useState } from 'react'
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
  const [expanded, setExpanded] = useState(false)
  const hiddenThermostats = thermostats.filter((item) => item.hiddenUntilExpanded)
  const visibleThermostats = thermostats.filter((item) => !item.hiddenUntilExpanded)
  const hasHidden = hiddenThermostats.length > 0

  return (
    <section className="widget hvac-floor-section">
      <div className="hvac-floor-header">
        <h2 className="hvac-floor-title">{floor.label}</h2>
        {hasHidden ? (
          <button
            type="button"
            className={`hvac-floor-expand ${expanded ? 'hvac-floor-expand--open' : ''}`}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide garage thermostat' : 'Show garage thermostat'}
            onClick={() => setExpanded((current) => !current)}
          >
            <span aria-hidden>›</span>
          </button>
        ) : null}
      </div>
      <div className="hvac-thermostat-grid">
        {visibleThermostats.map((thermostat) => (
          <ThermostatTile key={thermostat.entityId} thermostat={thermostat} />
        ))}
      </div>
      {expanded && hasHidden ? (
        <div className="hvac-thermostat-grid hvac-thermostat-grid--expanded">
          {hiddenThermostats.map((thermostat) => (
            <ThermostatTile key={thermostat.entityId} thermostat={thermostat} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ThermostatTile({ thermostat }: { thermostat: ThermostatSnapshot }) {
  const {
    setThermostatMode,
    setThermostatSetpoint,
    connectionStatus,
    readOnly,
  } = useHouse()
  const disabled = readOnly || connectionStatus !== 'connected'
  const setpointEnabled = !disabled && thermostat.mode !== 'off'
  const setpoint = thermostat.setpointF ?? thermostat.minTemp

  const adjustSetpoint = useCallback(
    (delta: number) => {
      const next = Math.max(
        thermostat.minTemp,
        Math.min(thermostat.maxTemp, setpoint + delta),
      )
      void setThermostatSetpoint(thermostat.entityId, next)
    },
    [setThermostatSetpoint, setpoint, thermostat.entityId, thermostat.maxTemp, thermostat.minTemp],
  )

  return (
    <article
      className={`hvac-thermostat-tile ${thermostat.heating ? 'hvac-thermostat-tile--heating' : ''}`}
      title={thermostat.entityId}
    >
      <div className="hvac-thermostat-tile-header">
        <h3 className="hvac-thermostat-tile-name">{thermostat.roomLabel ?? thermostat.name}</h3>
        <select
          className={`hvac-thermostat-mode-select ${
            thermostat.heating ? 'hvac-thermostat-mode-select--heating' : ''
          }`}
          value={thermostat.mode}
          disabled={disabled}
          aria-label={`Mode for ${thermostat.roomLabel ?? thermostat.name}`}
          onChange={(event) =>
            void setThermostatMode(thermostat.entityId, event.target.value)
          }
        >
          {thermostat.hvacModes.map((mode) => (
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
        <span className="hvac-thermostat-setpoint-value">
          {thermostat.mode === 'off' ? 'Off' : thermostat.setpointLabel}
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
