import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouse } from '../data/HouseContext'
import { SHADE_FLOORS, shadesForGroup } from '../data/types'
import type { HaSensor } from '../ha/energy'
import { loadBaseUrl, loadToken } from '../ha/storage'
import {
  configHasCredentials,
  downloadZynectConfig,
  hydrateZynectConfig,
  saveZynectConfigLocal,
} from '../zynect/config'
import type { ZynectConfig } from '../zynect/types'

function energyCandidates(
  sensors: HaSensor[],
  kind: 'pv' | 'soc' | 'load' | 'batteryPower' | 'grid',
  selected: string | null,
): HaSensor[] {
  const matched = sensors.filter((s) => {
    if (selected && s.entityId === selected) return true
    const h = `${s.entityId} ${s.name}`.toLowerCase()
    if (kind === 'soc') {
      return (
        /enphase|envoy|battery|soc|charge|percent|powerpack/.test(h) ||
        s.deviceClass === 'battery' ||
        s.unit === '%'
      )
    }
    if (kind === 'load') {
      return /enphase|powerpack|load|consumption|consum/.test(h) || s.deviceClass === 'power'
    }
    if (kind === 'batteryPower') {
      return (
        (/enphase|powerpack/.test(h) && /battery/.test(h) && /power|watt/.test(h)) ||
        (/battery/.test(h) && s.deviceClass === 'power')
      )
    }
    if (kind === 'grid') {
      return /enphase|powerpack|grid|import|export/.test(h) || s.deviceClass === 'power'
    }
    return (
      /enphase|envoy|solar|pv|production|power|watt|powerpack/.test(h) ||
      s.deviceClass === 'power' ||
      s.unit?.toLowerCase() === 'w' ||
      s.unit?.toLowerCase() === 'kw'
    )
  })
  return matched.length > 0 ? matched : sensors.filter((s) => s.numericValue != null).slice(0, 80)
}

