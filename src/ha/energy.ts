import type { HaState } from './positions'

export type HaSensor = {
  entityId: string
  name: string
  state: string
  numericValue: number | null
  unit: string | null
  deviceClass: string | null
}

export function sensorFromState(state: HaState): HaSensor {
  const raw = Number(state.state)
  const unit =
    typeof state.attributes.unit_of_measurement === 'string'
      ? state.attributes.unit_of_measurement
      : null
  const deviceClass =
    typeof state.attributes.device_class === 'string' ? state.attributes.device_class : null

  return {
    entityId: state.entity_id,
    name: state.attributes.friendly_name ?? state.entity_id,
    state: state.state,
    numericValue: Number.isFinite(raw) ? raw : null,
    unit,
    deviceClass,
  }
}

export function formatPower(watts: number | null): string {
  if (watts == null) return '—'
  const abs = Math.abs(watts)
  if (abs >= 1000) return `${(watts / 1000).toFixed(abs >= 10000 ? 1 : 2)} kW`
  return `${Math.round(watts)} W`
}

/** Format energy in kWh (or MWh when large). */
export function formatEnergyKwh(kwh: number | null): string {
  if (kwh == null) return '—'
  const abs = Math.abs(kwh)
  if (abs >= 1000) return `${(kwh / 1000).toFixed(abs >= 10000 ? 1 : 2)} MWh`
  if (abs >= 100) return `${Math.round(kwh)} kWh`
  return `${kwh.toFixed(abs >= 10 ? 1 : 2)} kWh`
}

/** Positive grid watts = import; negative = export (Enphase net grid convention). */
export function splitGridImportExport(watts: number | null): {
  importWatts: number | null
  exportWatts: number | null
} {
  if (watts == null) return { importWatts: null, exportWatts: null }
  if (watts > 0) return { importWatts: watts, exportWatts: 0 }
  if (watts < 0) return { importWatts: 0, exportWatts: Math.abs(watts) }
  return { importWatts: 0, exportWatts: 0 }
}

export function formatSoc(percent: number | null): string {
  if (percent == null) return '—'
  return `${Math.round(percent)}%`
}

