import { formatDataAge } from './energy'
import type { HaState } from './positions'
import type { PvCacheSnapshot } from './pvCache'
import type { ShedCacheSnapshot } from './shedCache'
import type { ShadesCacheSnapshot } from './shadesCache'
import {
  MAIN_GARAGE,
  WORKSHOP_GARAGE,
  type GarageDoorSnapshot,
} from './garage'
import { GATE_CLOSED_SENSOR, GATE_RELAY_BUTTON, type GateSnapshot } from './gate'
import {
  PENTAIR_POOL_CIRCUIT_SWITCH,
  PENTAIR_POOL_PUMP_RPM_ENTITY,
  PENTAIR_SPA_HEAT_ENTITY,
  type PoolEntityMap,
} from './pool'
import { CISTERN_WATER_LEVEL_ENTITY } from './cistern'
import type { PondEntityMap } from './pond'
import type { EnergyEntityMap } from './storage'
import type { IrrigationSnapshot } from './irrigation'
import type { SonosSnapshot } from './sonos'
import type { ReceiverSnapshot } from './receiver'
import type { HvacSnapshot } from './hvac'
import type { AcSnapshot } from './ac'
import type { OutsideTransformer } from './outside'
import type { WeatherSnapshot } from './weather'
import type { CrestronLight } from './lights'

/** Default freshness window for “Succeeded” in the Last Communication table. */
export const DEFAULT_DEVICE_COMM_STALE_MS = 15 * 60 * 1000

export type DeviceCommFailedSource = {
  label: string
  /** Minutes since this source last looked healthy (at least 1 when failed). */
  ageMin: number
  /** Timestamp when this source last communicated / went bad. */
  sinceMs: number | null
}

export type DeviceCommRow = {
  key: string
  label: string
  /**
   * For failures: when the outage started (same age used vs notify threshold).
   * Null when healthy or not configured.
   */
  lastAttemptAtMs: number | null
  lastAttemptLabel: string
  /** true = ok, false = failed/stale/offline, null = not configured. */
  succeeded: boolean | null
  resultLabel: string
  /** Which child sources are stale when the row failed (multi-source groups). */
  failedSources: DeviceCommFailedSource[]
  /** When true, do not fire the device-communication failure notification. */
  skipFailureAlert: boolean
}

