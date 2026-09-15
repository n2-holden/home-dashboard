/**
 * Azimuthal sky projection adapted from
 * DataAcquisitionLib/Plot/SkyChart.cs (AE.Plot.SkyChart.ToScreen, Flat=false).
 *
 * Azimuth: 0° north, 90° east, 180° south, 270° west (degrees).
 * Elevation: degrees above horizon.
 */

export type SkyChartOptions = {
  width: number
  height: number
  /** Center of view in degrees. Default 180 = looking south. */
  viewDirectionDeg?: number
  /** Horizontal half-width of the view in degrees. Default 90. */
  hRangeDeg?: number
  /** Vertical view from horizon in degrees. Default 80. */
  vRangeDeg?: number
  /** Fraction of the canvas used by the sky. Default 1 = fill width. */
  skyMargin?: number
}

export type SkyPoint = { x: number; y: number }

export type SkyProjector = {
  width: number
  height: number
  viewDirectionDeg: number
  hRangeDeg: number
  vRangeDeg: number
  /** Project az/el (degrees). Null when outside the visible sky disk. */
  toScreen: (azimuthDeg: number, elevationDeg: number) => SkyPoint | null
  /** Same projection without the disk clip (for path continuity checks). */
  toScreenUnclipped: (azimuthDeg: number, elevationDeg: number) => SkyPoint | null
}

const DEG = Math.PI / 180

export function createSkyProjector(options: SkyChartOptions): SkyProjector | null {
  const width = options.width
  const height = options.height
  if (!(width > 0) || !(height > 0)) return null

  const viewDirectionDeg = options.viewDirectionDeg ?? 180
  const hRangeDeg = options.hRangeDeg ?? 90
  const vRangeDeg = options.vRangeDeg ?? 80
  const skyMargin = options.skyMargin ?? 1

  let hScale = 1
  let vScale = 1

  const project = (azimuthDeg: number, elevationDeg: number): SkyPoint | null => {
    const az = azimuthDeg * DEG
    const el = elevationDeg * DEG
    const raw = azimuthalProject(az, el, viewDirectionDeg, hScale, vScale, width, height)
    if (!raw) return null
    return raw.point
  }

  // Match SkyChart.SetScales: measure with unit scales, then fit to canvas.
  const left = project(viewDirectionDeg - hRangeDeg, 0)
  const right = project(viewDirectionDeg + hRangeDeg, 0)
  const top = project(viewDirectionDeg, vRangeDeg)
  const bottom = project(viewDirectionDeg, 0)
  if (!left || !right || !top || !bottom) return null

  const dx = right.x - left.x
  const dy = top.y - bottom.y
  if (Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6) return null

  // Fill the full width; keep a small vertical inset so labels at the top aren't clipped.
  hScale = (skyMargin * width) / dx
  vScale = (-0.96 * height) / dy

  // After scaling, nudge horizontally so the horizon endpoints sit on the left/right edges.
  const left2 = project(viewDirectionDeg - hRangeDeg, 0)
  const right2 = project(viewDirectionDeg + hRangeDeg, 0)
  const xOffset =
    left2 && right2 ? (width - (right2.x + left2.x)) / 2 : 0

  const toScreenUnclipped = (azimuthDeg: number, elevationDeg: number): SkyPoint | null => {
    const raw = azimuthalProject(
      azimuthDeg * DEG,
      elevationDeg * DEG,
      viewDirectionDeg,
      hScale,
      vScale,
      width,
      height,
    )
    if (!raw) return null
    return { x: raw.point.x + xOffset, y: raw.point.y }
  }

  const toScreen = (azimuthDeg: number, elevationDeg: number): SkyPoint | null => {
    const raw = azimuthalProject(
      azimuthDeg * DEG,
      elevationDeg * DEG,
      viewDirectionDeg,
      hScale,
      vScale,
      width,
      height,
    )
    if (!raw || !raw.inDisk) return null
    return { x: raw.point.x + xOffset, y: raw.point.y }
  }

  return {
    width,
    height,
    viewDirectionDeg,
    hRangeDeg,
    vRangeDeg,
    toScreen,
    toScreenUnclipped,
  }
}