export function rankPvSensors(sensors: HaSensor[]): HaSensor[] {
  return [...sensors]
    .map((s) => ({ sensor: s, score: scorePv(s) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.sensor)
}

export function rankSocSensors(sensors: HaSensor[]): HaSensor[] {
  return [...sensors]
    .map((s) => ({ sensor: s, score: scoreSoc(s) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.sensor)
}

/** Prefer Enphase/Envoy-like sensors for PV production. */
export function suggestPvSensor(sensors: HaSensor[], exclude: string[] = []): string | null {
  const blocked = new Set(exclude.filter(Boolean))
  return rankPvSensors(sensors).find((s) => !blocked.has(s.entityId))?.entityId ?? null
}

/** Prefer battery charge sensors. */
export function suggestBatterySocSensor(sensors: HaSensor[], exclude: string[] = []): string | null {
  const blocked = new Set(exclude.filter(Boolean))
  return rankSocSensors(sensors).find((s) => !blocked.has(s.entityId))?.entityId ?? null
}

export function suggestPowerpackPowerSensor(
  sensors: HaSensor[],
  kind: 'pv' | 'load' | 'battery' | 'grid',
  exclude: string[] = [],
): string | null {
  const blocked = new Set(exclude.filter(Boolean))
  return [...sensors]
    .map((s) => ({ sensor: s, score: scorePowerpackPower(s, kind) }))
    .filter((s) => s.score > 0 && !blocked.has(s.sensor.entityId))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.sensor)[0]?.entityId ?? null
}

function scorePowerpackPower(sensor: HaSensor, kind: 'pv' | 'load' | 'battery' | 'grid'): number {
  const h = hay(sensor)
  let score = 0
  if (h.includes('powerpack') || h.includes('power_pack') || h.includes('enphase_powerpack')) score += 5
  if (h.includes('enphase')) score += 2
  if (sensor.deviceClass === 'power') score += 2
  if (sensor.unit?.toLowerCase() === 'w' || sensor.unit?.toLowerCase() === 'kw') score += 2

  if (kind === 'pv') {
    if (h.includes('pv') || h.includes('production') || h.includes('producing') || h.includes('solar'))
      score += 5
    if (h.includes('load') || h.includes('consumption') || h.includes('grid') || h.includes('battery'))
      score -= 4
  } else if (kind === 'load') {
    if (h.includes('load') || h.includes('consumption') || h.includes('consum')) score += 5
    if (h.includes('production') || h.includes('grid') || h.includes('battery')) score -= 3
  } else if (kind === 'battery') {
    if (h.includes('battery') && (h.includes('power') || h.includes('watt'))) score += 6
    if (h.includes('soc') || (h.includes('charge') && !h.includes('discharg'))) score -= 5
    if (h.includes('production') || h.includes('load') || h.includes('grid')) score -= 3
  } else if (kind === 'grid') {
    if (h.includes('grid')) score += 6
    if (h.includes('import') || h.includes('export')) score += 2
    if (h.includes('production') || h.includes('load') || h.includes('battery')) score -= 3
  }

  if (sensor.numericValue == null) score -= 2
  return score
}

function hay(sensor: HaSensor): string {
  return `${sensor.entityId} ${sensor.name}`.toLowerCase()
}

const ENPHASE_ENTITY = /enphase|powerpack|5904582|5478356|envoy/

/** Match AlsoEnergy PowerTrack sensors (production + month/lifetime energy). */
export function matchAlsoEnergyPvSensors(sensors: HaSensor[]): {
  production: string | null
  today: string | null
  month: string | null
  lifetime: string | null
} {
  const pool = sensors.filter((s) => !ENPHASE_ENTITY.test(s.entityId))
  const production =
    pool.find(
      (s) =>
        /production_power/.test(s.entityId) &&
        s.deviceClass === 'power' &&
        !/load|grid|battery/.test(s.entityId),
    ) ?? null
  const today =
    pool.find(
      (s) =>
        /energy_produced_today|produced_today/.test(s.entityId) &&
        (s.deviceClass === 'energy' || s.unit?.toLowerCase() === 'kwh'),
    ) ?? null
  const month =
    pool.find(
      (s) =>
        /energy_produced_this_month|this_month/.test(s.entityId) &&
        (s.deviceClass === 'energy' || s.unit?.toLowerCase() === 'kwh'),
    ) ?? null
  const lifetime =
    pool.find(
      (s) =>
        /lifetime_energy_produced|lifetime_energy/.test(s.entityId) &&
        (s.deviceClass === 'energy' || s.unit?.toLowerCase() === 'kwh'),
    ) ?? null

  if (!production && !today && !month && !lifetime) {
    return { production: null, today: null, month: null, lifetime: null }
  }

  return {
    production: production?.entityId ?? null,
    today: today?.entityId ?? null,
    month: month?.entityId ?? null,
    lifetime: lifetime?.entityId ?? null,
  }
}

function scorePv(sensor: HaSensor): number {
  const h = hay(sensor)
  let score = 0
  if (ENPHASE_ENTITY.test(sensor.entityId)) score -= 6
  if (/production_power/.test(sensor.entityId) && !/load|grid|battery/.test(h)) score += 6
  if (h.includes('alsoenergy')) score += 5
  if (h.includes('enphase') || h.includes('envoy')) score += 3
  if (h.includes('powerpack') || h.includes('power pack') || h.includes('iq battery')) score += 1
  if (h.includes('production') || h.includes('producing')) score += 4
  if (h.includes('pv') || h.includes('solar')) score += 2
  if (h.includes('power') || h.includes('watt')) score += 2
  if (h.includes('consumption') || h.includes('grid')) score -= 3
  if (h.includes('battery') && !h.includes('production')) score -= 2
  if (h.includes('energy') && h.includes('today')) score -= 2
  if (sensor.deviceClass === 'power') score += 2
  if (sensor.unit?.toLowerCase() === 'w' || sensor.unit?.toLowerCase() === 'kw') score += 2
  if (sensor.numericValue == null) score -= 5
  return score
}

function scoreSoc(sensor: HaSensor): number {
  const h = hay(sensor)
  let score = 0
  if (
    h.includes('enphase') ||
    h.includes('envoy') ||
    h.includes('iq_battery') ||
    h.includes('iq battery') ||
    h.includes('powerpack') ||
    h.includes('power pack')
  )
    score += 3
  if (h.includes('battery')) score += 3
  if (
    h.includes('state_of_charge') ||
    h.includes('state of charge') ||
    h.includes('soc') ||
    h.includes('charge')
  )
    score += 4
  if (h.includes('percentage') || h.includes('percent')) score += 2
  if (h.includes('power') || h.includes('watt') || h.includes('energy')) score -= 3
  if (sensor.deviceClass === 'battery') score += 4
  if (sensor.unit === '%') score += 2
  if (sensor.numericValue == null) score -= 5
  return score
}

/** Normalize sensor reading to watts when possible. */
export function toWatts(sensor: HaSensor | null): number | null {
  if (!sensor || sensor.numericValue == null) return null
  const unit = sensor.unit?.toLowerCase()
  if (unit === 'kw') return sensor.numericValue * 1000
  return sensor.numericValue
}

/** Normalize sensor reading to kWh when possible. */
export function toKwh(sensor: HaSensor | null): number | null {
  if (!sensor || sensor.numericValue == null) return null
  const unit = (sensor.unit ?? '').toLowerCase().replace(/\s/g, '')
  if (unit === 'mwh') return sensor.numericValue * 1000
  if (unit === 'wh') return sensor.numericValue / 1000
  return sensor.numericValue
}

export function toPercent(sensor: HaSensor | null): number | null {
  if (!sensor || sensor.numericValue == null) return null
  return Math.max(0, Math.min(100, sensor.numericValue))
}

export function sumWatts(...values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null)
  if (present.length === 0) return null
  return present.reduce((a, b) => a + b, 0)
}