export type DeviceCommSources = {
  states: HaState[]
  energyMap: EnergyEntityMap
  poolMap: PoolEntityMap
  pondMap: PondEntityMap
  energy: {
    shedUpdatedAtMs: number | null
    shedCommunicating: boolean | null
  }
  mainGarage: GarageDoorSnapshot
  workshopGarage: GarageDoorSnapshot
  gate: GateSnapshot
  cisternLevelPercent: number | null
  weather: WeatherSnapshot | null
  irrigation: IrrigationSnapshot
  audio: SonosSnapshot
  receiver: ReceiverSnapshot
  hvac: HvacSnapshot
  ac: AcSnapshot
  outsideTransformers: OutsideTransformer[]
  crestronLights: CrestronLight[]
  shedPowerOn: boolean | null
  pvCache: PvCacheSnapshot | null
  shedCache: ShedCacheSnapshot | null
  shadesCache: ShadesCacheSnapshot | null
  egaugeUpdatedAtMs: number | null
  egaugeHasReading: boolean
  shadeEntityIds: string[]
  now?: number
  staleMs?: number
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

export function stateUpdatedAtMs(state: HaState | undefined | null): number | null {
  if (!state) return null
  const stamp = state.last_updated ?? state.last_changed
  return parseIsoMs(stamp)
}

export function newestStateUpdatedAtMs(
  states: HaState[],
  entityIds: Array<string | null | undefined>,
): number | null {
  let best: number | null = null
  for (const id of entityIds) {
    if (!id) continue
    const state = states.find((entry) => entry.entity_id === id)
    const t = stateUpdatedAtMs(state)
    if (t == null) continue
    if (best == null || t > best) best = t
  }
  return best
}

function ageSucceeded(
  lastAttemptAtMs: number | null,
  unavailable: boolean,
  now: number,
  staleMs: number,
): boolean | null {
  // Freshness is driven by last_updated age (matches notify threshold). Do not
  // treat a single unavailable sibling entity as an instant failure while the
  // group still has a recent update — that caused false Pool/Irrigation emails.
  if (lastAttemptAtMs == null) return unavailable ? false : null
  return now - lastAttemptAtMs <= staleMs
}

function ageMinFromMs(lastAtMs: number | null, now: number, staleMs: number): number {
  if (lastAtMs == null) return Math.max(1, Math.round(staleMs / 60_000))
  return Math.max(1, Math.round((now - lastAtMs) / 60_000))
}

function failedSource(
  label: string,
  sinceMs: number | null,
  now: number,
  staleMs: number,
): DeviceCommFailedSource {
  return {
    label,
    sinceMs,
    ageMin: ageMinFromMs(sinceMs, now, staleMs),
  }
}

function oldestFailureSinceMs(
  failedSources: DeviceCommFailedSource[],
  now: number,
): number | null {
  if (failedSources.length === 0) return null
  let oldest: number | null = null
  for (const source of failedSources) {
    const since =
      source.sinceMs ?? now - Math.max(1, source.ageMin) * 60_000
    if (oldest == null || since < oldest) oldest = since
  }
  return oldest
}

export function formatFailedSourcesLabel(
  failedSources: DeviceCommFailedSource[],
  limit = 8,
): string {
  const labels = [
    ...new Set(failedSources.map((source) => source.label).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  if (labels.length === 0) return ''
  if (labels.length <= limit) return labels.join(', ')
  const extra = labels.length - limit
  return `${labels.slice(0, limit).join(', ')}, +${extra} more`
}

function resultLabel(
  succeeded: boolean | null,
  failedSources: DeviceCommFailedSource[] = [],
  paused = false,
): string {
  if (paused) return 'Paused'
  if (succeeded === true) return 'Succeeded'
  if (succeeded === false) {
    const detail = formatFailedSourcesLabel(failedSources)
    return detail ? `Failed: ${detail}` : 'Failed'
  }
  return 'Unknown'
}

function entityDisplayLabel(
  states: HaState[],
  entityId: string,
  fallback: string,
): string {
  const state = states.find((entry) => entry.entity_id === entityId)
  const friendly = String(state?.attributes?.friendly_name ?? '').trim()
  return friendly || fallback
}

type LabeledSource = {
  id: string
  label: string
}

function uniqueLabeledSources(sources: LabeledSource[]): LabeledSource[] {
  const seen = new Set<string>()
  const out: LabeledSource[] = []
  for (const source of sources) {
    if (!source.id || seen.has(source.id)) continue
    seen.add(source.id)
    out.push(source)
  }
  return out
}

function isUnavailableState(state: HaState | undefined): boolean {
  if (!state) return true
  const raw = String(state.state ?? '').toLowerCase()
  return raw === 'unavailable' || raw === 'unknown' || raw === ''
}

function evaluateLabeledEntitySources(
  states: HaState[],
  sources: LabeledSource[],
  now: number,
  staleMs: number,
  mode: 'freshness' | 'availability' = 'freshness',
): {
  lastAttemptAtMs: number | null
  succeeded: boolean | null
  failedSources: DeviceCommFailedSource[]
} {
  const unique = uniqueLabeledSources(sources)
  if (unique.length === 0) {
    return { lastAttemptAtMs: null, succeeded: null, failedSources: [] }
  }

  let lastAttemptAtMs: number | null = null
  const failedSources: DeviceCommFailedSource[] = []
  let present = 0

  for (const source of unique) {
    const state = states.find((entry) => entry.entity_id === source.id)
    const updatedAt = stateUpdatedAtMs(state)
    if (updatedAt != null && (lastAttemptAtMs == null || updatedAt > lastAttemptAtMs)) {
      lastAttemptAtMs = updatedAt
    }

    if (!state) {
      failedSources.push(failedSource(source.label, null, now, staleMs))
      continue
    }
    present += 1

    if (mode === 'availability') {
      // Sticky entities (gate, switches, covers) often keep an old last_updated
      // while healthy. Only treat missing/unavailable as a failure — and only
      // after they've been in that state long enough (last_updated age).
      if (!isUnavailableState(state)) continue
      if (updatedAt != null && now - updatedAt < staleMs) continue
      failedSources.push(
        failedSource(
          entityDisplayLabel(states, source.id, source.label),
          updatedAt,
          now,
          staleMs,
        ),
      )
      continue
    }

    if (updatedAt == null || now - updatedAt >= staleMs) {
      failedSources.push(
        failedSource(
          entityDisplayLabel(states, source.id, source.label),
          updatedAt,
          now,
          staleMs,
        ),
      )
    }
  }

  if (present === 0 && failedSources.length === unique.length) {
    // Configured ids exist in the map but none are in HA yet.
    return { lastAttemptAtMs: null, succeeded: false, failedSources }
  }
  if (present === 0) {
    return { lastAttemptAtMs: null, succeeded: null, failedSources: [] }
  }

  return {
    lastAttemptAtMs,
    succeeded: failedSources.length === 0,
    failedSources,
  }
}

function evaluateTimestampSources(
  sources: Array<{ label: string; lastAtMs: number | null; configured?: boolean }>,
  now: number,
  staleMs: number,
): {
  lastAttemptAtMs: number | null
  succeeded: boolean | null
  failedSources: DeviceCommFailedSource[]
} {
  const configured = sources.filter((source) => source.configured !== false)
  if (configured.length === 0) {
    return { lastAttemptAtMs: null, succeeded: null, failedSources: [] }
  }

  let lastAttemptAtMs: number | null = null
  const failedSources: DeviceCommFailedSource[] = []
  let anyStamp = false

  for (const source of configured) {
    if (source.lastAtMs != null) {
      anyStamp = true
      if (lastAttemptAtMs == null || source.lastAtMs > lastAttemptAtMs) {
        lastAttemptAtMs = source.lastAtMs
      }
    }
    if (source.lastAtMs == null || now - source.lastAtMs >= staleMs) {
      failedSources.push(failedSource(source.label, source.lastAtMs, now, staleMs))
    }
  }

  if (!anyStamp && failedSources.length === configured.length) {
    return { lastAttemptAtMs: null, succeeded: false, failedSources }
  }

  return {
    lastAttemptAtMs,
    succeeded: failedSources.length === 0 ? true : false,
    failedSources,
  }
}

function row(args: {
  key: string
  label: string
  /** Last healthy / data timestamp — used as failure-start when the row failed. */
  lastAttemptAtMs: number | null
  succeeded: boolean | null
  now: number
  failedSources?: DeviceCommFailedSource[]
  skipFailureAlert?: boolean
  paused?: boolean
  emptyLabel?: string
}): DeviceCommRow {
  const failedSources = args.failedSources ?? []
  const succeeded = args.paused ? true : args.succeeded
  const failureAtMs =
    succeeded === false
      ? oldestFailureSinceMs(failedSources, args.now) ?? args.lastAttemptAtMs
      : null
  return {
    key: args.key,
    label: args.label,
    lastAttemptAtMs: failureAtMs,
    lastAttemptLabel:
      succeeded === false && failureAtMs != null
        ? formatDataAge(failureAtMs, args.now) ?? '—'
        : succeeded === true
          ? '—'
          : (args.emptyLabel ?? 'Not configured'),
    succeeded,
    resultLabel: resultLabel(args.succeeded, failedSources, args.paused),
    failedSources: args.paused ? [] : failedSources,
    skipFailureAlert: args.skipFailureAlert === true || args.paused === true,
  }
}

function haGroupRow(args: {
  key: string
  label: string
  states: HaState[]
  sources: LabeledSource[]
  now: number
  staleMs: number
  mode?: 'freshness' | 'availability'
  emptyLabel?: string
}): DeviceCommRow {
  const evaluated = evaluateLabeledEntitySources(
    args.states,
    args.sources,
    args.now,
    args.staleMs,
    args.mode ?? 'freshness',
  )
  if (evaluated.succeeded == null && evaluated.lastAttemptAtMs == null) {
    return row({
      key: args.key,
      label: args.label,
      lastAttemptAtMs: null,
      succeeded: null,
      now: args.now,
      emptyLabel: args.emptyLabel,
    })
  }
  return row({
    key: args.key,
    label: args.label,
    lastAttemptAtMs: evaluated.lastAttemptAtMs,
    succeeded: evaluated.succeeded,
    failedSources: evaluated.failedSources,
    now: args.now,
    emptyLabel: args.emptyLabel,
  })
}

/** Build Last Communication / failure-alert rows for every polled source. */
export function buildDeviceCommRows(sources: DeviceCommSources): DeviceCommRow[] {
  const now = sources.now ?? Date.now()
  const staleMs = sources.staleMs ?? DEFAULT_DEVICE_COMM_STALE_MS
  const { states } = sources

  const shedCacheMs = parseIsoMs(sources.shedCache?.fetchedAt)
  const shedLast =
    sources.energy.shedUpdatedAtMs == null
      ? shedCacheMs
      : shedCacheMs == null
        ? sources.energy.shedUpdatedAtMs
        : Math.max(sources.energy.shedUpdatedAtMs, shedCacheMs)

  const pvFetched = parseIsoMs(sources.pvCache?.fetchedAt)
  const pvLastUpdate = parseIsoMs(sources.pvCache?.lastUpdate)
  const pvEntityLast = newestStateUpdatedAtMs(states, [
    sources.energyMap.pvOnlyProduction,
    sources.energyMap.pvOnlyLoad,
    sources.energyMap.pvOnlyGrid,
  ])
  const pvLast = [pvFetched, pvLastUpdate, pvEntityLast].reduce<number | null>((best, t) => {
    if (t == null) return best
    if (best == null || t > best) return t
    return best
  }, null)
  const pvPaused = sources.pvCache?.pollingPaused === true
  const pvConfigured =
    pvLast != null ||
    Boolean(
      sources.energyMap.pvOnlyProduction ||
        sources.energyMap.pvOnlyLoad ||
        sources.energyMap.pvOnlyGrid ||
        sources.pvCache,
    )

  const poolSources: LabeledSource[] = [
    sources.poolMap.temperature
      ? { id: sources.poolMap.temperature, label: 'Temperature' }
      : null,
    sources.poolMap.pumpRpm
      ? { id: sources.poolMap.pumpRpm, label: 'Pump RPM' }
      : null,
    sources.poolMap.depth ? { id: sources.poolMap.depth, label: 'Water depth' } : null,
    { id: PENTAIR_SPA_HEAT_ENTITY, label: 'Spa heat' },
    { id: PENTAIR_POOL_PUMP_RPM_ENTITY, label: 'Pump RPM' },
    { id: PENTAIR_POOL_CIRCUIT_SWITCH, label: 'Pool circuit' },
  ].filter((entry): entry is LabeledSource => entry != null)

  const pondSources: LabeledSource[] = [
    sources.pondMap.level ? { id: sources.pondMap.level, label: 'Water level' } : null,
    sources.pondMap.depth ? { id: sources.pondMap.depth, label: 'Depth' } : null,
  ].filter((entry): entry is LabeledSource => entry != null)

  const mainGarageSources: LabeledSource[] = [
    { id: MAIN_GARAGE.cover, label: 'Door' },
    MAIN_GARAGE.motor ? { id: MAIN_GARAGE.motor, label: 'Motor' } : null,
    MAIN_GARAGE.obstruction
      ? { id: MAIN_GARAGE.obstruction, label: 'Obstruction' }
      : null,
    MAIN_GARAGE.synced ? { id: MAIN_GARAGE.synced, label: 'Synced' } : null,
  ].filter((entry): entry is LabeledSource => entry != null)

  const workshopGarageSources: LabeledSource[] = [
    { id: WORKSHOP_GARAGE.cover, label: 'Door' },
  ]

  const gateSources: LabeledSource[] = [
    { id: GATE_CLOSED_SENSOR, label: 'Closed sensor' },
    { id: GATE_RELAY_BUTTON, label: 'DoorBird relay' },
  ]

  const pvParts = [
    {
      label: 'AlsoEnergy cache',
      lastAtMs: pvFetched ?? pvLastUpdate,
      configured: Boolean(sources.pvCache) || pvFetched != null || pvLastUpdate != null,
    },
    {
      label: 'Production',
      lastAtMs: newestStateUpdatedAtMs(states, [sources.energyMap.pvOnlyProduction]),
      configured: Boolean(sources.energyMap.pvOnlyProduction),
    },
    {
      label: 'Load',
      lastAtMs: newestStateUpdatedAtMs(states, [sources.energyMap.pvOnlyLoad]),
      configured: Boolean(sources.energyMap.pvOnlyLoad),
    },
    {
      label: 'Grid',
      lastAtMs: newestStateUpdatedAtMs(states, [sources.energyMap.pvOnlyGrid]),
      configured: Boolean(sources.energyMap.pvOnlyGrid),
    },
  ]
  const pvEval = evaluateTimestampSources(pvParts, now, staleMs)

  const shadeSources: LabeledSource[] = sources.shadeEntityIds.map((entityId) => ({
    id: entityId,
    label: entityDisplayLabel(states, entityId, entityId.replace(/^cover\./, '')),
  }))

  const rows: DeviceCommRow[] = [
    row({
      key: 'shed-powerpack',
      label: 'Shed PowerPack',
      lastAttemptAtMs: shedLast,
      succeeded: sources.energy.shedCommunicating,
      now,
    }),
    row({
      key: 'alsoenergy-pv',
      label: 'PV array (AlsoEnergy)',
      lastAttemptAtMs: pvEval.lastAttemptAtMs ?? pvLast,
      succeeded: !pvConfigured ? null : pvPaused ? true : pvEval.succeeded,
      failedSources: pvPaused ? [] : pvEval.failedSources,
      now,
      paused: pvPaused,
      skipFailureAlert: pvPaused,
      emptyLabel: 'Not configured',
    }),
    row({
      key: 'egauge-grid',
      label: 'House power (eGauge)',
      lastAttemptAtMs: sources.egaugeUpdatedAtMs,
      succeeded: !sources.egaugeHasReading && sources.egaugeUpdatedAtMs == null
        ? null
        : ageSucceeded(sources.egaugeUpdatedAtMs, false, now, staleMs),
      now,
    }),
    haGroupRow({
      key: 'shades',
      label: 'Shades',
      states,
      sources: shadeSources,
      now,
      staleMs,
      // Covers often keep an old last_updated while idle but still controllable.
      mode: 'availability',
    }),
    haGroupRow({
      key: 'pool',
      label: 'Pool',
      states,
      sources: poolSources,
      now,
      staleMs,
      // ScreenLogic entities often keep an old last_updated while healthy.
      mode: 'availability',
    }),
    haGroupRow({
      key: 'pond',
      label: 'Pond',
      states,
      sources: pondSources,
      now,
      staleMs,
      mode: 'availability',
    }),
    haGroupRow({
      key: 'cistern',
      label: 'Cistern',
      states,
      sources: [{ id: CISTERN_WATER_LEVEL_ENTITY, label: 'Water level' }],
      now,
      staleMs,
      mode: 'availability',
      emptyLabel: sources.cisternLevelPercent == null ? 'Unavailable' : undefined,
    }),
    haGroupRow({
      key: 'garage-main',
      label: 'Main garage',
      states,
      sources: mainGarageSources,
      now,
      staleMs,
      mode: 'availability',
    }),
    haGroupRow({
      key: 'garage-workshop',
      label: 'Detached garage',
      states,
      sources: workshopGarageSources,
      now,
      staleMs,
      mode: 'availability',
    }),
    haGroupRow({
      key: 'gate',
      label: 'Gate',
      states,
      sources: gateSources,
      now,
      staleMs,
      mode: 'availability',
    }),
    haGroupRow({
      key: 'weather',
      label: 'Weather',
      states,
      sources: sources.weather?.entityId
        ? [{ id: sources.weather.entityId, label: 'Weather' }]
        : [],
      now,
      staleMs,
    }),
    haGroupRow({
      key: 'irrigation',
      label: 'Irrigation',
      states,
      sources: sources.irrigation.zones.map((zone) => ({
        id: zone.entityId,
        label: zone.label,
      })),
      now,
      staleMs,
      mode: 'availability',
    }),
    haGroupRow({
      key: 'sonos',
      label: 'Sonos',
      states,
      sources: sources.audio.units.map((unit) => ({
        id: unit.entityId,
        label: unit.label,
      })),
      now,
      staleMs,
      mode: 'availability',
    }),
    row({
      key: 'receiver',
      label: 'AV receiver',
      lastAttemptAtMs: newestStateUpdatedAtMs(states, [sources.receiver.entityId]),
      succeeded: sources.receiver.entityId ? sources.receiver.available : null,
      now,
    }),
    haGroupRow({
      key: 'hvac',
      label: 'HVAC',
      states,
      sources: sources.hvac.thermostats.map((item) => ({
        id: item.entityId,
        label: item.name,
      })),
      now,
      staleMs,
      mode: 'availability',
    }),
    haGroupRow({
      key: 'ac',
      label: 'Mini-split AC',
      states,
      sources: sources.ac.units.map((item) => ({
        id: item.entityId,
        label: item.name,
      })),
      now,
      staleMs,
      mode: 'availability',
    }),
    haGroupRow({
      key: 'outside-lights',
      label: 'Outside lights',
      states,
      sources: sources.outsideTransformers.flatMap((transformer) =>
        transformer.controls.flatMap((control) =>
          control.entityIds.map((entityId, index) => ({
            id: entityId,
            label:
              control.entityIds.length > 1
                ? `${control.label} (${index + 1})`
                : control.label,
          })),
        ),
      ),
      now,
      staleMs,
      mode: 'availability',
    }),
    haGroupRow({
      key: 'crestron',
      label: 'Crestron lights',
      states,
      sources: sources.crestronLights.map((light) => ({
        id: light.entityId,
        label: light.name,
      })),
      now,
      staleMs,
      mode: 'availability',
    }),
    haGroupRow({
      key: 'shed-power-outlet',
      label: 'Shed Power outlet',
      states,
      sources: [{ id: 'switch.shed_power', label: 'Shed Power' }],
      now,
      staleMs,
      mode: 'availability',
      emptyLabel: sources.shedPowerOn == null ? 'Unavailable' : undefined,
    }),
  ]

  return [...rows].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

/**
 * Devices that should raise the communication-failure notification.
 * Multi-source rows fail when any child source exceeds the threshold.
 */
export function isDeviceCommFailing(
  row: DeviceCommRow,
  _thresholdMs: number,
  _now = Date.now(),
): boolean {
  if (row.skipFailureAlert) return false
  if (row.succeeded == null) return false
  return row.succeeded === false
}

export function deviceCommFailures(
  rows: DeviceCommRow[],
  thresholdMs: number,
  now = Date.now(),
): Array<{ key: string; label: string; ageMin: number; failedSources: DeviceCommFailedSource[] }> {
  const failures: Array<{
    key: string
    label: string
    ageMin: number
    failedSources: DeviceCommFailedSource[]
  }> = []
  for (const row of rows) {
    if (!isDeviceCommFailing(row, thresholdMs, now)) continue
    const ageMin =
      row.failedSources.length > 0
        ? Math.max(...row.failedSources.map((source) => source.ageMin))
        : row.lastAttemptAtMs != null
          ? Math.max(1, Math.round((now - row.lastAttemptAtMs) / 60_000))
          : Math.max(1, Math.round(thresholdMs / 60_000))
    failures.push({
      key: row.key,
      label: row.label,
      ageMin,
      failedSources: row.failedSources,
    })
  }
  return failures
}

export type DeviceCommNotifyState = {
  /** True after we've observed this device communicating successfully. */
  sawSuccess: boolean
  /** True after we've already notified for the current outage. */
  notified: boolean
}

/**
 * Edge-triggered failure alerts: notify once when a device goes from
 * success → failure. Do not notify again until it communicates successfully.
 */
export function nextDeviceCommNotifications(
  rows: DeviceCommRow[],
  previous: Map<string, DeviceCommNotifyState>,
  thresholdMs: number,
  now = Date.now(),
): {
  next: Map<string, DeviceCommNotifyState>
  toNotify: Array<{
    key: string
    label: string
    ageMin: number
    failedSources: DeviceCommFailedSource[]
  }>
} {
  const next = new Map<string, DeviceCommNotifyState>()
  const toNotify: Array<{
    key: string
    label: string
    ageMin: number
    failedSources: DeviceCommFailedSource[]
  }> = []

  for (const row of rows) {
    if (row.skipFailureAlert || row.succeeded == null) {
      const prior = previous.get(row.key)
      if (prior) next.set(row.key, prior)
      continue
    }

    const prior = previous.get(row.key) ?? { sawSuccess: false, notified: false }
    const failing = isDeviceCommFailing(row, thresholdMs, now)

    if (!failing) {
      next.set(row.key, { sawSuccess: true, notified: false })
      continue
    }

    if (prior.sawSuccess && !prior.notified) {
      const ageMin =
        row.failedSources.length > 0
          ? Math.max(...row.failedSources.map((source) => source.ageMin))
          : row.lastAttemptAtMs != null
            ? Math.max(1, Math.round((now - row.lastAttemptAtMs) / 60_000))
            : Math.max(1, Math.round(thresholdMs / 60_000))
      toNotify.push({
        key: row.key,
        label: row.label,
        ageMin,
        failedSources: row.failedSources,
      })
      next.set(row.key, { sawSuccess: true, notified: true })
      continue
    }

    next.set(row.key, prior)
  }

  return { next, toNotify }
}