function azimuthalProject(
  azRad: number,
  elRad: number,
  viewDirectionDeg: number,
  hScale: number,
  vScale: number,
  width: number,
  height: number,
): { point: SkyPoint; inDisk: boolean } | null {
  // From SkyChart.ToScreen (Azimuthal Projection / IRSA Aitoff-like form).
  let viewAz = azRad - viewDirectionDeg * DEG
  while (viewAz < -Math.PI) viewAz += 2 * Math.PI
  while (viewAz > Math.PI) viewAz -= 2 * Math.PI

  const rho = Math.acos(clamp(Math.cos(elRad) * Math.cos(viewAz / 2), -1, 1))
  let z = Math.cos(elRad) * Math.sin(viewAz / 2) / Math.sin(rho)
  if (!Number.isFinite(z)) z = 0
  const theta =
    z < -1 ? -Math.PI / 2 : z > 1 ? Math.PI / 2 : Math.asin(z)

  const x = hScale * Math.sin(rho / 2) * Math.sin(theta)
  const sign = elRad < 0 ? -1 : 1
  const y = sign * vScale * Math.sin(rho / 2) * Math.cos(theta)

  const point = {
    x: x + width / 2,
    y: height - y,
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null

  const ux = x / (width / 2)
  const uy = (y / height) * 0.95
  const d = Math.sqrt(ux * ux + uy * uy)
  return { point, inDisk: d <= 1 }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Normalize angle difference into [-180, 180]. */
export function shortestAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180
}

/**
 * Half-width (degrees) needed to fit today's sun path in the view.
 * Uses consecutive azimuth unwrapping (shortest-angle-to-origin breaks once the
 * day arc exceeds 180°). Capped near 90° — wider values break this projection.
 */
export function sunPathHalfSpanDeg(
  when: Date,
  latitudeDeg: number,
  longitudeDeg: number,
  solarElevationDegrees: (when: Date, lat: number, lon: number) => number,
  solarAzimuthDegrees: (when: Date, lat: number, lon: number) => number,
  options?: {
    minHalfSpanDeg?: number
    maxHalfSpanDeg?: number
    paddingDeg?: number
    sampleMinutes?: number
  },
): number {
  const minHalf = options?.minHalfSpanDeg ?? 90
  const maxHalf = options?.maxHalfSpanDeg ?? 90
  const padding = options?.paddingDeg ?? 4
  const step = options?.sampleMinutes ?? 5
  const dayStart = new Date(when.getTime())
  dayStart.setHours(0, 0, 0, 0)

  const azimuths: number[] = []
  for (let minute = 0; minute < 24 * 60; minute += step) {
    const sampleAt = new Date(dayStart.getTime() + minute * 60_000)
    const elevation = solarElevationDegrees(sampleAt, latitudeDeg, longitudeDeg)
    if (elevation <= 0) continue
    azimuths.push(solarAzimuthDegrees(sampleAt, latitudeDeg, longitudeDeg))
  }
  if (azimuths.length === 0) return minHalf

  let unwrapped = azimuths[0]
  let minU = unwrapped
  let maxU = unwrapped
  for (let i = 1; i < azimuths.length; i++) {
    unwrapped += shortestAngleDeltaDeg(azimuths[i - 1], azimuths[i])
    minU = Math.min(minU, unwrapped)
    maxU = Math.max(maxU, unwrapped)
  }
  const half = (maxU - minU) / 2 + padding
  return Math.max(minHalf, Math.min(maxHalf, Math.ceil(half)))
}

/** Polyline segments for an azimuth ray from horizon to vRange. */
export function azimuthGridSegments(
  projector: SkyProjector,
  azimuthDeg: number,
  stepDeg = 2.5,
): SkyPoint[] {
  const points: SkyPoint[] = []
  for (let el = 0; el <= projector.vRangeDeg + 1e-6; el += stepDeg) {
    const p = projector.toScreenUnclipped(azimuthDeg, el)
    if (p) points.push(p)
  }
  return points
}

/** Polyline segments for an elevation arc across the view. */
export function elevationGridSegments(
  projector: SkyProjector,
  elevationDeg: number,
  stepDeg = 2,
): SkyPoint[] {
  const points: SkyPoint[] = []
  const start = projector.viewDirectionDeg - projector.hRangeDeg
  const stop = projector.viewDirectionDeg + projector.hRangeDeg
  for (let az = start; az <= stop + 1e-6; az += stepDeg) {
    const p = projector.toScreenUnclipped(az, elevationDeg)
    if (p) points.push(p)
  }
  return points
}

export function pointsToSvgPath(points: SkyPoint[]): string {
  if (points.length === 0) return ''
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
}

/**
 * Split a day path into SVG path strings, breaking when the projection jumps
 * (same idea as SkyChart.DrawSunPath maxJump).
 */
export function pathSegmentsToSvg(
  points: Array<SkyPoint | null>,
  maxJumpPx: number,
): string[] {
  const paths: string[] = []
  let current: SkyPoint[] = []
  let last: SkyPoint | null = null

  const flush = () => {
    if (current.length >= 2) paths.push(pointsToSvgPath(current))
    current = []
  }

  for (const point of points) {
    if (!point) {
      flush()
      last = null
      continue
    }
    if (last && Math.abs(point.x - last.x) > maxJumpPx) flush()
    current.push(point)
    last = point
  }
  flush()
  return paths
}

export function cardinalLabel(azimuthDeg: number): string | null {
  const az = ((Math.round(azimuthDeg) % 360) + 360) % 360
  if (az === 0) return 'N'
  if (az === 90) return 'E'
  if (az === 180) return 'S'
  if (az === 270) return 'W'
  return null
}
