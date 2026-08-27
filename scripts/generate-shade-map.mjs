import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

/** Keep in sync with INITIAL_SHADES in src/data/types.ts */
const SHADES = [
  { id: 'shade-top-master-suite-east-1-3', group: 'Master Suite', name: 'East 1-3' },
  { id: 'shade-top-master-suite-south', group: 'Master Suite', name: 'South' },
  { id: 'shade-top-master-suite-southwest', group: 'Master Suite', name: 'Southwest' },
  { id: 'shade-top-master-suite-door', group: 'Master Suite', name: 'Door' },
  { id: 'shade-top-east-bedroom-northeast', group: 'East bedroom', name: 'Northeast' },
  { id: 'shade-top-east-bedroom-east', group: 'East bedroom', name: 'East' },
  { id: 'shade-top-east-bedroom-southeast', group: 'East bedroom', name: 'Southeast' },
  { id: 'shade-top-east-bedroom-south', group: 'East bedroom', name: 'South' },
  { id: 'shade-top-north-bedroom-east', group: 'North bedroom', name: 'East' },
  { id: 'shade-top-north-bedroom-west', group: 'North bedroom', name: 'West' },
  { id: 'shade-main-living-room-north', group: 'Living room', name: 'North' },
  { id: 'shade-main-living-room-east-1', group: 'Living room', name: 'East 1' },
  { id: 'shade-main-living-room-east-2', group: 'Living room', name: 'East 2' },
  { id: 'shade-main-living-room-door', group: 'Living room', name: 'Door' },
  { id: 'shade-main-dining-room-east', group: 'Dining room', name: 'East' },
  { id: 'shade-main-dining-room-southeast', group: 'Dining room', name: 'Southeast' },
  { id: 'shade-main-dining-room-south', group: 'Dining room', name: 'South' },
  { id: 'shade-main-kitchen-east-1', group: 'Kitchen', name: 'East 1' },
  { id: 'shade-main-kitchen-east-2', group: 'Kitchen', name: 'East 2' },
  { id: 'shade-main-kitchen-east-3', group: 'Kitchen', name: 'East 3' },
  { id: 'shade-main-kitchen-door', group: 'Kitchen', name: 'Door' },
  { id: 'shade-main-kitchen-east-num-2', group: 'Kitchen', name: 'East #2' },
  { id: 'shade-main-kitchen-southeast', group: 'Kitchen', name: 'Southeast' },
  { id: 'shade-main-kitchen-south-num-1', group: 'Kitchen', name: 'South #1' },
  { id: 'shade-main-kitchen-southwest', group: 'Kitchen', name: 'Southwest' },
  { id: 'shade-main-kitchen-west-num-1', group: 'Kitchen', name: 'West #1' },
  { id: 'shade-main-kitchen-south-num-2', group: 'Kitchen', name: 'South #2' },
  { id: 'shade-main-kitchen-west-num-2', group: 'Kitchen', name: 'West #2' },
  { id: 'shade-basement-basement-door', group: 'Basement', name: 'Door' },
]

const registryPath =
  process.env.HA_ENTITY_REGISTRY ??
  '\\\\homeassistant.local\\config\\.storage\\core.entity_registry'

const reg = JSON.parse(readFileSync(registryPath, 'utf8'))
const covers = reg.data.entities
  .filter((e) => e.entity_id.startsWith('cover.'))
  .map((e) => ({
    entityId: e.entity_id,
    name: e.original_name || e.entity_id.replace('cover.', ''),
  }))

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchScore(needle, hay) {
  if (!needle || !hay) return 0
  if (hay === needle) return 1
  if (hay.includes(needle) || needle.includes(hay)) return 0.85
  const nParts = needle.split(' ').filter(Boolean)
  const hParts = new Set(hay.split(' ').filter(Boolean))
  if (!nParts.length) return 0
  return nParts.filter((p) => hParts.has(p)).length / nParts.length
}

function suggestCover(shade, available) {
  const needles = [`${shade.group} ${shade.name}`, `${shade.name} ${shade.group}`, shade.name].map(
    normalize,
  )
  let best = null
  for (const cover of available) {
    const hay = normalize(cover.name)
    const hayId = normalize(cover.entityId.replace(/^cover\./, ''))
    for (const needle of needles) {
      const score = matchScore(needle, hay) + matchScore(needle, hayId) * 0.8
      if (!best || score > best.score) best = { id: cover.entityId, score }
    }
  }
  return best && best.score >= 0.45 ? best.id : null
}

const map = {}
const used = new Set()
for (const shade of SHADES) {
  const available = covers.filter((c) => !used.has(c.entityId))
  const entityId = suggestCover(shade, available)
  if (entityId) {
    map[shade.id] = entityId
    used.add(entityId)
  }
}

const outPath = process.argv[2] ?? join(root, 'public/shade-map.json')
writeFileSync(outPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
console.log(`Wrote ${Object.keys(map).length}/${SHADES.length} mappings → ${outPath}`)