export function SettingsPage() {
  const {
    shades,
    covers,
    sensors,
    entityMap,
    energyMap,
    connectionStatus,
    connectionError,
    mappedCount,
    scheduledCoverCount,
    scheduleDebug,
    connect,
    disconnect,
    refresh,
    setEntityMapping,
    autoMapEntities,
    setEnergyMapping,
    autoMapEnergy,
    replaceEntityMap,
    replaceEnergyMap,
    exportShadeMap,
    exportEnergyMap,
    exportHaConfig,
  } = useHouse()

  const [token, setToken] = useState(() => loadToken())
  const [baseUrl, setBaseUrl] = useState(() => loadBaseUrl())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [zynectConfig, setZynectConfig] = useState<ZynectConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await hydrateZynectConfig()
      if (!cancelled) setZynectConfig(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const usedEntities = useMemo(() => {
    const known = new Set(shades.map((s) => s.id))
    return new Set(
      Object.entries(entityMap)
        .filter(([shadeId, entityId]) => known.has(shadeId) && Boolean(entityId))
        .map(([, entityId]) => entityId),
    )
  }, [entityMap, shades])

  const pvOnlyOptions = useMemo(
    () => energyCandidates(sensors, 'pv', energyMap.pvOnlyProduction),
    [sensors, energyMap.pvOnlyProduction],
  )
  const powerpackPvOptions = useMemo(
    () => energyCandidates(sensors, 'pv', energyMap.powerpackProduction),
    [sensors, energyMap.powerpackProduction],
  )
  const socOptions = useMemo(
    () => energyCandidates(sensors, 'soc', energyMap.powerpackBatterySoc),
    [sensors, energyMap.powerpackBatterySoc],
  )
  const loadOptions = useMemo(
    () => energyCandidates(sensors, 'load', energyMap.powerpackLoad),
    [sensors, energyMap.powerpackLoad],
  )
  const batteryPowerOptions = useMemo(
    () => energyCandidates(sensors, 'batteryPower', energyMap.powerpackBatteryPower),
    [sensors, energyMap.powerpackBatteryPower],
  )
  const gridOptions = useMemo(
    () => energyCandidates(sensors, 'grid', energyMap.powerpackGrid),
    [sensors, energyMap.powerpackGrid],
  )

  async function onConnect(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await connect(token, baseUrl)
      await refresh()
      setMessage('Connected and synced.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setBusy(false)
    }
  }

  function onAutoMap() {
    const added = autoMapEntities()
    setMessage(added ? `Mapped ${added} shade(s) by name.` : 'No new automatic shade matches found.')
  }

  function onAutoMapEnergy() {
    const added = autoMapEnergy()
    setMessage(
      added
        ? `Mapped ${added} Enphase sensor(s).`
        : 'No Enphase PV/battery sensors matched automatically.',
    )
  }

  function onImportShadeMap(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Record<string, string>
        replaceEntityMap(parsed)
        setMessage(`Imported shade map (${Object.keys(parsed).length} entries).`)
      } catch {
        setMessage('Could not read shade-map.json')
      }
    }
    reader.readAsText(file)
  }

  function onImportEnergyMap(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as {
          pvOnlyProduction?: string | null
          pvOnlyLoad?: string | null
          pvOnlyGrid?: string | null
          powerpackProduction?: string | null
          powerpackBatterySoc?: string | null
          powerpackLoad?: string | null
          powerpackBatteryPower?: string | null
          powerpackGrid?: string | null
          pvProduction?: string | null
          batterySoc?: string | null
        }
        replaceEnergyMap({
          pvOnlyProduction: parsed.pvOnlyProduction ?? parsed.pvProduction ?? null,
          pvOnlyLoad: parsed.pvOnlyLoad ?? null,
          pvOnlyGrid: parsed.pvOnlyGrid ?? null,
          powerpackProduction: parsed.powerpackProduction ?? null,
          powerpackBatterySoc: parsed.powerpackBatterySoc ?? parsed.batterySoc ?? null,
          powerpackLoad: parsed.powerpackLoad ?? null,
          powerpackBatteryPower: parsed.powerpackBatteryPower ?? null,
          powerpackGrid: parsed.powerpackGrid ?? null,
        })
        setMessage('Imported energy map.')
      } catch {
        setMessage('Could not read energy-map.json')
      }
    }
    reader.readAsText(file)
  }

  function onSaveZynectConfig() {
    if (!zynectConfig) return
    saveZynectConfigLocal(zynectConfig)
    setMessage('Saved Zynect settings to this browser.')
  }

  function onExportZynectConfig() {
    if (!zynectConfig) return
    downloadZynectConfig(zynectConfig)
    setMessage(
      'Downloaded zynect-config.json — copy it to config/www/home-dashboard/ for local + remote.',
    )
  }

  function onImportZynectConfig(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ZynectConfig
        setZynectConfig(parsed)
        saveZynectConfigLocal(parsed)
        setMessage('Imported zynect-config.json.')
      } catch {
        setMessage('Could not parse zynect-config.json.')
      }
    }
    reader.readAsText(file)
  }

  function patchZynect(patch: Partial<ZynectConfig>) {
    setZynectConfig((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Settings</h1>
        <p>Connect to Home Assistant and map shades and Enphase sensors.</p>
      </header>

      <section className="widget settings-card">
        <p className="widget-kicker">Connection</p>
        <h2 className="widget-title">Home Assistant API</h2>
        <p className="settings-copy">
          Create a long-lived access token in HA: your profile (lower left) → Long-lived access
          tokens → Create token. Paste it below. Leave the base URL blank when this app is served
          from <code>/local/</code> on the same HA box.
        </p>

        <form className="settings-form" onSubmit={onConnect}>
          <label className="field">
            <span>Long-lived access token</span>
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJ0eXAiOiJKV1QiLCJhb…"
              required
            />
          </label>
          <label className="field">
            <span>Base URL (optional)</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://homeassistant.local:8123"
            />
          </label>
          <div className="toolbar">
            <button className="btn btn--accent" type="submit" disabled={busy}>
              {busy ? 'Connecting…' : 'Save & connect'}
            </button>
            <button
              className="btn"
              type="button"
              disabled={connectionStatus === 'disconnected'}
              onClick={() => {
                disconnect()
                setMessage('Disconnected. Showing mock values.')
              }}
            >
              Disconnect
            </button>
            <button
              className="btn"
              type="button"
              disabled={connectionStatus !== 'connected'}
              onClick={() => void refresh()}
            >
              Refresh now
            </button>
          </div>
        </form>

        <p className={`settings-status settings-status--${connectionStatus}`}>
          Status: {connectionStatus}
          {connectionError ? ` — ${connectionError}` : ''}
        </p>
        {message ? <p className="settings-message">{message}</p> : null}
      </section>

      <section className="widget settings-card">
        <p className="widget-kicker">Local vs remote</p>
        <h2 className="widget-title">Share mappings</h2>
        <p className="settings-copy">
          Remote access (Nabu Casa) is a different browser site — it does not inherit your token or
          mappings. Export these files from the browser where everything already works, then copy
          them into <code>config/www/home-dashboard/</code> next to <code>index.html</code>. Leave{' '}
          <code>baseUrl</code> empty in <code>ha-config.json</code> so the API uses the same host
          you opened (local or remote).
        </p>
        <div className="toolbar">
          <button
            type="button"
            className="btn btn--accent"
            disabled={!loadToken()}
            onClick={() => {
              exportHaConfig()
              setMessage('Downloaded ha-config.json — copy it to config/www/home-dashboard/')
            }}
          >
            Export ha-config.json
          </button>
          <button
            type="button"
            className="btn btn--accent"
            disabled={mappedCount === 0}
            onClick={() => {
              exportShadeMap()
              setMessage('Downloaded shade-map.json — copy it to config/www/home-dashboard/')
            }}
          >
            Export shade-map.json
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              exportEnergyMap()
              setMessage('Downloaded energy-map.json — copy it to config/www/home-dashboard/')
            }}
          >
            Export energy-map.json
          </button>
        </div>
        <div className="toolbar">
          <label className="btn">
            Import shade-map.json
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => onImportShadeMap(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="btn">
            Import energy-map.json
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => onImportEnergyMap(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </section>

      <section className="widget settings-card">
        <div className="floor-header">
          <div>
            <p className="widget-kicker">Zynect</p>
            <h2 className="widget-title">Solar thermal</h2>
            <p className="widget-meta">
              {zynectConfig && configHasCredentials(zynectConfig)
                ? 'Credentials configured'
                : 'No Zynect token yet'}
            </p>
          </div>
          <Link className="btn btn--compact" to="/solar-thermal">
            Open page
          </Link>
        </div>
        <p className="settings-copy">
          Paste the <code>Authorization</code> header from zynect.com (DevTools → Network → any{' '}
          <code>/api/v2/</code> request). Export <code>zynect-config.json</code> and place it in{' '}
          <code>config/www/home-dashboard/</code> so the same token works on local HA and Nabu
          Casa remote.
        </p>
        {zynectConfig ? (
          <div className="map-stack" style={{ marginTop: '0.75rem' }}>
            <label className="map-row">
              <span className="map-label">Auth header value</span>
              <input
                type="password"
                autoComplete="off"
                value={zynectConfig.authHeaderValue}
                onChange={(e) => patchZynect({ authHeaderValue: e.target.value })}
                placeholder="Bearer eyJ…"
              />
            </label>
            <label className="map-row">
              <span className="map-label">Site latitude</span>
              <input
                type="number"
                step="0.0001"
                value={zynectConfig.siteLatitude}
                onChange={(e) => patchZynect({ siteLatitude: Number(e.target.value) })}
              />
            </label>
            <label className="map-row">
              <span className="map-label">Site longitude</span>
              <input
                type="number"
                step="0.0001"
                value={zynectConfig.siteLongitude}
                onChange={(e) => patchZynect({ siteLongitude: Number(e.target.value) })}
              />
            </label>
            <label className="map-row">
              <span className="map-label">Refresh interval (seconds)</span>
              <input
                type="number"
                min={5}
                value={zynectConfig.refreshIntervalSeconds}
                onChange={(e) =>
                  patchZynect({ refreshIntervalSeconds: Number(e.target.value) || 30 })
                }
              />
            </label>
          </div>
        ) : (
          <p className="settings-copy">Loading Zynect settings…</p>
        )}
        <div className="toolbar" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn--accent"
            disabled={!zynectConfig}
            onClick={onSaveZynectConfig}
          >
            Save in browser
          </button>
          <button
            type="button"
            className="btn btn--accent"
            disabled={!zynectConfig || !configHasCredentials(zynectConfig)}
            onClick={onExportZynectConfig}
          >
            Export zynect-config.json
          </button>
          <label className="btn">
            Import zynect-config.json
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => onImportZynectConfig(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </section>

      <section className="widget settings-card">
        <div className="floor-header">
          <div>
            <p className="widget-kicker">Enphase</p>
            <h2 className="widget-title">Solar sensors</h2>
            <p className="widget-meta">
              Map PV array and Shed Solar (PowerPack) live values — production, load, SOC, battery
              power, and grid
            </p>
          </div>
          <button
            type="button"
            className="btn btn--compact"
            disabled={sensors.length === 0}
            onClick={onAutoMapEnergy}
          >
            Auto-match
          </button>
        </div>

        {connectionStatus !== 'connected' ? (
          <p className="settings-copy">Connect first to load sensors from Home Assistant.</p>
        ) : (
          <div className="map-stack" style={{ marginTop: '0.75rem' }}>
            <div className="map-group">
              <h4 className="group-title">PV Solar (IQ Gateway · site 5478356)</h4>
              <div className="map-rows">
                <label className="map-row">
                  <span className="map-label">Production</span>
                  <select
                    value={energyMap.pvOnlyProduction ?? ''}
                    onChange={(e) =>
                      setEnergyMapping('pvOnlyProduction', e.target.value || null)
                    }
                  >
                    <option value="">Not mapped</option>
                    {pvOnlyOptions.map((sensor) => (
                      <option key={sensor.entityId} value={sensor.entityId}>
                        {sensor.name}
                        {sensor.numericValue != null
                          ? ` — ${sensor.numericValue}${sensor.unit ? ` ${sensor.unit}` : ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-row">
                  <span className="map-label">Load</span>
                  <select
                    value={energyMap.pvOnlyLoad ?? ''}
                    onChange={(e) => setEnergyMapping('pvOnlyLoad', e.target.value || null)}
                  >
                    <option value="">Not mapped</option>
                    {loadOptions.map((sensor) => (
                      <option key={sensor.entityId} value={sensor.entityId}>
                        {sensor.name}
                        {sensor.numericValue != null
                          ? ` — ${sensor.numericValue}${sensor.unit ? ` ${sensor.unit}` : ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-row">
                  <span className="map-label">Grid</span>
                  <select
                    value={energyMap.pvOnlyGrid ?? ''}
                    onChange={(e) => setEnergyMapping('pvOnlyGrid', e.target.value || null)}
                  >
                    <option value="">Not mapped</option>
                    {gridOptions.map((sensor) => (
                      <option key={sensor.entityId} value={sensor.entityId}>
                        {sensor.name}
                        {sensor.numericValue != null
                          ? ` — ${sensor.numericValue}${sensor.unit ? ` ${sensor.unit}` : ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="map-group">
              <h4 className="group-title">Shed Solar (IQ PowerPack)</h4>
              <div className="map-rows">
                <label className="map-row">
                  <span className="map-label">Production</span>
                  <select
                    value={energyMap.powerpackProduction ?? ''}
                    onChange={(e) =>
                      setEnergyMapping('powerpackProduction', e.target.value || null)
                    }
                  >
                    <option value="">Not mapped</option>
                    {powerpackPvOptions.map((sensor) => (
                      <option key={sensor.entityId} value={sensor.entityId}>
                        {sensor.name}
                        {sensor.numericValue != null
                          ? ` — ${sensor.numericValue}${sensor.unit ? ` ${sensor.unit}` : ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-row">
                  <span className="map-label">Load</span>
                  <select
                    value={energyMap.powerpackLoad ?? ''}
                    onChange={(e) => setEnergyMapping('powerpackLoad', e.target.value || null)}
                  >
                    <option value="">Not mapped</option>
                    {loadOptions.map((sensor) => (
                      <option key={sensor.entityId} value={sensor.entityId}>
                        {sensor.name}
                        {sensor.numericValue != null
                          ? ` — ${sensor.numericValue}${sensor.unit ? ` ${sensor.unit}` : ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-row">
                  <span className="map-label">Battery SOC</span>
                  <select
                    value={energyMap.powerpackBatterySoc ?? ''}
                    onChange={(e) =>
                      setEnergyMapping('powerpackBatterySoc', e.target.value || null)
                    }
                  >
                    <option value="">Not mapped</option>
                    {socOptions.map((sensor) => (
                      <option key={sensor.entityId} value={sensor.entityId}>
                        {sensor.name}
                        {sensor.numericValue != null
                          ? ` — ${sensor.numericValue}${sensor.unit ? ` ${sensor.unit}` : ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-row">
                  <span className="map-label">Battery power</span>
                  <select
                    value={energyMap.powerpackBatteryPower ?? ''}
                    onChange={(e) =>
                      setEnergyMapping('powerpackBatteryPower', e.target.value || null)
                    }
                  >
                    <option value="">Not mapped</option>
                    {batteryPowerOptions.map((sensor) => (
                      <option key={sensor.entityId} value={sensor.entityId}>
                        {sensor.name}
                        {sensor.numericValue != null
                          ? ` — ${sensor.numericValue}${sensor.unit ? ` ${sensor.unit}` : ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-row">
                  <span className="map-label">Grid</span>
                  <select
                    value={energyMap.powerpackGrid ?? ''}
                    onChange={(e) => setEnergyMapping('powerpackGrid', e.target.value || null)}
                  >
                    <option value="">Not mapped</option>
                    {gridOptions.map((sensor) => (
                      <option key={sensor.entityId} value={sensor.entityId}>
                        {sensor.name}
                        {sensor.numericValue != null
                          ? ` — ${sensor.numericValue}${sensor.unit ? ` ${sensor.unit}` : ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="widget settings-card">
        <p className="widget-kicker">Schedules</p>
        <h2 className="widget-title">Shade schedule debug</h2>
        <p className="settings-copy">
          Shade open/close times come from the Homebridge plugin at{' '}
          <code>http://homebridge.local:8787/schedule.json</code>. After updating the plugin,
          the dashboard fetches schedules live (no daily copy needed on your LAN). The bundled{' '}
          <code>shade-schedule-today.json</code> is only a fallback for remote access.
        </p>
        {connectionStatus !== 'connected' ? (
          <p className="settings-copy">Connect first to load schedule data.</p>
        ) : scheduleDebug ? (
          <ul className="settings-copy" style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem' }}>
            <li>Automation entities in HA: {scheduleDebug.automationEntityCount}</li>
            <li>Automation IDs listed via API: {scheduleDebug.automationIdsListed}</li>
            <li>Automation configs loaded: {scheduleDebug.automationCount}</li>
            <li>Schedule entities in HA: {scheduleDebug.scheduleEntityCount}</li>
            <li>input_datetime helpers in HA: {scheduleDebug.datetimeHelperCount}</li>
            <li>With cover actions: {scheduleDebug.automationsWithCoverAction}</li>
            <li>With time/sun/datetime triggers: {scheduleDebug.automationsWithTimeTrigger}</li>
            <li>With both (direct match): {scheduleDebug.automationsWithBoth}</li>
            <li>Helper entity matches: {scheduleDebug.helperMatches}</li>
            <li>Covers with schedules: {scheduledCoverCount}</li>
            <li>From Homebridge: {scheduleDebug.homebridgeCoverCount}</li>
            {scheduleDebug.homebridgeSource ? (
              <li>Homebridge source: {scheduleDebug.homebridgeSource}</li>
            ) : null}
            <li>Homebridge shades parsed: {scheduleDebug.homebridgeParsedCount}</li>
            <li>Matched to mapped covers: {scheduleDebug.homebridgeMatchedCount}</li>
            {scheduleDebug.homebridgeUnmatched.length > 0 ? (
              <li>Unmatched names: {scheduleDebug.homebridgeUnmatched.slice(0, 8).join(', ')}</li>
            ) : null}
            <li>From schedule map: {scheduleDebug.scheduleMapCoverCount}</li>
            {scheduleDebug.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
            {scheduleDebug.sampleAutomationAliases.length > 0 ? (
              <li>
                Sample automations: {scheduleDebug.sampleAutomationAliases.join(', ')}
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="settings-copy">No schedule debug info yet — click Refresh now above.</p>
        )}
        {connectionStatus === 'connected' && scheduleDebug?.homebridgeCoverCount === 0 ? (
          <p className="settings-copy" style={{ marginTop: '0.75rem' }}>
            No Homebridge schedules loaded. Re-deploy from your PC:{' '}
            <code>npm run build:ha</code> then <code>npm run deploy</code>. That fetches today&apos;s
            schedule and copies <code>shade-schedule-today.json</code> into the HA www folder.
          </p>
        ) : null}
        {connectionStatus === 'connected' &&
        scheduleDebug &&
        scheduleDebug.automationEntityCount > 0 &&
        scheduleDebug.automationCount === 0 ? (
          <p className="settings-copy" style={{ marginTop: '0.75rem' }}>
            Home Assistant has {scheduleDebug.automationEntityCount} automation entities but none
            loaded via the config API — check the error lines above. If websocket is blocked, try
            opening the dashboard directly at{' '}
            <code>/local/home-dashboard/index.html</code> on your HA URL (not embedded in a panel).
          </p>
        ) : null}
        {connectionStatus === 'connected' &&
        scheduleDebug &&
        scheduleDebug.automationEntityCount === 0 &&
        scheduleDebug.scheduleEntityCount === 0 ? (
          <p className="settings-copy" style={{ marginTop: '0.75rem' }}>
            No automation or schedule entities found in Home Assistant. Shade schedules may live
            outside HA (Lutron app, etc.) — paste how your shades are scheduled and we can wire it
            up.
          </p>
        ) : null}
      </section>

      <section className="widget settings-card">
        <div className="floor-header">
          <div>
            <p className="widget-kicker">Entity map</p>
            <h2 className="widget-title">Shade → cover</h2>
            <p className="widget-meta">
              {mappedCount} of {shades.length} mapped · {covers.length} covers available
            </p>
          </div>
          <button
            type="button"
            className="btn btn--compact"
            disabled={covers.length === 0}
            onClick={onAutoMap}
          >
            Auto-match names
          </button>
        </div>

        {connectionStatus !== 'connected' ? (
          <p className="settings-copy">Connect first to load cover entities from Home Assistant.</p>
        ) : (
          <div className="map-stack">
            {SHADE_FLOORS.map((floor) => (
              <div key={floor.id} className="map-floor">
                <h3 className="floor-title">{floor.label}</h3>
                {floor.groups.map((group) => {
                  const groupShades = shadesForGroup(shades, floor.id, group)
                  if (groupShades.length === 0) return null
                  return (
                    <div key={group} className="map-group">
                      <h4 className="group-title">{group}</h4>
                      <div className="map-rows">
                        {groupShades.map((shade) => {
                          const selected = entityMap[shade.id] ?? ''
                          return (
                            <label key={shade.id} className="map-row">
                              <span className="map-label">{shade.name}</span>
                              <select
                                value={selected}
                                onChange={(e) =>
                                  setEntityMapping(shade.id, e.target.value || null)
                                }
                              >
                                <option value="">Not mapped</option>
                                {covers.map((cover) => {
                                  const taken =
                                    usedEntities.has(cover.entityId) &&
                                    entityMap[shade.id] !== cover.entityId
                                  return (
                                    <option
                                      key={cover.entityId}
                                      value={cover.entityId}
                                      disabled={taken}
                                    >
                                      {cover.name}
                                      {cover.closedPercent == null
                                        ? ' (no position)'
                                        : ` — ${cover.closedPercent}% closed`}
                                      {taken ? ' (used)' : ''}
                                    </option>
                                  )
                                })}
                              </select>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
