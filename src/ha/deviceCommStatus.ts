import { formatDataAge } from './energy'
import {
  formatFailedSourcesLabel,
  type DeviceCommFailedSource,
  type DeviceCommRow,
} from './deviceCommunication'
import type { OutsideTransformer } from './outside'
import type { CrestronLight } from './lights'
import type { IrrigationSnapshot } from './irrigation'
import type { GarageDoorSnapshot } from './garage'
import type { GateSnapshot } from './gate'
import type { WeatherSnapshot } from './weather'
import type { SonosSnapshot } from './sonos'
import type { ReceiverSnapshot } from './receiver'
import type { HvacSnapshot } from './hvac'
import type { AcSnapshot } from './ac'
import type { CisternSnapshot } from './cistern'

/** Shared status written by HA `check_device_comm.py` (same logic as notifications). */
export type HaDeviceCommStatusFile = {
  checkedAt?: string
  checkedAtMs?: number
  thresholdMinutes?: number
  rows?: HaDeviceCommStatusRow[]
}

export type HaDeviceCommStatusRow = {
  key: string
  label: string
  succeeded: boolean | null
  failedSources?: Array<{
    label: string
    ageMin?: number
    sinceMs?: number | null
  }>
  failureStartedAtMs?: number | null
}

/** Live UI signals used to mark failures immediately (before notify grace). */
export type LiveDeviceCommSnapshot = {
  gate: Pick<GateSnapshot, 'doorbirdOffline' | 'sensorOffline' | 'sensorBlocked'>
  mainGarage: Pick<GarageDoorSnapshot, 'offline'>
  workshopGarage: Pick<GarageDoorSnapshot, 'offline'>
  outsideTransformers: OutsideTransformer[]
  crestronLights: CrestronLight[]
  irrigation: IrrigationSnapshot
  weather: WeatherSnapshot | null
  audio: SonosSnapshot
  receiver: ReceiverSnapshot
  hvac: HvacSnapshot
  ac: AcSnapshot
  cistern: CisternSnapshot
}

