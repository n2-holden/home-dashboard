/** Approximate solar elevation in degrees (negative = below horizon). */
export function solarElevationDegrees(
  when: Date,
  latitudeDeg: number,
  longitudeDeg: number,
): number {
  const { lat, ha, decl } = solarComponents(when, latitudeDeg, longitudeDeg)
  let cosZenith = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)
  cosZenith = Math.max(-1, Math.min(1, cosZenith))
  return 90 - toDeg(Math.acos(cosZenith))
}

/** Solar azimuth in degrees (0° north, 90° east). */
export function solarAzimuthDegrees(
  when: Date,
  latitudeDeg: number,
  longitudeDeg: number,
): number {
  const { lat, ha, decl, hourAngleDeg } = solarComponents(when, latitudeDeg, longitudeDeg)
  let cosZenith = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)
  cosZenith = Math.max(-1, Math.min(1, cosZenith))
  const zenith = Math.acos(cosZenith)
  if (zenith === 0) return 180

  let az =
    (Math.sin(lat) * Math.cos(zenith) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zenith))
  az = Math.max(-1, Math.min(1, az))
  let azDeg = toDeg(Math.acos(az))
  if (hourAngleDeg > 0) azDeg = 360 - azDeg
  return azDeg
}

function solarComponents(when: Date, latitudeDeg: number, longitudeDeg: number) {
  const utc = new Date(when.getTime())
  const lat = toRad(latitudeDeg)
  const dayOfYear =
    utcDayOfYear(utc) +
    (utc.getUTCHours() + utc.getUTCMinutes() / 60 + utc.getUTCSeconds() / 3600) / 24
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1)

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)

  const timeOffset = eqTime + 4 * longitudeDeg
  let trueSolarTime =
    utc.getUTCHours() * 60 + utc.getUTCMinutes() + utc.getUTCSeconds() / 60 + timeOffset
  trueSolarTime = ((trueSolarTime % 1440) + 1440) % 1440

  let hourAngleDeg = trueSolarTime / 4 - 180
  if (hourAngleDeg < -180) hourAngleDeg += 360

  const ha = toRad(hourAngleDeg)
  return { lat, ha, decl, hourAngleDeg }
}

function utcDayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return (now - start) / 86_400_000
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}
