export type FloorId = 'top' | 'main' | 'basement'

export type Shade = {
  id: string
  name: string
  floor: FloorId
  group: string
  /** 0 = fully open, 100 = fully closed */
  position: number
}

export type ShadeFloor = {
  id: FloorId
  label: string
  groups: string[]
}

export type AreaId = 'shades' | 'solar-thermal' | 'hvac' | 'lights'

export type AreaMeta = {
  id: AreaId
  label: string
  blurb: string
  path: string
  ready: boolean
}

export const AREAS: AreaMeta[] = [
  {
    id: 'shades',
    label: 'Shades',
    blurb: 'Open, close, and set positions',
    path: '/shades',
    ready: true,
  },
  {
    id: 'solar-thermal',
    label: 'Solar Thermal',
    blurb: 'Zynect temps, mode, and history',
    path: '/solar-thermal',
    ready: true,
  },
  {
    id: 'hvac',
    label: 'HVAC',
    blurb: 'Nest thermostats and heating status',
    path: '/hvac',
    ready: true,
  },
  {
    id: 'lights',
    label: 'Lights',
    blurb: 'Scenes coming soon',
    path: '/lights',
    ready: false,
  },
]

export const SHADE_FLOORS: ShadeFloor[] = [
  {
    id: 'top',
    label: 'Top floor',
    groups: ['Master Suite', 'East bedroom', 'North bedroom'],
  },
  {
    id: 'main',
    label: 'Main floor',
    groups: ['Living room', 'Dining room', 'Kitchen'],
  },
  {
    id: 'basement',
    label: 'Basement',
    groups: ['Basement'],
  },
]

function shade(
  floor: FloorId,
  group: string,
  name: string,
  position: number,
): Shade {
  const slug = `${floor}-${group}-${name}`
    .toLowerCase()
    .replace(/#/g, 'num-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return { id: `shade-${slug}`, name, floor, group, position }
}

export const INITIAL_SHADES: Shade[] = [
  // Top floor — Master Suite
  shade('top', 'Master Suite', 'East 1-3', 40),
  shade('top', 'Master Suite', 'South', 20),
  shade('top', 'Master Suite', 'Southwest', 55),
  shade('top', 'Master Suite', 'Door', 100),

  // Top floor — East bedroom
  shade('top', 'East bedroom', 'Northeast', 15),
  shade('top', 'East bedroom', 'East', 25),
  shade('top', 'East bedroom', 'Southeast', 30),
  shade('top', 'East bedroom', 'South', 10),

  // Top floor — North bedroom
  shade('top', 'North bedroom', 'East', 70),
  shade('top', 'North bedroom', 'West', 65),

  // Main floor — Living room
  shade('main', 'Living room', 'North', 45),
  shade('main', 'Living room', 'East 1', 50),
  shade('main', 'Living room', 'East 2', 50),
  shade('main', 'Living room', 'Door', 0),

  // Main floor — Dining room
  shade('main', 'Dining room', 'East', 60),
  shade('main', 'Dining room', 'Southeast', 55),
  shade('main', 'Dining room', 'South', 40),

  // Main floor — Kitchen
  shade('main', 'Kitchen', 'East 1', 0),
  shade('main', 'Kitchen', 'East 2', 0),
  shade('main', 'Kitchen', 'East 3', 5),
  shade('main', 'Kitchen', 'Door', 0),
  shade('main', 'Kitchen', 'East #2', 10),
  shade('main', 'Kitchen', 'Southeast', 15),
  shade('main', 'Kitchen', 'South #1', 20),
  shade('main', 'Kitchen', 'Southwest', 25),
  shade('main', 'Kitchen', 'West #1', 30),
  shade('main', 'Kitchen', 'South #2', 20),
  shade('main', 'Kitchen', 'West #2', 35),

  // Basement
  shade('basement', 'Basement', 'Door', 100),
]

export function shadeLabel(position: number): string {
  if (position <= 5) return 'Open'
  if (position >= 95) return 'Closed'
  return `${position}% closed`
}

export function shadeSummary(shades: Shade[]): string {
  const closed = shades.filter((s) => s.position >= 95).length
  const open = shades.filter((s) => s.position <= 5).length
  const partial = shades.length - closed - open
  if (partial === 0 && closed === 0) return 'All open'
  if (partial === 0 && open === 0) return 'All closed'
  const parts: string[] = []
  if (open) parts.push(`${open} open`)
  if (partial) parts.push(`${partial} partial`)
  if (closed) parts.push(`${closed} closed`)
  return parts.join(' · ')
}

export function shadesForFloor(shades: Shade[], floorId: FloorId): Shade[] {
  return shades.filter((s) => s.floor === floorId)
}

export function shadesForGroup(
  shades: Shade[],
  floorId: FloorId,
  group: string,
): Shade[] {
  return shades.filter((s) => s.floor === floorId && s.group === group)
}
