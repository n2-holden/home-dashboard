import { formatDataAge } from './energy'
import {
  formatFailedSourcesLabel,
  type DeviceCommFailedSource,
  type DeviceCommRow,
} from './deviceCommunication'

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
