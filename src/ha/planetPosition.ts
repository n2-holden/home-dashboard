/** Low-precision geocentric planet positions for the sky arc graphic. */

import { moonEclipticLongitudeDegrees } from './moonPosition'

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

export type PlanetId =
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'

export type PlanetSnapshot = {
  id: PlanetId
  name: string
  color: string
  aboveHorizon: boolean
  elevation: number
  azimuth: number
  elevationLabel: string
  azimuthLabel: string
  /** 0 at east / rise side, 1 at west / set side of the day arc. */
  progress: number
}

type OrbitalElements = {
  name: string
  color?: string
  id?: PlanetId
  /** Semi-major axis AU + rate/cy */
  a: [number, number]
  /** Eccentricity + rate/cy */
  e: [number, number]
  /** Inclination deg + rate/cy */
  i: [number, number]
  /** Mean longitude deg + rate/cy */
  L: [number, number]
  /** Longitude of perihelion deg + rate/cy */
  w: [number, number]
  /** Longitude of ascending node deg + rate/cy */
  O: [number, number]
}

/** JPL Keplerian elements, epoch J2000 (approx. positions). */
const PLANETS: Array<OrbitalElements & { id: PlanetId; color: string }> = [
  {
    id: 'mercury',
    name: 'Mercury',
    color: '#9aa0a6',
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    i: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    w: [77.45779628, 0.16047689],
    O: [48.33076593, -0.12534081],
  },
  {
    id: 'venus',
    name: 'Venus',
    color: '#8ecae6',
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    i: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    w: [131.60246718, 0.00268329],
    O: [76.67984255, -0.27769418],
  },
  {
    id: 'mars',
    name: 'Mars',
    color: '#e63946',
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    i: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    w: [-23.94362959, 0.44441088],
    O: [49.55953891, -0.29257343],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    color: '#c4a484',
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    i: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    w: [14.72847983, 0.21252668],
    O: [100.47390909, 0.20469106],
  },
  {
    id: 'saturn',
    name: 'Saturn',
    color: '#f4a261',
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    i: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    w: [92.59887831, -0.41897216],
    O: [113.66242448, -0.28867794],
  },
  {
    id: 'uranus',
    name: 'Uranus',
    color: '#1d3557',
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    i: [0.77263847, -0.00242939],
    L: [313.23810451, 428.48202785],
    w: [170.9542763, 0.40805281],
    O: [74.01692503, 0.04240589],
  },
  {
    id: 'neptune',
    name: 'Neptune',
    color: '#2a9d8f',
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    i: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    w: [44.96476227, -0.322840359],
    O: [131.78405702, -0.00508664],
  },
]

const EARTH: OrbitalElements = {
  name: 'Earth',
  a: [1.00000261, 0.00000562],
  e: [0.01671123, -0.00004392],
  i: [-0.00001531, -0.01294668],
  L: [100.46457166, 35999.37244981],
  w: [102.93768193, 0.32327364],
  O: [0, 0],
}

/** Sun path radius 46, moon 39 → planets outside sun by the same 7px gap. */
export const PLANET_ARC_RADIUS = 53
export const SKY_ARC_CX = 66
export const SKY_ARC_CY = 54

export type SolarSystemBodyId = PlanetId | 'earth'

export type SolarSystemBody = {
  id: SolarSystemBodyId
  name: string
  shortName: string
  color: string
  /** Equal-spaced schematic ring index (0 = Mercury … 7 = Neptune). */
  ring: number
  /** Heliocentric ecliptic longitude, degrees. */
  longitudeDeg: number
}

export type SolarSystemTopView = {
  bodies: SolarSystemBody[]
  /** Geocentric ecliptic longitude of the Moon (direction Earth → Moon). */
  moonLongitudeDeg: number
}

const EARTH_MAP_COLOR = '#5b9fd4'
const BODY_SHORT: Record<SolarSystemBodyId, string> = {
  mercury: 'Me',
  venus: 'V',
  earth: 'E',
  mars: 'Ma',
  jupiter: 'J',
  saturn: 'S',
  uranus: 'U',
  neptune: 'N',
}

/** Schematic top-down solar system (orbits not to scale). */
export function solarSystemTopViewFromDate(when: Date): SolarSystemTopView {
  const days = daysSince2000(when)
  const centuries = days / 36525
  const earth = heliocentricEcliptic(EARTH, centuries)

  const bodies: SolarSystemBody[] = [
    ...PLANETS.slice(0, 2).map((planet, index) => bodyFromHelio(planet, index, centuries)),
    {
      id: 'earth',
      name: 'Earth',
      shortName: BODY_SHORT.earth,
      color: EARTH_MAP_COLOR,
      ring: 2,
      longitudeDeg: longitudeFromXY(earth.x, earth.y),
    },
    ...PLANETS.slice(2).map((planet, index) => bodyFromHelio(planet, index + 3, centuries)),
  ]

  return {
    bodies,
    moonLongitudeDeg: moonEclipticLongitudeDegrees(when),
  }
}

