/**
 * Fetch Homebridge shade schedule HTML and write parsed JSON (+ HTML backup) to public/.
 * Used by `npm run build:ha` so schedules ship with every deploy.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const publicDir = join(root, 'public')

const sourceUrl = process.env.HOMEBRIDGE_SCHEDULE_URL ?? 'http://homebridge.local:8787/schedule.json'
const jsonPath = join(publicDir, 'shade-schedule-today.json')
const htmlPath = join(publicDir, 'shade-schedule-today.html')

function normalizeTime(value) {
  const [h, m] = value.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function parseScheduleHtml(html) {
  const shades = []
  const rowRe =
    /<tr>\s*<td>[\s\S]*?<b>([^<]+)<\/b>[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi
  let match
  while ((match = rowRe.exec(html)) !== null) {
    const name = match[1].trim()
    if (!name || name === 'undefined') continue
    const cell = match[2]
    if (/no sun through window/i.test(cell)) {
      shades.push({ name, closes: [], opens: [] })
      continue
    }
    const closes = []
    const opens = []
    const blockRe = /CLOSE\s+(\d{1,2}:\d{2})\s*→\s*OPEN\s+(\d{1,2}:\d{2})/gi
    let block
    while ((block = blockRe.exec(cell)) !== null) {
      closes.push(normalizeTime(block[1]))
      opens.push(normalizeTime(block[2]))
    }
    if (closes.length === 0 && opens.length === 0) continue
    shades.push({ name, closes, opens })
  }
  return shades
}

async function main() {
  let html = null
  let source = sourceUrl

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('json') || sourceUrl.endsWith('.json')) {
      const data = await res.json()
      if (!Array.isArray(data.shades) || data.shades.length === 0) {
        throw new Error('JSON response has no shades')
      }
      writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      console.log(`[sync-shade-schedule] Fetched ${sourceUrl}`)
      console.log(`[sync-shade-schedule] Wrote ${data.shades.length} shades → ${jsonPath}`)
      return
    }
    html = await res.text()
    if (!html.includes('CLOSE') && !html.includes("Today's shade schedule")) {
      throw new Error('Response is not a shade schedule page')
    }
    writeFileSync(htmlPath, html, 'utf8')
    console.log(`[sync-shade-schedule] Fetched ${sourceUrl}`)
  } catch (err) {
    if (existsSync(htmlPath)) {
      html = readFileSync(htmlPath, 'utf8')
      source = 'existing html cache'
      console.warn(
        `[sync-shade-schedule] Could not reach Homebridge (${err.message}); using ${htmlPath}`,
      )
    } else if (existsSync(jsonPath)) {
      console.warn(
        `[sync-shade-schedule] Could not reach Homebridge (${err.message}); keeping existing ${jsonPath}`,
      )
      process.exit(0)
    } else {
      console.error(`[sync-shade-schedule] Failed: ${err.message}`)
      process.exit(1)
    }
  }

  const shades = parseScheduleHtml(html)
  if (shades.length === 0) {
    console.error('[sync-shade-schedule] Parsed 0 shades from schedule page')
    process.exit(1)
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source,
    shadeCount: shades.length,
    shades,
  }
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[sync-shade-schedule] Wrote ${shades.length} shades → ${jsonPath}`)
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).replace(/\\/g, '/') ===
    process.argv[1].replace(/\\/g, '/')

if (isMain) {
  main()
}
