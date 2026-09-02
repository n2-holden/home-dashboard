import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ThermostatTempGauge } from '../components/ThermostatTempGauge'
import { useHouse } from '../data/HouseContext'
import {
  AC_FLOOR_GROUPS,
  acUnitsForFloor,
  toNativeTemp,
  type AcUnitSnapshot,
} from '../ha/ac'
import { formatHvacModeLabel } from '../ha/hvac'

export function AcPage() {
  const { ac, connectionStatus } = useHouse()
  const groupedCount = ac.units.length
  const groupedCoolingCount = ac.units.filter((item) => item.cooling).length

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>A/C</h1>
        <p>
          {groupedCoolingCount} of {groupedCount} units cooling
        </p>
      </header>

      {connectionStatus !== 'connected' ? (
        <section className="widget hvac-page-card">
          <p className="lights-empty">Connect to Home Assistant to load A/C units.</p>
        </section>
      ) : groupedCount === 0 ? (
        <section className="widget hvac-page-card">
          <p className="lights-empty">No mini-split A/C units found in Home Assistant.</p>
        </section>
      ) : (
        <div className="hvac-floor-stack">
          {AC_FLOOR_GROUPS.map((floor) => {
            const units = acUnitsForFloor(floor.id, ac.units)
            if (units.length === 0) return null

            return <FloorSection key={floor.id} label={floor.label} units={units} />
          })}
        </div>
      )}
    </main>
  )
}

function FloorSection({
  label,
  units,
}: {
  label: string
  units: AcUnitSnapshot[]
}) {
  return (
    <section className="widget hvac-floor-section">
      <div className="hvac-floor-header">
        <h2 className="hvac-floor-title">{label}</h2>
      </div>
      <div className="hvac-thermostat-grid">
        {units.map((unit) => (
          <AcUnitTile key={unit.entityId} unit={unit} />
        ))}
      </div>
    </section>
  )
}

function AcUnitTile({ unit }: { unit: AcUnitSnapshot }) {
  const { setThermostatMode, setThermostatSetpoint, connectionStatus, readOnly } = useHouse()
  const disabled = readOnly || connectionStatus !== 'connected'
  const setpointEnabled = !disabled && unit.mode !== 'off'
  const displaySetpointF = unit.setpointF ?? unit.minTempF
  const setpointNative =
    unit.setpointNative ??
    toNativeTemp(displaySetpointF, unit.temperatureUnit)

  const adjustSetpoint = useCallback(
    (deltaF: number) => {
      const nextF = Math.max(
        unit.minTempF,
        Math.min(unit.maxTempF, displaySetpointF + deltaF),
      )
      const nextNative = toNativeTemp(nextF, unit.temperatureUnit)
      void setThermostatSetpoint(unit.entityId, nextNative)
    },
    [
      displaySetpointF,
      setThermostatSetpoint,
      unit.entityId,
      unit.maxTempF,
      unit.minTempF,
      unit.temperatureUnit,
    ],
  )

  const minNative = toNativeTemp(unit.minTempF, unit.temperatureUnit)
  const maxNative = toNativeTemp(unit.maxTempF, unit.temperatureUnit)

  return (
    <article
      className={`hvac-thermostat-tile ${
        unit.cooling
          ? 'hvac-thermostat-tile--cooling'
          : unit.heating
            ? 'hvac-thermostat-tile--heating'
            : ''
      }`}
      title={unit.entityId}
    >
      <div className="hvac-thermostat-tile-header">
        <h3 className="hvac-thermostat-tile-name">{unit.roomLabel ?? unit.name}</h3>
        <select
          className={`hvac-thermostat-mode-select ${
            unit.cooling
              ? 'hvac-thermostat-mode-select--cooling'
              : unit.heating
                ? 'hvac-thermostat-mode-select--heating'
                : ''
          }`}
          value={unit.mode}
          disabled={disabled}
          aria-label={`Mode for ${unit.roomLabel ?? unit.name}`}
          onChange={(event) => void setThermostatMode(unit.entityId, event.target.value)}
        >
          {unit.hvacModes.map((mode) => (
            <option key={mode} value={mode}>
              {formatHvacModeLabel(mode)}
            </option>
          ))}
        </select>
      </div>

      <div className="hvac-thermostat-tile-gauge">
        <ThermostatTempGauge
          value={unit.currentTempF}
          min={unit.minTempF}
          max={unit.maxTempF}
          heating={unit.heating}
          cooling={unit.cooling}
        />
      </div>

      <div className="hvac-thermostat-setpoint-control">
        <button
          type="button"
          className="hvac-thermostat-step"
          disabled={!setpointEnabled || setpointNative <= minNative}
          aria-label={`Decrease setpoint for ${unit.roomLabel ?? unit.name}`}
          onClick={() => adjustSetpoint(-1)}
        >
          −
        </button>
        <span className="hvac-thermostat-setpoint-value">
          {unit.mode === 'off' ? 'Off' : unit.setpointLabel}
        </span>
        <button
          type="button"
          className="hvac-thermostat-step"
          disabled={!setpointEnabled || setpointNative >= maxNative}
          aria-label={`Increase setpoint for ${unit.roomLabel ?? unit.name}`}
          onClick={() => adjustSetpoint(1)}
        >
          +
        </button>
      </div>
    </article>
  )
}