function bodyFromHelio(
  planet: (typeof PLANETS)[number],
  ring: number,
  centuries: number,
): SolarSystemBody {
  const helio = heliocentricEcliptic(planet, centuries)
  return {
    id: planet.id,
    name: planet.name,
    shortName: BODY_SHORT[planet.id],
    color: planet.color,
    ring,
    longitudeDeg: longitudeFromXY(helio.x, helio.y),
  }
}

function longitudeFromXY(x: number, y: number): number {
  return Math.atan2(y, x) * RAD
}

export function planetsSnapshotFromDate(
  when: Date,
  latitudeDeg: number,
  longitudeDeg: number,
): PlanetSnapshot[] {
  const days = daysSince2000(when)
  const centuries = days / 36525
  const earth = heliocentricEcliptic(EARTH, centuries)
  const latitude = latitudeDeg * DEG
  const lst = localSiderealTimeDegrees(days, longitudeDeg)

  return PLANETS.map((planet) => {
    const helio = heliocentricEcliptic(planet, centuries)
    const geoX = helio.x - earth.x
    const geoY = helio.y - earth.y
    const geoZ = helio.z - earth.z
    const equatorial = eclipticToEquatorial(geoX, geoY, geoZ, centuries)
    const hourAngle = normalizeDegrees(lst - equatorial.rightAscension)
    const elevation =
      Math.asin(
        Math.sin(latitude) * Math.sin(equatorial.declination * DEG) +
          Math.cos(latitude) *
            Math.cos(equatorial.declination * DEG) *
            Math.cos(hourAngle * DEG),
      ) * RAD
    const azimuth = azimuthFromEquatorial(latitude, equatorial.declination * DEG, hourAngle)
    return {
      id: planet.id,
      name: planet.name,
      color: planet.color,
      aboveHorizon: elevation > 0,
      elevation,
      azimuth,
      elevationLabel: `${elevation.toFixed(1)}°`,
      azimuthLabel: `${Math.round(azimuth)}°`,
      progress: skyArcProgressFromAzimuth(azimuth),
    }
  })
}

export function planetArcCoordinates(progress: number): { x: number; y: number } {
  const angle = Math.PI - Math.max(0, Math.min(1, progress)) * Math.PI
  return {
    x: SKY_ARC_CX + PLANET_ARC_RADIUS * Math.cos(angle),
    y: SKY_ARC_CY - PLANET_ARC_RADIUS * Math.sin(angle),
  }
}

/** East 90° → 0, south 180° → 0.5, west 270° → 1 on the day arc. */
export function skyArcProgressFromAzimuth(azimuth: number): number {
  return Math.max(0, Math.min(1, (azimuth - 90) / 180))
}

function heliocentricEcliptic(elements: OrbitalElements, centuries: number) {
  const a = elements.a[0] + elements.a[1] * centuries
  const e = elements.e[0] + elements.e[1] * centuries
  const i = (elements.i[0] + elements.i[1] * centuries) * DEG
  const L = elements.L[0] + elements.L[1] * centuries
  const wBar = elements.w[0] + elements.w[1] * centuries
  const O = (elements.O[0] + elements.O[1] * centuries) * DEG
  const peri = (wBar - (elements.O[0] + elements.O[1] * centuries)) * DEG
  let M = ((L - wBar) % 360) * DEG
  if (M > Math.PI) M -= 2 * Math.PI
  if (M < -Math.PI) M += 2 * Math.PI

  let E = M
  for (let n = 0; n < 8; n += 1) {
    E = M + e * Math.sin(E)
  }

  const xv = a * (Math.cos(E) - e)
  const yv = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E)
  const v = Math.atan2(yv, xv)
  const r = Math.sqrt(xv * xv + yv * yv)

  const cosO = Math.cos(O)
  const sinO = Math.sin(O)
  const cosI = Math.cos(i)
  const sinI = Math.sin(i)
  const cosWP = Math.cos(v + peri)
  const sinWP = Math.sin(v + peri)

  return {
    x: r * (cosO * cosWP - sinO * sinWP * cosI),
    y: r * (sinO * cosWP + cosO * sinWP * cosI),
    z: r * (sinWP * sinI),
  }
}

function eclipticToEquatorial(x: number, y: number, z: number, centuries: number) {
  const obliquity = (23.439291 - 0.0130042 * centuries) * DEG
  const xe = x
  const ye = y * Math.cos(obliquity) - z * Math.sin(obliquity)
  const ze = y * Math.sin(obliquity) + z * Math.cos(obliquity)
  return {
    rightAscension: normalizeDegrees(Math.atan2(ye, xe) * RAD),
    declination: Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) * RAD,
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
  let azimuth = Math.atan2(y, x) * RAD + 180
  azimuth %= 360
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
