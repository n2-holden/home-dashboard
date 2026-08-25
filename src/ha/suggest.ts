import type { Shade } from '../data/types'
import type { HaCover } from './positions'

/** Suggest a cover entity for a shade by matching friendly names. */
export function suggestCover(shade: Shade, covers: HaCover[]): string | null {
  if (covers.length === 0) return null

  const needles = [
    `${shade.group} ${shade.name}`,
    `${shade.name} ${shade.group}`,
    shade.name,
  ].map(normalize)

  let best: { id: string; score: number } | null = null
  for (const cover of covers) {
    const hay = normalize(cover.name)
    const hayId = normalize(cover.entityId.replace(/^cover\./, ''))
    for (const needle of needles) {
      const score = matchScore(needle, hay) + matchScore(needle, hayId) * 0.8
      if (!best || score > best.score) best = { id: cover.entityId, score }
    }
  }

  return best && best.score >= 0.45 ? best.id : null
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchScore(needle: string, hay: string): number {
  if (!needle || !hay) return 0
  if (hay === needle) return 1
  if (hay.includes(needle) || needle.includes(hay)) return 0.85
  const nParts = needle.split(' ').filter(Boolean)
  const hParts = new Set(hay.split(' ').filter(Boolean))
  if (nParts.length === 0) return 0
  const hits = nParts.filter((p) => hParts.has(p)).length
  return hits / nParts.length
}
