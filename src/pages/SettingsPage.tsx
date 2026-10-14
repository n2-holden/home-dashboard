import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ControlLogPanel } from '../components/ControlLogPanel'
import { DashboardActionPicker } from '../components/DashboardActionPicker'
import { DashboardConditionPicker } from '../components/DashboardConditionPicker'
import { DeferredNumberInput } from '../components/DeferredNumberInput'
import { useHouse } from '../data/HouseContext'
import { SHADE_FLOORS, shadesForGroup } from '../data/types'
import type { HaSensor } from '../ha/energy'
import { BATHROOM_FAN_SLOT_COUNT } from '../ha/bathroomFans'
import {
  buildDashboardActionCatalog,
  formatDashboardActionLabel,
  type DashboardActionSelection,
} from '../ha/dashboardActions'
import {
  newOutsideButtonId,
  type OutsideCustomButton,
} from '../ha/outsideButtons'
import {
  buildDashboardConditionCatalog,
  formatDashboardConditionLabel,
  newConditionRowId,
  type ConditionLogic,
  type DashboardCondition,
  type DrivewayAlarmConditionRow,
} from '../ha/dashboardConditions'
import { loadBaseUrl, loadToken } from '../ha/storage'
import { PHONE_NOTIFY_TARGETS } from '../ha/notifications'
import { DASHBOARD_SOUND_OPTIONS, playDashboardSound } from '../ha/dashboardSounds'
import { timeFromInputValue, timeInputValue } from '../ha/reminders'
import {
  configHasCredentials,
  downloadZynectConfig,
  hydrateZynectConfig,
  saveZynectConfigLocal,
} from '../zynect/config'
import type { ZynectConfig } from '../zynect/types'

type SettingsTab = 'configuration' | 'automation' | 'notification' | 'activity' | 'communication'

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'configuration', label: 'Configuration' },
  { id: 'automation', label: 'Automation' },
  { id: 'notification', label: 'Notification' },
  { id: 'activity', label: 'Activity' },
  { id: 'communication', label: 'Communication' },
]

function parseSettingsTab(value: string | null): SettingsTab {
  if (
    value === 'automation' ||
    value === 'notification' ||
    value === 'activity' ||
    value === 'communication' ||
    value === 'configuration'
  ) {
    return value
  }
  // Legacy ?tab=log → activity
  if (value === 'log') return 'activity'
  return 'configuration'
}

function energyCandidates(
  sensors: HaSensor[],
  kind: 'pv' | 'energyMonth' | 'energyLifetime',
  selected: string | null,
): HaSensor[] {
  const matched = sensors.filter((s) => {
    if (selected && s.entityId === selected) return true
    const h = `${s.entityId} ${s.name}`.toLowerCase()
    const unit = (s.unit ?? '').toLowerCase().replace(/\s/g, '')
    if (kind === 'energyMonth' || kind === 'energyLifetime') {
      const isEnergy =
        s.deviceClass === 'energy' ||
        unit === 'kwh' ||
        unit === 'wh' ||
        unit === 'mwh' ||
        /energy|kwh|lifetime|month|produced/.test(h)
      if (!isEnergy) return false
      // Prefer site 5478356 when present, but still allow other energy sensors
      return true
    }
    return (
      /solar|pv|production|power|watt/.test(h) ||
      s.deviceClass === 'power' ||
      s.unit?.toLowerCase() === 'w' ||
      s.unit?.toLowerCase() === 'kw'
    )
  })

  if (kind === 'energyMonth' || kind === 'energyLifetime') {
    const preferred = matched.filter((s) => {
      const h = `${s.entityId} ${s.name}`.toLowerCase()
      if (kind === 'energyMonth') return /month|monthly|this_month/.test(h)
      return /lifetime|life_time/.test(h)
    })
    const sitePreferred = (preferred.length > 0 ? preferred : matched).filter((s) =>
      /5478356/.test(s.entityId),
    )
    const list =
      sitePreferred.length > 0
        ? sitePreferred
        : preferred.length > 0
          ? preferred
          : matched
    if (list.length > 0) return list
    // Last resort: any sensor with an energy-ish unit so the dropdown isn't empty
    // after a partial HA reload.
    return sensors.filter((s) => {
      const unit = (s.unit ?? '').toLowerCase().replace(/\s/g, '')
      return (
        s.deviceClass === 'energy' ||
        unit === 'kwh' ||
        unit === 'wh' ||
        unit === 'mwh'
      )
    })
  }

  return matched.length > 0 ? matched : sensors.filter((s) => s.numericValue != null).slice(0, 80)
}

