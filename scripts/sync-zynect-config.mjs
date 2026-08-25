/**
 * Copy Zynect credentials from the desktop app (%AppData%\ZynectDashboard\settings.json)
 * into public/zynect-config.json for HA deploy (local + remote).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const publicDir = join(root, 'public')
const outPath = join(publicDir, 'zynect-config.json')
const examplePath = join(publicDir, 'zynect-config.example.json')

const wpfSettingsPath = join(
  process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
  'ZynectDashboard',
  'settings.json',
)

function fromWpfSettings(raw) {
  return {
    baseUrl: raw.BaseUrl ?? 'https://zynect.com/api/v2/',
    authHeaderName: raw.AuthHeaderName ?? 'Authorization',
    authHeaderValue: typeof raw.AuthHeaderValue === 'string' ? raw.AuthHeaderValue.trim() : '',
    product: raw.Product ?? 'thermote',
    refreshIntervalSeconds:
      typeof raw.RefreshIntervalSeconds === 'number' && raw.RefreshIntervalSeconds > 0
        ? raw.RefreshIntervalSeconds
        : 30,
    siteLatitude: typeof raw.SiteLatitude === 'number' ? raw.SiteLatitude : 40.019,
    siteLongitude: typeof raw.SiteLongitude === 'number' ? raw.SiteLongitude : -105.2747,
  }
}

function main() {
  mkdirSync(publicDir, { recursive: true })

  if (existsSync(wpfSettingsPath)) {
    try {
      const raw = JSON.parse(readFileSync(wpfSettingsPath, 'utf8'))
      const config = fromWpfSettings(raw)
      writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
      const hasToken = Boolean(config.authHeaderValue)
      console.log(
        `[sync-zynect-config] Wrote ${outPath}${hasToken ? ' (with credentials)' : ' (no auth token in WPF settings)'}`,
      )
      return
    } catch (err) {
      console.warn(`[sync-zynect-config] Could not read WPF settings: ${err.message}`)
    }
  }

  if (existsSync(outPath)) {
    console.log(`[sync-zynect-config] Keeping existing ${outPath}`)
    return
  }

  if (existsSync(examplePath)) {
    copyFileSync(examplePath, outPath)
    console.log(`[sync-zynect-config] Created ${outPath} from example (add auth token before deploy)`)
    return
  }

  const fallback = {
    baseUrl: 'https://zynect.com/api/v2/',
    authHeaderName: 'Authorization',
    authHeaderValue: '',
    product: 'thermote',
    refreshIntervalSeconds: 30,
    siteLatitude: 40.019,
    siteLongitude: -105.2747,
  }
  writeFileSync(outPath, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8')
  console.log(`[sync-zynect-config] Created default ${outPath}`)
}

main()
