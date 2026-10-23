/**
 * npm run deploy: Windows PowerShell on the PC (Samba), PowerShell 7 (pwsh) on the HA box add-on.
 *
 * Refuses to deploy when this copy is missing commits that are on GitHub, so an out-of-date
 * copy (PC or HA add-on) can't roll the live dashboard back. Set DEPLOY_SKIP_GIT_CHECK=1 to bypass.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptsDir, '..')

function git(args, timeout = 30_000) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout })
  return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() }
}

function checkUpToDate() {
  if (process.env.DEPLOY_SKIP_GIT_CHECK === '1') {
    console.warn('DEPLOY_SKIP_GIT_CHECK=1: skipping the GitHub up-to-date check.')
    return true
  }
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch.ok || branch.out === 'HEAD') {
    console.warn('Not on a git branch; skipping the GitHub up-to-date check.')
    return true
  }
  const fetch = git(['fetch', '--quiet', 'origin', branch.out], 60_000)
  if (!fetch.ok) {
    console.error(`Could not fetch origin/${branch.out} to confirm this copy is up to date.`)
    console.error(fetch.err || 'git fetch failed')
    console.error('Fix network/GitHub access, or set DEPLOY_SKIP_GIT_CHECK=1 to deploy anyway.')
    return false
  }
  const behind = git(['rev-list', '--count', `HEAD..origin/${branch.out}`])
  const count = Number(behind.out)
  if (!behind.ok || !Number.isFinite(count)) {
    console.error(`Could not compare HEAD with origin/${branch.out}: ${behind.err}`)
    return false
  }
  if (count > 0) {
    const missing = git(['log', '--oneline', `HEAD..origin/${branch.out}`]).out
    console.error(
      `\nDeploy stopped: this copy is ${count} commit(s) behind origin/${branch.out}.` +
        '\nDeploying now would roll the live dashboard back. Missing commits:\n',
    )
    console.error(missing)
    console.error(
      `\nCommit your changes, run: git pull --rebase origin ${branch.out}` +
        '\nthen run npm run deploy again (and git push when done).',
    )
    return false
  }
  return true
}

if (!checkUpToDate()) process.exit(1)

const script = join(scriptsDir, 'deploy-ha.ps1')
const shell = process.platform === 'win32' ? 'powershell' : 'pwsh'
const result = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
  stdio: 'inherit',
})
if (result.error) {
  console.error(`Could not start ${shell}: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