export async function fetchDeviceCommStatus(): Promise<HaDeviceCommStatusFile | null> {
  try {
    const url = new URL('device-comm-status.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as HaDeviceCommStatusFile
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function deviceCommRowsFromHaStatus(
  file: HaDeviceCommStatusFile,
  now = Date.now(),
): DeviceCommRow[] {
  const rows = Array.isArray(file.rows) ? file.rows : []
  return rows
    .map((row) => {
      const failedSources: DeviceCommFailedSource[] = (row.failedSources ?? []).map(
        (source) => ({
          label: source.label,
          ageMin: Math.max(1, source.ageMin ?? 1),
          sinceMs: source.sinceMs ?? row.failureStartedAtMs ?? null,
        }),
      )
      const succeeded = row.succeeded
      const failureAtMs =
        succeeded === false
          ? (row.failureStartedAtMs ??
            failedSources.find((source) => source.sinceMs != null)?.sinceMs ??
            null)
          : null
      const detail = formatFailedSourcesLabel(failedSources)
      return {
        key: row.key,
        label: row.label,
        lastAttemptAtMs: failureAtMs,
        lastAttemptLabel:
          succeeded === false && failureAtMs != null
            ? formatDataAge(failureAtMs, now) ?? '—'
            : succeeded === true
              ? '—'
              : 'Not configured',
        succeeded,
        resultLabel:
          succeeded === true
            ? 'Succeeded'
            : succeeded === false
              ? detail
                ? `Failed: ${detail}`
                : 'Failed'
              : 'Unknown',
        failedSources,
        skipFailureAlert: false,
      } satisfies DeviceCommRow
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

/**
 * Devices whose integrations routinely miss a poll or two. A live failure only
 * shows once it has persisted this long. Rain Bird's LNK module drops ~200
 * polls/day for 1–5 minutes each; the outdoor Sonos speakers drop off Wi-Fi
 * many times a day, usually for under a minute.
 */
const LIVE_FAIL_GRACE_MS: Record<string, number> = {
  irrigation: 6 * 60_000,
  sonos: 5 * 60_000,
}

const liveFailSinceMs = new Map<string, number>()

function debouncedLiveFail(
  row: DeviceCommRow,
  failing: boolean,
  failLabel: string,
  now: number,
): DeviceCommRow {
  const grace = LIVE_FAIL_GRACE_MS[row.key] ?? 0
  if (!failing) {
    liveFailSinceMs.delete(row.key)
    return liveOkRow(row)
  }
  const since = liveFailSinceMs.get(row.key) ?? now
  liveFailSinceMs.set(row.key, since)
  if (now - since < grace) return row.succeeded === false ? row : liveOkRow(row)
  return liveFailRow(row, failLabel, now)
}

/**
 * Align Last Communication / connectivity-rail rows with live UI unavailability
 * (grayed toggles, red Xs), even before the notify grace window expires.
 */
export function applyLiveDeviceCommOverrides(
  rows: DeviceCommRow[],
  live: LiveDeviceCommSnapshot,
  now = Date.now(),
): DeviceCommRow[] {
  const outsideFailLabels = unavailableOutsideLightLabels(live.outsideTransformers)
  const crestronFailLabels = live.crestronLights
    .filter((light) => light.on == null)
    .map((light) => light.name)
  const irrigationFailLabels = live.irrigation.zones
    .filter((zone) => zone.active == null)
    .map((zone) => zone.label)
  const sonosFailLabels = live.audio.units
    .filter((unit) => unit.state === 'unavailable' || unit.state === 'unknown')
    .map((unit) => unit.label)
  const hvacFailLabels = live.hvac.thermostats
    .filter((item) => item.mode === 'unavailable' || item.mode === 'unknown')
    .map((item) => item.name)
  const acFailLabels = live.ac.units
    .filter((unit) => unit.mode === 'unavailable' || unit.mode === 'unknown')
    .map((unit) => unit.name)

  return rows.map((row) => {
    if (row.key === 'gate-doorbird') {
      return live.gate.doorbirdOffline
        ? liveFailRow(row, 'DoorBird offline', now)
        : liveOkRow(row)
    }
    if (row.key === 'gate-sensor') {
      return live.gate.sensorOffline
        ? liveFailRow(row, 'Shelly gate I/O offline', now)
        : liveOkRow(row)
    }
    if (row.key === 'driveway-sensor-blocked') {
      return live.gate.sensorBlocked
        ? liveFailRow(row, 'Gate - Sensor (driveway blocked)', now)
        : liveOkRow(row)
    }
    if (row.key === 'garage-main') {
      return live.mainGarage.offline
        ? liveFailRow(row, 'Main garage offline', now)
        : liveOkRow(row)
    }
    if (row.key === 'garage-workshop') {
      return live.workshopGarage.offline
        ? liveFailRow(row, 'Detached garage offline', now)
        : liveOkRow(row)
    }
    if (row.key === 'outside-lights') {
      if (live.outsideTransformers.length === 0) return row
      return outsideFailLabels.length > 0
        ? liveFailRow(row, outsideFailLabels.join(', '), now)
        : liveOkRow(row)
    }
    if (row.key === 'crestron') {
      if (live.crestronLights.length === 0) return row
      return crestronFailLabels.length > 0
        ? liveFailRow(row, crestronFailLabels.join(', '), now)
        : liveOkRow(row)
    }
    if (row.key === 'irrigation') {
      if (live.irrigation.zones.length === 0) return row
      return debouncedLiveFail(
        row,
        irrigationFailLabels.length > 0,
        irrigationFailLabels.join(', '),
        now,
      )
    }
    if (row.key === 'sonos') {
      if (live.audio.units.length === 0) return row
      return debouncedLiveFail(row, sonosFailLabels.length > 0, sonosFailLabels.join(', '), now)
    }
    if (row.key === 'receiver') {
      if (!live.receiver.entityId) return row
      return live.receiver.available === false
        ? liveFailRow(row, 'AV receiver unavailable', now)
        : liveOkRow(row)
    }
    if (row.key === 'hvac') {
      if (live.hvac.thermostats.length === 0) return row
      return hvacFailLabels.length > 0
        ? liveFailRow(row, hvacFailLabels.join(', '), now)
        : liveOkRow(row)
    }
    if (row.key === 'ac') {
      if (live.ac.units.length === 0) return row
      return acFailLabels.length > 0
        ? liveFailRow(row, acFailLabels.join(', '), now)
        : liveOkRow(row)
    }
    if (row.key === 'cistern') {
      return live.cistern.levelPercent == null
        ? liveFailRow(row, 'Cistern water level unavailable', now)
        : liveOkRow(row)
    }
    if (row.key === 'weather') {
      if (!live.weather) return row
      const bad =
        !live.weather.entityId ||
        live.weather.temperatureLabel === '—' ||
        live.weather.conditionLabel === '—'
      return bad ? liveFailRow(row, 'Weather unavailable', now) : liveOkRow(row)
    }
    return row
  })
}

/** @deprecated Prefer {@link applyLiveDeviceCommOverrides}. */
export function applyLiveGateCommOverrides(
  rows: DeviceCommRow[],
  gate: { doorbirdOffline: boolean; sensorOffline: boolean },
  now = Date.now(),
): DeviceCommRow[] {
  return rows.map((row) => {
    if (row.key === 'gate-doorbird') {
      return gate.doorbirdOffline ? liveFailRow(row, 'DoorBird offline', now) : liveOkRow(row)
    }
    if (row.key === 'gate-sensor') {
      return gate.sensorOffline
        ? liveFailRow(row, 'Shelly gate I/O offline', now)
        : liveOkRow(row)
    }
    return row
  })
}

function unavailableOutsideLightLabels(transformers: OutsideTransformer[]): string[] {
  const labels: string[] = []
  for (const transformer of transformers) {
    for (const control of transformer.controls) {
      // Matches OutsideWidget grayed toggles: missing entity or on == null.
      if (control.entityIds.length === 0 || control.on == null) {
        labels.push(control.label)
      }
    }
  }
  return labels
}

function liveFailRow(row: DeviceCommRow, detail: string, now: number): DeviceCommRow {
  const sinceMs = row.lastAttemptAtMs ?? now
  const ageMin = Math.max(1, Math.round((now - sinceMs) / 60_000))
  return {
    ...row,
    succeeded: false,
    lastAttemptAtMs: sinceMs,
    lastAttemptLabel: formatDataAge(sinceMs, now) ?? '—',
    failedSources: [{ label: detail, ageMin, sinceMs }],
    resultLabel: `Failed: ${detail}`,
  }
}

function liveOkRow(row: DeviceCommRow): DeviceCommRow {
  if (row.succeeded === true) return row
  return {
    ...row,
    succeeded: true,
    lastAttemptAtMs: null,
    lastAttemptLabel: '—',
    failedSources: [],
    resultLabel: 'Succeeded',
  }
}
