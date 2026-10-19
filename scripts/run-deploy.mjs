/**
 * npm run deploy: Windows PowerShell on the PC (Samba), PowerShell 7 (pwsh) on the HA box add-on.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), 'deploy-ha.ps1')
const shell = process.platform === 'win32' ? 'powershell' : 'pwsh'
const result = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
  stdio: 'inherit',
})
if (result.error) {
  console.error(`Could not start ${shell}: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