export function SettingsPage() {
  const {
    shades,
    covers,
    sensors,
    entityMap,
    energyMap,
    poolMap,
    pondMap,
    connectionStatus,
    connectionError,
    mappedCount,
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
    exportPoolMap,
    exportPondMap,
    setPoolDepthOffset,
    setPondDepthOffset,
    crestronPower,
    setCrestronPowerCycleEnabled,
    setCrestronPowerCycleMinutes,
    bathroomFanAutoOffEnabled,
    setBathroomFanAutoOffEnabled,
    bathroomFanAutoOffMinutes,
    setBathroomFanAutoOffMinutes,
    bathroomFanSlots,
    setBathroomFanSlot,
    pond,
    clearPondFillError,
    pondFillAutoEnabled,
    setPondFillAutoEnabled,
    pondFillLowInches,
    setPondFillLowInches,
    pondFillFullInches,
    setPondFillFullInches,
    doorbellEmailEnabled,
    setDoorbellEmailEnabled,
    doorbellIconMinutes,
    setDoorbellIconMinutes,
    doorbellAudioEnabled,
    setDoorbellAudioEnabled,
    doorbellAudio,
    setDoorbellAudio,
    drivewayAlarmEmailEnabled,
    setDrivewayAlarmEmailEnabled,
    drivewayAlarmEnabled,
    setDrivewayAlarmEnabled,
    drivewayAlarmTrigger,
    setDrivewayAlarmTrigger,
    drivewayAlarmResetSeconds,
    setDrivewayAlarmResetSeconds,
    drivewayAlarmConditions,
    setDrivewayAlarmConditions,
    drivewayAlarmActions,
    setDrivewayAlarmActions,
    drivewayAlarmRestore,
    setDrivewayAlarmRestore,
    drivewayAlarmResetActions,
    setDrivewayAlarmResetActions,
    drivewayAlarmAudioEnabled,
    setDrivewayAlarmAudioEnabled,
    drivewayAlarmAudio,
    setDrivewayAlarmAudio,
    reminders,
    updateReminder,
    crestronLights,
    crestronScenes,
    outsideTransformers,
    audio,
    receiver,
    exportHaConfig,
    poolPumpOffEmailEnabled,
    setPoolPumpOffEmailEnabled,
    deviceCommFailureEmailEnabled,
    setDeviceCommFailureEmailEnabled,
    deviceCommFailureMinutes,
    setDeviceCommFailureMinutes,
    commandFailedEmailEnabled,
    setCommandFailedEmailEnabled,
    internetOutageEmailEnabled,
    setInternetOutageEmailEnabled,
    internetOutageMinutes,
    setInternetOutageMinutes,
    internetOnline,
    notifyEmailEnabled,
    setNotifyEmailEnabled,
    notifyPhoneEnabled,
    setNotifyPhoneEnabled,
    notifyEmailOverride,
    setNotifyEmailOverride,
    notifyPhoneTarget,
    setNotifyPhoneTarget,
    poolLowWaterEmailEnabled,
    setPoolLowWaterEmailEnabled,
    poolLowWaterInches,
    setPoolLowWaterInches,
    pondLowWaterEmailEnabled,
    setPondLowWaterEmailEnabled,
    pondLowWaterInches,
    setPondLowWaterInches,
    cisternLowWaterEmailEnabled,
    setCisternLowWaterEmailEnabled,
    cisternLowWaterPercent,
    setCisternLowWaterPercent,
    poolPumpAutoOnEnabled,
    setPoolPumpAutoOnEnabled,
    poolPumpAutoOnMinutes,
    setPoolPumpAutoOnMinutes,
    outsideButtons,
    setOutsideButtons,
    readOnly,
  } = useHouse()

  const [searchParams, setSearchParams] = useSearchParams()
  const settingsTab = parseSettingsTab(searchParams.get('tab'))
  const openCommFromQuery = searchParams.get('comm') === '1'

  function selectSettingsTab(tab: SettingsTab) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    if (tab !== 'communication') next.delete('comm')
    setSearchParams(next, { replace: true })
  }

  const [token, setToken] = useState(() => loadToken())
  const [baseUrl, setBaseUrl] = useState(() => loadBaseUrl())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [zynectConfig, setZynectConfig] = useState<ZynectConfig | null>(null)
  const [notifyEmailDraft, setNotifyEmailDraft] = useState(notifyEmailOverride)
  const [actionPickerOpen, setActionPickerOpen] = useState(false)
  const [resetActionPickerOpen, setResetActionPickerOpen] = useState(false)
  const [conditionPickerOpen, setConditionPickerOpen] = useState(false)
  const [outsideActionPicker, setOutsideActionPicker] = useState<{
    buttonId: string
    target: 'actions' | 'activeActions'
  } | null>(null)

  const actionCatalog = useMemo(
    () =>
      buildDashboardActionCatalog({
        states: [],
        outsideTransformers,
        crestronLights,
        crestronScenes,
        audio,
        receiver,
        shadeEntityMap: entityMap,
      }),
    [audio, crestronLights, crestronScenes, entityMap, outsideTransformers, receiver],
  )

  const conditionCatalog = useMemo(
    () =>
      buildDashboardConditionCatalog({
        states: [],
        outsideTransformers,
        crestronLights,
        crestronScenes,
        audio,
        receiver,
        shadeEntityMap: entityMap,
      }),
    [audio, crestronLights, crestronScenes, entityMap, outsideTransformers, receiver],
  )

  useEffect(() => {
    if (!openCommFromQuery) return
    if (settingsTab === 'communication') return
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'communication')
    next.set('comm', '1')
    setSearchParams(next, { replace: true })
  }, [openCommFromQuery, searchParams, setSearchParams, settingsTab])

  useEffect(() => {
    setNotifyEmailDraft(notifyEmailOverride)
  }, [notifyEmailOverride])

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
  const pvMonthOptions = useMemo(
    () => energyCandidates(sensors, 'energyMonth', energyMap.pvOnlyMonthEnergy),
    [sensors, energyMap.pvOnlyMonthEnergy],
  )
  const pvLifetimeOptions = useMemo(
    () => energyCandidates(sensors, 'energyLifetime', energyMap.pvOnlyLifetimeEnergy),
    [sensors, energyMap.pvOnlyLifetimeEnergy],
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
        ? `Mapped ${added} PV sensor(s).`
        : 'No PV sensors matched automatically.',
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
          pvOnlyTodayEnergy?: string | null
          pvOnlyMonthEnergy?: string | null
          pvOnlyLifetimeEnergy?: string | null
          pvProduction?: string | null
        }
        replaceEnergyMap({
          pvOnlyProduction: parsed.pvOnlyProduction ?? parsed.pvProduction ?? null,
          pvOnlyLoad: parsed.pvOnlyLoad ?? null,
          pvOnlyGrid: parsed.pvOnlyGrid ?? null,
          pvOnlyTodayEnergy: parsed.pvOnlyTodayEnergy ?? null,
          pvOnlyMonthEnergy: parsed.pvOnlyMonthEnergy ?? null,
          pvOnlyLifetimeEnergy: parsed.pvOnlyLifetimeEnergy ?? null,
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
        <p>Connect to Home Assistant and map shades and solar sensors.</p>
      </header>

      <div className="trends-range" role="group" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn btn--compact${settingsTab === tab.id ? ' settings-tab--active' : ''}`}
            aria-pressed={settingsTab === tab.id}
            onClick={() => selectSettingsTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {settingsTab === 'configuration' ? (
        <>
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
              <button
                type="button"
                className="btn"
                onClick={() => {
                  exportPoolMap()
                  setMessage('Downloaded pool-map.json — copy it to config/www/home-dashboard/')
                }}
              >
                Export pool-map.json
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  exportPondMap()
                  setMessage('Downloaded pond-map.json — copy it to config/www/home-dashboard/')
                }}
              >
                Export pond-map.json
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
                  <DeferredNumberInput
                    step="0.0001"
                    value={zynectConfig.siteLatitude}
                    onCommit={(next) => patchZynect({ siteLatitude: next })}
                  />
                </label>
                <label className="map-row">
                  <span className="map-label">Site longitude</span>
                  <DeferredNumberInput
                    step="0.0001"
                    value={zynectConfig.siteLongitude}
                    onCommit={(next) => patchZynect({ siteLongitude: next })}
                  />
                </label>
                <label className="map-row">
                  <span className="map-label">Refresh interval (seconds)</span>
                  <DeferredNumberInput
                    min={5}
                    value={zynectConfig.refreshIntervalSeconds}
                    onCommit={(next) =>
                      patchZynect({ refreshIntervalSeconds: next >= 5 ? next : 30 })
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
                <p className="widget-kicker">Pool</p>
                <h2 className="widget-title">Depth offset</h2>
                <p className="widget-meta">
                  Water level = sensor reading − offset (inches, shown with + / −)
                </p>
              </div>
            </div>
            <div className="map-stack" style={{ marginTop: '0.75rem' }}>
              <label className="map-row">
                <span className="map-label">Depth offset (in)</span>
                <DeferredNumberInput
                  step="0.1"
                  value={poolMap.depthOffset ?? 0}
                  onCommit={setPoolDepthOffset}
                />
              </label>
            </div>
            <p className="settings-copy" style={{ marginTop: '0.75rem' }}>
              Offsets sync via <code>pool-map.json</code> on Home Assistant (local and remote share the
              same file). One-time HA setup: copy snippets from{' '}
              <code>config/dashboard_snippets/README.md</code> into <code>configuration.yaml</code>,{' '}
              <code>scripts.yaml</code>, and <code>automations.yaml</code>, then reload YAML.
            </p>
          </section>

          <section className="widget settings-card">
            <div className="floor-header">
              <div>
                <p className="widget-kicker">Pond</p>
                <h2 className="widget-title">Water level offset</h2>
                <p className="widget-meta">
                  Water level = sensor reading − offset (inches, shown with + / −)
                </p>
              </div>
            </div>
            <div className="map-stack" style={{ marginTop: '0.75rem' }}>
              <label className="map-row">
                <span className="map-label">Water level offset (in)</span>
                <DeferredNumberInput
                  step="0.1"
                  value={pondMap.depthOffset ?? 0}
                  onCommit={setPondDepthOffset}
                />
              </label>
            </div>
            <p className="settings-copy" style={{ marginTop: '0.75rem' }}>
              Same shared <code>pond-map.json</code> setup as pool — see{' '}
              <code>config/dashboard_snippets/README.md</code> on Home Assistant.
            </p>
          </section>

          <section className="widget settings-card">
            <div className="floor-header">
              <div>
                <p className="widget-kicker">Solar</p>
                <h2 className="widget-title">Sensor mapping</h2>
                <p className="widget-meta">
                  Map AlsoEnergy PowerTrack (PV array) sensors. The shed inverter is read directly.
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
                  <h4 className="group-title">PV Solar (AlsoEnergy PowerTrack)</h4>
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
                      <span className="map-label">This month</span>
                      <select
                        value={energyMap.pvOnlyMonthEnergy ?? ''}
                        onChange={(e) => setEnergyMapping('pvOnlyMonthEnergy', e.target.value || null)}
                      >
                        <option value="">Not mapped</option>
                        {pvMonthOptions.length === 0 ? (
                          <option value="" disabled>
                            No energy sensors — add AlsoEnergy integration and restart HA
                          </option>
                        ) : null}
                        {pvMonthOptions.map((sensor) => (
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
                      <span className="map-label">Lifetime</span>
                      <select
                        value={energyMap.pvOnlyLifetimeEnergy ?? ''}
                        onChange={(e) =>
                          setEnergyMapping('pvOnlyLifetimeEnergy', e.target.value || null)
                        }
                      >
                        <option value="">Not mapped</option>
                        {pvLifetimeOptions.length === 0 ? (
                          <option value="" disabled>
                            No energy sensors — add AlsoEnergy integration and restart HA
                          </option>
                        ) : null}
                        {pvLifetimeOptions.map((sensor) => (
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
            <p className="widget-kicker">Outside</p>
            <h2 className="widget-title">Custom buttons</h2>
            <p className="settings-copy">
              Buttons appear on the Outside panel. Pressing one runs its actions and swaps to a red
              Active button. Pressing Active optionally restores affected entities, then runs the
              Active actions and returns to the named button.
            </p>
            <div className="map-stack" style={{ marginTop: '0.75rem' }}>
              {outsideButtons.map((button) => (
                <div key={button.id} className="outside-settings-button-card">
                  <div className="map-row">
                    <span className="map-label">Name</span>
                    <input
                      type="text"
                      key={`${button.id}-name`}
                      defaultValue={button.name}
                      maxLength={64}
                      disabled={readOnly || connectionStatus !== 'connected'}
                      onBlur={(e) => {
                        const name = e.target.value.trim()
                        if (!name) {
                          e.target.value = button.name
                          return
                        }
                        if (name === button.name) return
                        setOutsideButtons(
                          outsideButtons.map((item) =>
                            item.id === button.id ? { ...item, name } : item,
                          ),
                        )
                      }}
                      placeholder="Button name"
                    />
                    <button
                      type="button"
                      className="btn btn--compact"
                      disabled={readOnly || connectionStatus !== 'connected'}
                      onClick={() =>
                        setOutsideButtons(outsideButtons.filter((item) => item.id !== button.id))
                      }
                    >
                      Remove button
                    </button>
                  </div>
                  <div className="map-row">
                    <span className="map-label">Active name</span>
                    <input
                      type="text"
                      key={`${button.id}-active-name`}
                      defaultValue={button.activeName}
                      maxLength={64}
                      disabled={readOnly || connectionStatus !== 'connected'}
                      onBlur={(e) => {
                        const activeName = e.target.value.trim() || 'Active'
                        e.target.value = activeName
                        if (activeName === button.activeName) return
                        setOutsideButtons(
                          outsideButtons.map((item) =>
                            item.id === button.id ? { ...item, activeName } : item,
                          ),
                        )
                      }}
                      placeholder="Active"
                    />
                  </div>
                  <div className="map-row" style={{ alignItems: 'flex-start' }}>
                    <span className="map-label">Actions</span>
                    <div className="action-rule-list">
                      {button.actions.map((action, index) => (
                        <div key={`${button.id}-action-${index}`} className="action-rule-row">
                          <span className="action-picker-trigger-label">
                            {formatDashboardActionLabel(action)}
                          </span>
                          <button
                            type="button"
                            className="btn btn--compact"
                            disabled={readOnly || connectionStatus !== 'connected'}
                            onClick={() =>
                              setOutsideButtons(
                                outsideButtons.map((item) =>
                                  item.id === button.id
                                    ? {
                                        ...item,
                                        actions: item.actions.filter((_, i) => i !== index),
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn--compact"
                        disabled={readOnly || connectionStatus !== 'connected'}
                        onClick={() =>
                          setOutsideActionPicker({ buttonId: button.id, target: 'actions' })
                        }
                      >
                        Add action…
                      </button>
                    </div>
                  </div>
                  <label className="map-row outside-settings-restore-row">
                    <span className="map-label">Restore</span>
                    <span className="outside-settings-restore-control">
                      <input
                        type="checkbox"
                        checked={button.restore}
                        disabled={readOnly || connectionStatus !== 'connected'}
                        onChange={(e) =>
                          setOutsideButtons(
                            outsideButtons.map((item) =>
                              item.id === button.id
                                ? { ...item, restore: e.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      <span>restore entities changed by Actions above</span>
                    </span>
                  </label>
                  <div className="map-row" style={{ alignItems: 'flex-start' }}>
                    <span className="map-label">Active actions</span>
                    <div className="action-rule-list">
                      {button.activeActions.map((action, index) => (
                        <div
                          key={`${button.id}-active-action-${index}`}
                          className="action-rule-row"
                        >
                          <span className="action-picker-trigger-label">
                            {formatDashboardActionLabel(action)}
                          </span>
                          <button
                            type="button"
                            className="btn btn--compact"
                            disabled={readOnly || connectionStatus !== 'connected'}
                            onClick={() =>
                              setOutsideButtons(
                                outsideButtons.map((item) =>
                                  item.id === button.id
                                    ? {
                                        ...item,
                                        activeActions: item.activeActions.filter(
                                          (_, i) => i !== index,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn--compact"
                        disabled={readOnly || connectionStatus !== 'connected'}
                        onClick={() =>
                          setOutsideActionPicker({
                            buttonId: button.id,
                            target: 'activeActions',
                          })
                        }
                      >
                        Add Active action…
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="btn btn--compact"
                disabled={readOnly || connectionStatus !== 'connected'}
                onClick={() => {
                  const next: OutsideCustomButton = {
                    id: newOutsideButtonId(),
                    name: `Button ${outsideButtons.length + 1}`,
                    activeName: 'Active',
                    actions: [],
                    restore: false,
                    activeActions: [],
                  }
                  setOutsideButtons([...outsideButtons, next])
                }}
              >
                Add button…
              </button>
            </div>
            <DashboardActionPicker
              open={outsideActionPicker != null}
              catalog={actionCatalog}
              value={null}
              disabled={readOnly || connectionStatus !== 'connected'}
              title={
                outsideActionPicker?.target === 'activeActions'
                  ? 'Add Active button action'
                  : 'Add Outside button action'
              }
              onClose={() => setOutsideActionPicker(null)}
              onSelect={(action: DashboardActionSelection | null) => {
                const picker = outsideActionPicker
                if (!action || !picker) return
                setOutsideButtons(
                  outsideButtons.map((item) => {
                    if (item.id !== picker.buttonId) return item
                    if (picker.target === 'activeActions') {
                      return { ...item, activeActions: [...item.activeActions, action] }
                    }
                    return { ...item, actions: [...item.actions, action] }
                  }),
                )
              }}
            />
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
        </>
      ) : null}

      {settingsTab === 'automation' ? (
        <>
          <section className="widget settings-card">
            <div className="floor-header">
              <div>
                <p className="widget-kicker">Crestron</p>
                <h2 className="widget-title">Controller auto power-cycle</h2>
                <p className="widget-meta">
                  When every Crestron light is unavailable for the set time, turns the
                  controller's power outlet off for 10 seconds and back on. Retries at most
                  every 30 minutes.
                </p>
              </div>
            </div>
            {crestronPower.cycleEnabled == null && connectionStatus === 'connected' ? (
              <p className="widget-meta">
                Waiting for the Crestron power helpers in Home Assistant.
              </p>
            ) : null}
            <label className="trends-toggle" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                checked={crestronPower.cycleEnabled === true}
                disabled={
                  readOnly || connectionStatus !== 'connected' || crestronPower.cycleEnabled == null
                }
                onChange={(e) => void setCrestronPowerCycleEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label" style={{ gap: '0.45rem' }}>
                Power-cycle the Crestron controller after it is offline for
                <DeferredNumberInput
                  min={1}
                  max={240}
                  step={1}
                  value={crestronPower.cycleMinutes}
                  disabled={
                    readOnly ||
                    connectionStatus !== 'connected' ||
                    crestronPower.cycleEnabled !== true
                  }
                  onCommit={(minutes) => void setCrestronPowerCycleMinutes(minutes)}
                  style={{ width: '4.5rem' }}
                  aria-label="Minutes offline before power-cycling the Crestron controller"
                />
                minutes
              </span>
            </label>
          </section>

          <section className="widget settings-card">
            <div className="floor-header">
              <div>
                <p className="widget-kicker">Bathroom fans</p>
                <h2 className="widget-title">Automatic fan shutoff</h2>
                <p className="widget-meta">
                  Turns off mapped bathroom fans after they stay on too long
                </p>
              </div>
            </div>
            <label className="trends-toggle" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                checked={bathroomFanAutoOffEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setBathroomFanAutoOffEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label" style={{ gap: '0.45rem' }}>
                Turn off bathroom fans after
                <DeferredNumberInput
                  min={1}
                  max={1440}
                  step={1}
                  value={bathroomFanAutoOffMinutes}
                  disabled={
                    readOnly || connectionStatus !== 'connected' || !bathroomFanAutoOffEnabled
                  }
                  onCommit={setBathroomFanAutoOffMinutes}
                  style={{ width: '4.5rem' }}
                  aria-label="Minutes before bathroom fan auto-off"
                />
                minutes
              </span>
            </label>
            <div className="map-stack" style={{ marginTop: '0.75rem' }}>
              {Array.from({ length: BATHROOM_FAN_SLOT_COUNT }, (_, index) => {
                const selected = bathroomFanSlots[index] ?? ''
                const usedElsewhere = new Set(
                  bathroomFanSlots.filter((id, i) => id && i !== index),
                )
                const fanOptions = crestronLights.filter((light) => {
                  if (light.entityId === selected) return true
                  if (light.domain === 'fan') return true
                  const haystack = `${light.entityId} ${light.name}`.toLowerCase()
                  return haystack.includes('fan')
                })
                return (
                  <label key={`bathroom-fan-slot-${index}`} className="map-row">
                    <span className="map-label">Fan {index + 1}</span>
                    <select
                      value={selected}
                      disabled={readOnly || connectionStatus !== 'connected'}
                      onChange={(e) => setBathroomFanSlot(index, e.target.value)}
                    >
                      <option value="">Not mapped</option>
                      {fanOptions.map((light) => {
                        const taken = usedElsewhere.has(light.entityId)
                        return (
                          <option
                            key={light.entityId}
                            value={light.entityId}
                            disabled={taken}
                          >
                            {light.name}
                            {taken ? ' (used)' : ''}
                          </option>
                        )
                      })}
                      {selected &&
                      !fanOptions.some((light) => light.entityId === selected) ? (
                        <option value={selected}>{selected} (missing)</option>
                      ) : null}
                    </select>
                  </label>
                )
              })}
            </div>
            <p className="settings-copy" style={{ marginTop: '0.75rem' }}>
              Map up to six Crestron fan entities. Turning a fan off clears its timer; leaving it on
              longer than the minutes above turns it off automatically (checked about once a minute).
            </p>
          </section>

          <section className="widget settings-card">
            <div className="floor-header">
              <div>
                <p className="widget-kicker">Pond</p>
                <h2 className="widget-title">Automatic fill</h2>
                <p className="widget-meta">
                  Opens Pond fill when water is low and closes it when full
                </p>
              </div>
            </div>
            {pond.fillError ? (
              <div className="pond-fill-error" role="alert">
                <span>
                  Fill error: the level didn&apos;t rise or the valve didn&apos;t open, so the valve
                  was closed and automatic fill is paused. See the Control log for details.
                </span>
                <button
                  type="button"
                  className="btn btn--compact"
                  disabled={readOnly || connectionStatus !== 'connected'}
                  onClick={() => void clearPondFillError()}
                >
                  Clear error
                </button>
              </div>
            ) : null}
            <label className="trends-toggle" style={{ marginTop: '0.75rem' }}>
              <input
                type="checkbox"
                checked={pondFillAutoEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setPondFillAutoEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label">Automatic pond fill</span>
            </label>
            <div className="map-stack" style={{ marginTop: '0.75rem' }}>
              <label className="map-row">
                <span className="map-label">Open below (in)</span>
                <DeferredNumberInput
                  min={-50}
                  max={50}
                  step={0.1}
                  value={pondFillLowInches}
                  disabled={readOnly || connectionStatus !== 'connected' || !pondFillAutoEnabled}
                  onCommit={setPondFillLowInches}
                />
              </label>
              <label className="map-row">
                <span className="map-label">Close above (in)</span>
                <DeferredNumberInput
                  min={-50}
                  max={50}
                  step={0.1}
                  value={pondFillFullInches}
                  disabled={readOnly || connectionStatus !== 'connected' || !pondFillAutoEnabled}
                  onCommit={setPondFillFullInches}
                />
              </label>
            </div>
            <p className="settings-copy" style={{ marginTop: '0.75rem' }}>
              Uses the adjusted Pond water level (sensor minus the Pond depth offset). Opens the
              Pond fill valve only when the last 5 readings agree (within 0.45 in) and are below
              the low setpoint, so brief bad readings are ignored. Each fill runs at least 5
              minutes and closes once the level reaches the full setpoint. If the level
              doesn&apos;t rise at least 0.3 in over any 15 minutes of filling (or a fill runs 4
              hours), or the valve won&apos;t open, the valve closes, the error is logged and
              notified, and automatic fill pauses until cleared. The valve&apos;s built-in
              10-minute shutoff is handled by reopening it; any other shutoff during a fill is
              logged and notified. Fills started by hand are left alone.
            </p>
          </section>

          <section className="widget settings-card">
            <div className="floor-header">
              <div>
                <p className="widget-kicker">Pool</p>
                <h2 className="widget-title">Automatic pump</h2>
                <p className="widget-meta">
                  Turns on the Pool circuit if pump RPM stays at zero
                </p>
              </div>
            </div>
            <label className="trends-toggle" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                checked={poolPumpAutoOnEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setPoolPumpAutoOnEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label" style={{ gap: '0.45rem' }}>
                Turn on pool pump if off for more than
                <DeferredNumberInput
                  min={1}
                  max={1440}
                  step={1}
                  value={poolPumpAutoOnMinutes}
                  disabled={readOnly || connectionStatus !== 'connected' || !poolPumpAutoOnEnabled}
                  onCommit={setPoolPumpAutoOnMinutes}
                  style={{ width: '4.5rem' }}
                  aria-label="Minutes before auto turn-on"
                />
                minutes
              </span>
            </label>
            <p className="settings-copy" style={{ marginTop: '0.75rem' }}>
              Uses the ScreenLogic Pool circuit switch. Disabled by default so seasonal shutdowns are
              not turned back on accidentally.
            </p>
          </section>

          <section className="widget settings-card">
            <div className="floor-header">
              <div>
                <p className="widget-kicker">Driveway</p>
                <h2 className="widget-title">Alarm sensor</h2>
                <p className="widget-meta">
                  Input edges always light the icon and write the control log; conditions only gate
                  trigger actions
                </p>
              </div>
            </div>
            <label className="trends-toggle" style={{ marginTop: '0.75rem' }}>
              <input
                type="checkbox"
                checked={drivewayAlarmEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setDrivewayAlarmEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label">Enable driveway alarm</span>
            </label>
            <div className="map-stack" style={{ marginTop: '0.75rem' }}>
              <label className="map-row">
                <span className="map-label">Trigger when input is</span>
                <select
                  value={drivewayAlarmTrigger}
                  disabled={
                    readOnly || connectionStatus !== 'connected' || !drivewayAlarmEnabled
                  }
                  onChange={(e) =>
                    setDrivewayAlarmTrigger(e.target.value === 'off' ? 'off' : 'on')
                  }
                  aria-label="Driveway alarm trigger state"
                >
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label className="map-row">
                <span className="map-label">Icon reset after (seconds)</span>
                <DeferredNumberInput
                  min={1}
                  max={86400}
                  step={1}
                  value={drivewayAlarmResetSeconds}
                  disabled={
                    readOnly || connectionStatus !== 'connected' || !drivewayAlarmEnabled
                  }
                  onCommit={setDrivewayAlarmResetSeconds}
                  aria-label="Driveway alarm icon reset seconds"
                />
              </label>

              <div className="map-row" style={{ alignItems: 'flex-start' }}>
                <span className="map-label">Conditions</span>
                <div className="action-rule-list">
                  {drivewayAlarmConditions.map((row, index) => (
                    <div key={row.id} className="action-rule-row">
                      {index > 0 ? (
                        <select
                          value={row.join}
                          disabled={
                            readOnly ||
                            connectionStatus !== 'connected' ||
                            !drivewayAlarmEnabled
                          }
                          onChange={(e) => {
                            const join = e.target.value === 'or' ? 'or' : 'and'
                            setDrivewayAlarmConditions(
                              drivewayAlarmConditions.map((item) =>
                                item.id === row.id ? { ...item, join } : item,
                              ),
                            )
                          }}
                          aria-label="Condition logic"
                        >
                          <option value="and">And</option>
                          <option value="or">Or</option>
                        </select>
                      ) : (
                        <span className="map-label" style={{ minWidth: '4.5rem' }}>
                          If
                        </span>
                      )}
                      <span className="action-picker-trigger-label">
                        {formatDashboardConditionLabel(row.condition)}
                      </span>
                      <button
                        type="button"
                        className="btn btn--compact"
                        disabled={
                          readOnly ||
                          connectionStatus !== 'connected' ||
                          !drivewayAlarmEnabled
                        }
                        onClick={() =>
                          setDrivewayAlarmConditions(
                            drivewayAlarmConditions.filter((item) => item.id !== row.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn--compact"
                    disabled={
                      readOnly || connectionStatus !== 'connected' || !drivewayAlarmEnabled
                    }
                    onClick={() => setConditionPickerOpen(true)}
                  >
                    Add condition…
                  </button>
                </div>
              </div>

              <div className="map-row" style={{ alignItems: 'flex-start' }}>
                <span className="map-label">Actions when triggered</span>
                <div className="action-rule-list">
                  {drivewayAlarmActions.map((action, index) => (
                    <div key={`trigger-action-${index}`} className="action-rule-row">
                      <span className="action-picker-trigger-label">
                        {formatDashboardActionLabel(action)}
                      </span>
                      <button
                        type="button"
                        className="btn btn--compact"
                        disabled={
                          readOnly ||
                          connectionStatus !== 'connected' ||
                          !drivewayAlarmEnabled
                        }
                        onClick={() =>
                          setDrivewayAlarmActions(
                            drivewayAlarmActions.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn--compact"
                    disabled={
                      readOnly || connectionStatus !== 'connected' || !drivewayAlarmEnabled
                    }
                    onClick={() => setActionPickerOpen(true)}
                  >
                    Add action…
                  </button>
                </div>
              </div>

              <label className="map-row outside-settings-restore-row">
                <span className="map-label">Restore</span>
                <span className="outside-settings-restore-control">
                  <input
                    type="checkbox"
                    checked={drivewayAlarmRestore}
                    disabled={
                      readOnly || connectionStatus !== 'connected' || !drivewayAlarmEnabled
                    }
                    onChange={(e) => setDrivewayAlarmRestore(e.target.checked)}
                  />
                  <span>restore entities changed by Actions above</span>
                </span>
              </label>

              <div className="map-row" style={{ alignItems: 'flex-start' }}>
                <span className="map-label">Actions when icon resets</span>
                <div className="action-rule-list">
                  {drivewayAlarmResetActions.map((action, index) => (
                    <div key={`reset-action-${index}`} className="action-rule-row">
                      <span className="action-picker-trigger-label">
                        {formatDashboardActionLabel(action)}
                      </span>
                      <button
                        type="button"
                        className="btn btn--compact"
                        disabled={
                          readOnly ||
                          connectionStatus !== 'connected' ||
                          !drivewayAlarmEnabled
                        }
                        onClick={() =>
                          setDrivewayAlarmResetActions(
                            drivewayAlarmResetActions.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn--compact"
                    disabled={
                      readOnly || connectionStatus !== 'connected' || !drivewayAlarmEnabled
                    }
                    onClick={() => setResetActionPickerOpen(true)}
                  >
                    Add reset action…
                  </button>
                </div>
              </div>
            </div>
            <p className="settings-copy" style={{ marginTop: '0.75rem' }}>
              Uses <code>binary_sensor.outside_gate_i_o_input_0</code>. Every matching input change
              lights the driveway icon, restarts the reset timer, and writes the control log.
              Dashboard audio for this alert is under Notification. Conditions only gate whether
              trigger actions and email/phone alerts run (left-to-right And/Or). When Restore is
              enabled, icon reset puts affected entities (including dimmable light levels) back to
              their pre-trigger state before running reset actions. Click the icon when idle to run
              the trigger path; click when red to run restore (if enabled) and icon-reset actions.
            </p>
            <DashboardActionPicker
              open={actionPickerOpen}
              catalog={actionCatalog}
              value={null}
              disabled={readOnly || connectionStatus !== 'connected'}
              title="Add trigger action"
              onClose={() => setActionPickerOpen(false)}
              onSelect={(action: DashboardActionSelection | null) => {
                if (action) setDrivewayAlarmActions([...drivewayAlarmActions, action])
              }}
            />
            <DashboardActionPicker
              open={resetActionPickerOpen}
              catalog={actionCatalog}
              value={null}
              disabled={readOnly || connectionStatus !== 'connected'}
              title="Add icon-reset action"
              onClose={() => setResetActionPickerOpen(false)}
              onSelect={(action: DashboardActionSelection | null) => {
                if (action) setDrivewayAlarmResetActions([...drivewayAlarmResetActions, action])
              }}
            />
            <DashboardConditionPicker
              open={conditionPickerOpen}
              catalog={conditionCatalog}
              disabled={readOnly || connectionStatus !== 'connected'}
              title="Add condition"
              onClose={() => setConditionPickerOpen(false)}
              onSelect={(condition: DashboardCondition) => {
                const row: DrivewayAlarmConditionRow = {
                  id: newConditionRowId(),
                  join: 'and' as ConditionLogic,
                  condition,
                }
                setDrivewayAlarmConditions([...drivewayAlarmConditions, row])
              }}
            />
          </section>
        </>
      ) : null}

      {settingsTab === 'notification' ? (
        <section className="widget settings-card">
          <p className="widget-kicker">Alerts</p>
          <h2 className="widget-title">Notifications</h2>
          <p className="settings-copy">
            Choose which conditions to watch, then enable email and/or phone for those alerts.
            Phone uses the Home Assistant Companion app.
          </p>
          <div className="trends-toggles" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label className="trends-toggle">
              <input
                type="checkbox"
                checked={poolPumpOffEmailEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setPoolPumpOffEmailEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label">Pool pump stopped</span>
            </label>
            <div className="notify-device-comm">
              <div className="notify-device-comm-row">
                <label className="trends-toggle" style={{ flexWrap: 'wrap', flex: '1 1 auto' }}>
                  <input
                    type="checkbox"
                    checked={deviceCommFailureEmailEnabled}
                    disabled={readOnly || connectionStatus !== 'connected'}
                    onChange={(e) => setDeviceCommFailureEmailEnabled(e.target.checked)}
                  />
                  <span className="trends-toggle-label">Device communication failure</span>
                  <span className="trends-toggle-label" style={{ opacity: 0.85, gap: '0.45rem' }}>
                    Notify after
                    <DeferredNumberInput
                      min={1}
                      max={1440}
                      step={1}
                      value={deviceCommFailureMinutes}
                      disabled={
                        readOnly ||
                        connectionStatus !== 'connected' ||
                        !deviceCommFailureEmailEnabled
                      }
                      onCommit={setDeviceCommFailureMinutes}
                      style={{ width: '4.5rem' }}
                      aria-label="Minutes before communication failure notification"
                    />
                    minutes
                  </span>
                </label>
                <button
                  type="button"
                  className="btn btn--compact"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams)
                    next.set('tab', 'communication')
                    next.set('comm', '1')
                    setSearchParams(next, { replace: true })
                  }}
                >
                  Per-device notify…
                </button>
              </div>
            </div>
            <label className="trends-toggle">
              <input
                type="checkbox"
                checked={commandFailedEmailEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setCommandFailedEmailEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label">Command failed to execute</span>
            </label>
            <label className="trends-toggle" style={{ flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                checked={internetOutageEmailEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setInternetOutageEmailEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label" style={{ gap: '0.45rem' }}>
                Internet outage
                <span style={{ opacity: 0.85 }}>
                  {internetOnline === true
                    ? '(online)'
                    : internetOnline === false
                      ? '(down)'
                      : '(sensor pending)'}
                </span>
                Notify after
                <DeferredNumberInput
                  min={1}
                  max={1440}
                  step={1}
                  value={internetOutageMinutes}
                  disabled={
                    readOnly ||
                    connectionStatus !== 'connected' ||
                    !internetOutageEmailEnabled
                  }
                  onCommit={setInternetOutageMinutes}
                  style={{ width: '4.5rem' }}
                  aria-label="Minutes before internet outage notification"
                />
                minutes
              </span>
            </label>
            <label className="trends-toggle" style={{ flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                checked={poolLowWaterEmailEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setPoolLowWaterEmailEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label" style={{ gap: '0.45rem' }}>
                Pool water level less than
                <DeferredNumberInput
                  step={0.1}
                  value={poolLowWaterInches}
                  disabled={readOnly || connectionStatus !== 'connected' || !poolLowWaterEmailEnabled}
                  onCommit={setPoolLowWaterInches}
                  style={{ width: '4.5rem' }}
                  aria-label="Pool low water inches"
                />
                inches
              </span>
            </label>
            <label className="trends-toggle" style={{ flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                checked={pondLowWaterEmailEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setPondLowWaterEmailEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label" style={{ gap: '0.45rem' }}>
                Pond water level less than
                <DeferredNumberInput
                  step={0.1}
                  value={pondLowWaterInches}
                  disabled={readOnly || connectionStatus !== 'connected' || !pondLowWaterEmailEnabled}
                  onCommit={setPondLowWaterInches}
                  style={{ width: '4.5rem' }}
                  aria-label="Pond low water inches"
                />
                inches
              </span>
            </label>
            <label className="trends-toggle" style={{ flexWrap: 'wrap' }}>
              <input
                type="checkbox"
                checked={cisternLowWaterEmailEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setCisternLowWaterEmailEnabled(e.target.checked)}
              />
              <span className="trends-toggle-label" style={{ gap: '0.45rem' }}>
                Cistern water level less than
                <DeferredNumberInput
                  min={0}
                  max={100}
                  step={1}
                  value={cisternLowWaterPercent}
                  disabled={
                    readOnly || connectionStatus !== 'connected' || !cisternLowWaterEmailEnabled
                  }
                  onCommit={setCisternLowWaterPercent}
                  style={{ width: '4.5rem' }}
                  aria-label="Cistern low water percent"
                />
                %
              </span>
            </label>
            <div className="notify-alert-groups">
              <div className="notify-alert-group">
                <h3 className="notify-alert-group-title">Gate doorbell</h3>
                <label className="trends-toggle" style={{ flexWrap: 'wrap' }}>
                  <input
                    type="checkbox"
                    checked={doorbellEmailEnabled}
                    disabled={readOnly || connectionStatus !== 'connected'}
                    onChange={(e) => setDoorbellEmailEnabled(e.target.checked)}
                  />
                  <span className="trends-toggle-label">Email / phone alert</span>
                </label>
                <label className="trends-toggle" style={{ flexWrap: 'wrap' }}>
                  <span className="trends-toggle-label" style={{ opacity: 0.85, gap: '0.45rem' }}>
                    Show icon for
                    <DeferredNumberInput
                      min={1}
                      max={1440}
                      step={1}
                      value={doorbellIconMinutes}
                      disabled={readOnly || connectionStatus !== 'connected'}
                      onCommit={setDoorbellIconMinutes}
                      style={{ width: '4.5rem' }}
                      aria-label="Minutes to show doorbell icon"
                    />
                    minutes after press
                  </span>
                </label>
                <label className="trends-toggle">
                  <input
                    type="checkbox"
                    checked={doorbellAudioEnabled}
                    disabled={readOnly || connectionStatus !== 'connected'}
                    onChange={(e) => setDoorbellAudioEnabled(e.target.checked)}
                  />
                  <span className="trends-toggle-label">Audio on this dashboard</span>
                </label>
                <label className="map-row">
                  <span className="map-label">Sound</span>
                  <div
                    style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
                  >
                    <select
                      value={doorbellAudio}
                      disabled={
                        readOnly || connectionStatus !== 'connected' || !doorbellAudioEnabled
                      }
                      onChange={(e) => setDoorbellAudio(e.target.value)}
                      aria-label="Gate doorbell dashboard sound"
                    >
                      {DASHBOARD_SOUND_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--compact"
                      disabled={readOnly || !doorbellAudioEnabled}
                      onClick={() => void playDashboardSound(doorbellAudio)}
                    >
                      Test
                    </button>
                  </div>
                </label>
                <p className="settings-copy" style={{ fontSize: '0.82rem' }}>
                  Uses DoorBird event <code>event.doorstation_1ccae375bf98_doorbell</code>. If that
                  stays Unknown in HA, enable the doorbell HTTP schedule in the DoorBird app.
                </p>
              </div>

              <div className="notify-alert-group">
                <h3 className="notify-alert-group-title">Driveway alarm sensor</h3>
                <label className="trends-toggle">
                  <input
                    type="checkbox"
                    checked={drivewayAlarmEmailEnabled}
                    disabled={readOnly || connectionStatus !== 'connected'}
                    onChange={(e) => setDrivewayAlarmEmailEnabled(e.target.checked)}
                  />
                  <span className="trends-toggle-label">Email / phone alert</span>
                </label>
                <label className="trends-toggle">
                  <input
                    type="checkbox"
                    checked={drivewayAlarmAudioEnabled}
                    disabled={readOnly || connectionStatus !== 'connected'}
                    onChange={(e) => setDrivewayAlarmAudioEnabled(e.target.checked)}
                  />
                  <span className="trends-toggle-label">Audio on this dashboard</span>
                </label>
                <label className="map-row">
                  <span className="map-label">Sound</span>
                  <div
                    style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
                  >
                    <select
                      value={drivewayAlarmAudio}
                      disabled={
                        readOnly ||
                        connectionStatus !== 'connected' ||
                        !drivewayAlarmAudioEnabled
                      }
                      onChange={(e) => setDrivewayAlarmAudio(e.target.value)}
                      aria-label="Driveway alarm dashboard sound"
                    >
                      {DASHBOARD_SOUND_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--compact"
                      disabled={readOnly || !drivewayAlarmAudioEnabled}
                      onClick={() => void playDashboardSound(drivewayAlarmAudio)}
                    >
                      Test
                    </button>
                  </div>
                </label>
                <p className="settings-copy" style={{ fontSize: '0.82rem' }}>
                  Email/phone follow trigger actions (conditions apply). Dashboard audio and the
                  control log fire on every matching sensor edge. Tap the page once if the browser
                  blocks autoplay.
                </p>
              </div>
            </div>
          </div>

          <div
            className="trends-toggles"
            style={{ flexDirection: 'column', alignItems: 'stretch', marginTop: '1.25rem' }}
          >
            <label className="trends-toggle" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={notifyEmailEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setNotifyEmailEnabled(e.target.checked)}
                aria-label="Enable email notifications"
              />
              <span className="trends-toggle-label">Email</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="Uses HA default when blank"
                value={notifyEmailDraft}
                disabled={readOnly || connectionStatus !== 'connected' || !notifyEmailEnabled}
                onChange={(e) => setNotifyEmailDraft(e.target.value)}
                onBlur={() => {
                  const next = notifyEmailDraft.trim()
                  setNotifyEmailDraft(next)
                  if (next !== notifyEmailOverride) setNotifyEmailOverride(next)
                }}
                style={{ flex: '1 1 12rem', minWidth: '10rem' }}
                aria-label="Email address"
              />
            </label>
            <label className="trends-toggle" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={notifyPhoneEnabled}
                disabled={readOnly || connectionStatus !== 'connected'}
                onChange={(e) => setNotifyPhoneEnabled(e.target.checked)}
                aria-label="Enable phone text notifications"
              />
              <span className="trends-toggle-label">Phone</span>
              <select
                value={notifyPhoneTarget}
                disabled={readOnly || connectionStatus !== 'connected' || !notifyPhoneEnabled}
                onChange={(e) => setNotifyPhoneTarget(e.target.value)}
                style={{ flex: '1 1 12rem', minWidth: '10rem' }}
                aria-label="Phone notify target"
              >
                {PHONE_NOTIFY_TARGETS.map((target) => (
                  <option key={target.entityId} value={target.entityId}>
                    {target.label}
                  </option>
                ))}
                {!PHONE_NOTIFY_TARGETS.some((t) => t.entityId === notifyPhoneTarget) &&
                notifyPhoneTarget ? (
                  <option value={notifyPhoneTarget}>{notifyPhoneTarget}</option>
                ) : null}
              </select>
            </label>
          </div>

          <div className="reminder-settings">
            <h3 className="reminder-settings-title">Reminders</h3>
            <p className="settings-copy" style={{ marginTop: 0 }}>
              Calendar buttons appear when a reminder is enabled and active. Reset time turns Active
              back on each day. State is shared across all dashboards and survives Home Assistant
              restarts.
            </p>
            {reminders.map((reminder) => (
              <div key={reminder.id} className="reminder-settings-card">
                <div className="reminder-settings-heading">Reminder {reminder.id}</div>
                <label className="trends-toggle">
                  <input
                    type="checkbox"
                    checked={reminder.enabled}
                    disabled={readOnly || connectionStatus !== 'connected'}
                    onChange={(e) => updateReminder(reminder.id, { enabled: e.target.checked })}
                  />
                  <span className="trends-toggle-label">Enable</span>
                </label>
                <label className="reminder-settings-field">
                  <span>Reset time</span>
                  <input
                    type="time"
                    value={timeInputValue(reminder.resetTime)}
                    disabled={
                      readOnly || connectionStatus !== 'connected' || !reminder.enabled
                    }
                    onChange={(e) =>
                      updateReminder(reminder.id, {
                        resetTime: timeFromInputValue(e.target.value),
                      })
                    }
                    aria-label={`Reminder ${reminder.id} reset time`}
                  />
                </label>
                <label className="reminder-settings-field">
                  <span>Message</span>
                  <input
                    type="text"
                    maxLength={64}
                    value={reminder.message}
                    disabled={
                      readOnly || connectionStatus !== 'connected' || !reminder.enabled
                    }
                    onChange={(e) => updateReminder(reminder.id, { message: e.target.value })}
                    aria-label={`Reminder ${reminder.id} message`}
                  />
                </label>
                <label className="trends-toggle">
                  <input
                    type="checkbox"
                    checked={reminder.active}
                    disabled={
                      readOnly || connectionStatus !== 'connected' || !reminder.enabled
                    }
                    onChange={(e) => updateReminder(reminder.id, { active: e.target.checked })}
                  />
                  <span className="trends-toggle-label">Active</span>
                </label>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {settingsTab === 'activity' ? <ControlLogPanel embedded kind="activity" /> : null}
      {settingsTab === 'communication' ? (
        <ControlLogPanel embedded kind="communication" openCommStatus={openCommFromQuery} />
      ) : null}
    </main>
  )
}
