import type { FloorId, Shade } from './types'

export type ShadeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export const SHADE_DIRECTIONS: ReadonlyArray<{ id: ShadeDirection; label: string }> = [
  { id: 'n', label: 'N' },
  { id: 'ne', label: 'NE' },
  { id: 'e', label: 'E' },
  { id: 'se', label: 'SE' },
  { id: 's', label: 'S' },
  { id: 'sw', label: 'SW' },
  { id: 'w', label: 'W' },
  { id: 'nw', label: 'NW' },
]

export type DirectionStat = {
  direction: ShadeDirection
  label: string
  total: number
  closed: number
  closedRatio: number
}

function isShadeClosed(position: number): boolean {
  return position >= 95
}

const DOOR_DIRECTIONS: ReadonlyArray<{
  floor: FloorId
  group: string
  direction: ShadeDirection
}> = [
  { floor: 'top', group: 'Master Suite', direction: 's' },
  { floor: 'main', group: 'Living room', direction: 's' },
  { floor: 'basement', group: 'Basement', direction: 'e' },
]

/** Map a shade to a compass direction, including room-specific doors. */
export function resolveShadeDirection(shade: Shade): ShadeDirection | null {
  if (shade.name.trim().toLowerCase() === 'door') {
    return (
      DOOR_DIRECTIONS.find(
        (entry) => entry.floor === shade.floor && entry.group === shade.group,
      )?.direction ?? null
    )
  }
  return parseShadeDirection(shade.name)
}

/** Map a shade name to a compass direction, or null when not directional. */
export function parseShadeDirection(name: string): ShadeDirection | null {
  const text = name
    .toLowerCase()
    .replace(/#/g, '')
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text || text === 'door') return null

  if (/\bnorth\s*west\b|\bn\s*\/?\s*w\b|\bnw\b/.test(text)) return 'nw'
  if (/\bnorth\s*east\b|\bn\s*\/?\s*e\b|\bne\b/.test(text)) return 'ne'
  if (/\bsouth\s*west\b|\bs\s*\/?\s*w\b|\bsw\b/.test(text)) return 'sw'
  if (/\bsouth\s*east\b|\bs\s*\/?\s*e\b|\bse\b/.test(text)) return 'se'
  if (/\bnorth\b/.test(text)) return 'n'
  if (/\bsouth\b/.test(text)) return 's'
  if (/\bwest\b/.test(text)) return 'w'
  if (/\beast\b/.test(text)) return 'e'

  return null
}

export function floorDirectionStats(shades: Shade[], floorId: FloorId): DirectionStat[] {
  const byDirection = new Map<ShadeDirection, Shade[]>()
  for (const direction of SHADE_DIRECTIONS) {
    byDirection.set(direction.id, [])
  }

  for (const shade of shades) {
    if (shade.floor !== floorId) continue
    const direction = resolveShadeDirection(shade)
    if (!direction) continue
    byDirection.get(direction)?.push(shade)
  }

  return SHADE_DIRECTIONS.map(({ id, label }) => {
    const bucket = byDirection.get(id) ?? []
    const closed = bucket.filter((shade) => isShadeClosed(shade.position)).length
    const total = bucket.length
    return {
      direction: id,
      label,
      total,
      closed,
      closedRatio: total > 0 ? closed / total : 0,
    }
  })
}
