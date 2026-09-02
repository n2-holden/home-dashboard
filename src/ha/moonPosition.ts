const DEG = Math.PI / 180
const RAD = 180 / Math.PI

export type MoonSnapshot = {
  aboveHorizon: boolean
  progress: number
  elevation: number
  azimuth: number
  elevationLabel: string
  azimuthLabel: string
}

export function moonSnapshotFromDate(
  when: Date,
  latitudeDeg: number,
  longitudeDeg: number,
): MoonSnapshot {
  const days = daysSince2000(when)
  const moon = moonEquatorialPosition(days)
  const latitude = latitudeDeg * DEG
  const declination = moon.declination * DEG
  const hourAngle = normalizeDegrees(localSiderealTimeDegrees(days, longitudeDeg) - moon.rightAscension)
  const altitude =
    Math.asin(
      Math.sin(latitude) * Math.sin(declination) +
        Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle * DEG),
    ) * RAD
  const elevation = altitude
  const azimuth = azimuthFromEquatorial(latitude, declination, hourAngle)

  const riseSetCosine =
    (-Math.sin(0.3 * DEG) - Math.sin(latitude) * Math.sin(declination)) /
    (Math.cos(latitude) * Math.cos(declination))
  const riseSetAngle =
    Math.abs(riseSetCosine) < 1 ? Math.acos(riseSetCosine) * RAD : 90
  const progress = Math.max(
    0,
    Math.min(1, (hourAngle + riseSetAngle) / (2 * riseSetAngle)),
  )

  return {
    aboveHorizon: elevation > 0,
    progress,
    elevation,
    azimuth,
    elevationLabel: `${elevation.toFixed(1)}°`,
    azimuthLabel: `${Math.round(azimuth)}°`,
  }
}

export function moonArcCoordinates(progress: number): { x: number; y: number } {
  const cx = 66
  const cy = 54
  const radius = 39
  const angle = Math.PI - Math.max(0, Math.min(1, progress)) * Math.PI
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  }
}

function moonEquatorialPosition(days: number): {
  rightAscension: number
  declination: number
} {
  let sunMeanAnomaly = normalizeDegrees(356.047 + 0.9856002585 * days)
  const sunLongitude = sunMeanAnomaly + 282.9404 + 0.0000470935 * days

  let moonMeanAnomaly = normalizeDegrees(115.3654 + 13.0649929509 * days)
  const moonNode = normalizeDegrees(125.1228 - 0.0529538083 * days)
  const moonPerigee = normalizeDegrees(318.0634 + 0.1643573223 * days)
  let moonLongitude = moonMeanAnomaly + moonPerigee + moonNode

  const evection = 1.2739 * Math.sin((2 * (moonLongitude - sunLongitude) - moonMeanAnomaly) * DEG)
  const annualEquation = 0.1858 * Math.sin(sunMeanAnomaly * DEG)
  const correction = 0.37 * Math.sin(sunMeanAnomaly * DEG)
  moonMeanAnomaly += evection - annualEquation - correction

  const equationOfCenter = 6.2886 * Math.sin(moonMeanAnomaly * DEG)
  const secondCorrection = 0.214 * Math.sin(2 * moonMeanAnomaly * DEG)
  moonMeanAnomaly += equationOfCenter - secondCorrection

  moonLongitude =
    moonLongitude +
    evection +
    equationOfCenter -
    annualEquation +
    secondCorrection
  moonLongitude += 0.6583 * Math.sin(2 * (moonLongitude - sunLongitude) * DEG)

  const eclipticLatitude = 5.128 * Math.sin((moonLongitude - moonNode) * DEG)
  const eclipticLongitude = normalizeDegrees(moonLongitude)
  const obliquity = 23.4393 - 0.0000003563 * days

  const x = Math.cos(eclipticLongitude * DEG) * Math.cos(eclipticLatitude * DEG)
  const y =
    Math.sin(eclipticLongitude * DEG) * Math.cos(eclipticLatitude * DEG) * Math.cos(obliquity * DEG) -
    Math.sin(eclipticLatitude * DEG) * Math.sin(obliquity * DEG)
  const z =
    Math.sin(eclipticLongitude * DEG) * Math.cos(eclipticLatitude * DEG) * Math.sin(obliquity * DEG) +
    Math.sin(eclipticLatitude * DEG) * Math.cos(obliquity * DEG)

  return {
    rightAscension: normalizeDegrees(Math.atan2(y, x) * RAD),
    declination: Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD,
  }
}

function azimuthFromEquatorial(
  latitudeRad: number,
  declinationRad: number,
  hourAngleDeg: number,
): number {
  const hourAngle = hourAngleDeg * DEG
  const y = Math.sin(hourAngle)
  const x =
    Math.cos(hourAngle) * Math.sin(latitudeRad) - Math.tan(declinationRad) * Math.cos(latitudeRad)
  let azimuth = Math.atan2(y, x) * RAD
  if (azimuth < 0) azimuth += 360
  return azimuth
}

function localSiderealTimeDegrees(days: number, longitudeDeg: number): number {
  const greenwichHours = 18.697374558 + 24.06570982441908 * days
  return normalizeDegrees(greenwichHours * 15 + longitudeDeg)
}

function daysSince2000(when: Date): number {
  return (when.getTime() - Date.UTC(2000, 0, 0, 12)) / 86_400_000
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 540) % 360 - 180
}
