# Build and deploy to Home Assistant via Samba share (\\homeassistant.local\config).
# This is the reliable deploy path on Windows when SSH/scp is not set up.
#
# Usage:
#   1. Copy deploy.env.example to deploy.env
#   2. Put your token in ha-config.json at the project root (gitignored)
#   3. npm run deploy

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envFile = Join-Path $root 'deploy.env'
if (-not (Test-Path $envFile)) {
  Write-Error 'Missing deploy.env. Copy deploy.env.example to deploy.env and set HA_SHARE.'
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $parts = $line.Split('=', 2)
  if ($parts.Length -ne 2) { return }
  $name = $parts[0].Trim()
  $value = $parts[1].Trim().Trim('"').Trim("'")
  Set-Item -Path "Env:$name" -Value $value
}

if (-not $env:HA_SHARE) { $env:HA_SHARE = '\\homeassistant.local\config' }
if (-not $env:HA_WWW) { $env:HA_WWW = 'www\home-dashboard' }
if (-not $env:HA_COMPONENTS) { $env:HA_COMPONENTS = 'custom_components' }

$shareRoot = $env:HA_SHARE.TrimEnd('\')
$wwwPath = Join-Path $shareRoot $env:HA_WWW
$componentsPath = Join-Path $shareRoot $env:HA_COMPONENTS
$syncPath = Join-Path $shareRoot 'dashboard_sync'
$distPath = Join-Path $root 'dist'
$publicPath = Join-Path $root 'public'
$localComponents = Join-Path $root 'homeassistant\custom_components'
$localSync = Join-Path $root 'homeassistant\dashboard_sync'

function Test-HaConfigHasToken {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $false }
  try {
    $cfg = Get-Content $Path -Raw | ConvertFrom-Json
    return [bool]($cfg.token -and [string]$cfg.token.Trim())
  } catch {
    return $false
  }
}

Write-Host "Checking Samba share: $shareRoot"
if (-not (Test-Path $shareRoot)) {
  Write-Error "Cannot reach $shareRoot. Enable Samba on HA (Settings > System > Storage) or set HA_SHARE in deploy.env."
}

Write-Host "Building for Home Assistant..."
npm run build:ha
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path $distPath)) {
  Write-Error "Build output missing: $distPath"
}

# Never mirror these from dist — they are owned by the HA box (or project-root ha-config.json).
$protectedFiles = @(
  'ha-config.json',
  'pv-cache.json',
  'shed-cache.json',
  'shades-cache.json',
  'shade-map.json',
  'energy-map.json',
  'pool-map.json',
  'pond-map.json',
  'zynect-config.json'
)
$backupDir = Join-Path $env:TEMP ("ha-deploy-backup-" + [guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

Write-Host "Deploying dashboard to $wwwPath"
New-Item -ItemType Directory -Force -Path $wwwPath | Out-Null

foreach ($file in $protectedFiles) {
  $live = Join-Path $wwwPath $file
  if (Test-Path $live) {
    Copy-Item -Path $live -Destination (Join-Path $backupDir $file) -Force
  }
}

$xfArgs = $protectedFiles | ForEach-Object { '/XF', $_ }
robocopy $distPath $wwwPath /MIR /Z /R:2 /W:3 /NFL /NDL /NJH /NJS /nc /ns /np @xfArgs | Out-Null
$rcDashboard = $LASTEXITCODE
if ($rcDashboard -ge 8) {
  Write-Error "robocopy dashboard failed with exit code $rcDashboard"
}

foreach ($file in $protectedFiles) {
  $backup = Join-Path $backupDir $file
  $dst = Join-Path $wwwPath $file
  if (Test-Path $backup) {
    Copy-Item -Path $backup -Destination $dst -Force
    Write-Host "  Protected: $file (restored after deploy)"
  }
}
Remove-Item -Path $backupDir -Recurse -Force -ErrorAction SilentlyContinue

# Seed runtime cache placeholders only when missing on HA (never overwrite live data).
foreach ($file in @('pv-cache.json', 'shed-cache.json', 'shades-cache.json')) {
  $dst = Join-Path $wwwPath $file
  if (-not (Test-Path $dst)) {
    $src = Join-Path $publicPath $file
    if (Test-Path $src) {
      Copy-Item -Path $src -Destination $dst -Force
      Write-Host "  Config: $file (seed placeholder)"
    }
  }
}

# User-owned maps and credentials — seed from public/ only when missing on HA.
$userConfigFiles = @(
  'shade-map.json',
  'energy-map.json',
  'pool-map.json',
  'pond-map.json',
  'zynect-config.json'
)
foreach ($file in $userConfigFiles) {
  $dst = Join-Path $wwwPath $file
  if (Test-Path $dst) {
    Write-Host "  Config: $file (kept existing on HA)"
    continue
  }
  $src = Join-Path $publicPath $file
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination $dst -Force
    Write-Host "  Config: $file (seed from public)"
  }
}

# Generated / synced artifacts — always refresh from public/ on deploy.
$deployConfigFiles = @(
  'shade-schedule-today.json',
  'shade-schedule-map.json',
  'shade-schedules.json',
  'homebridge-schedule.json'
)
foreach ($file in $deployConfigFiles) {
  $src = Join-Path $publicPath $file
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination (Join-Path $wwwPath $file) -Force
    Write-Host "  Config: $file"
  }
}

# Seed ha-config.json only when HA copy is missing or has no token.
$haConfigDst = Join-Path $wwwPath 'ha-config.json'
if (-not (Test-HaConfigHasToken $haConfigDst)) {
  $seeded = $false
  foreach ($candidate in @(
      (Join-Path $root 'ha-config.json'),
      (Join-Path $publicPath 'ha-config.example.json')
    )) {
    if (Test-HaConfigHasToken $candidate) {
      Copy-Item -Path $candidate -Destination $haConfigDst -Force
      Write-Host '  Config: ha-config.json (deployed from project ha-config.json)'
      $seeded = $true
      break
    }
  }
  if (-not $seeded -and -not (Test-Path $haConfigDst)) {
    Copy-Item -Path (Join-Path $publicPath 'ha-config.example.json') -Destination $haConfigDst -Force
    Write-Host '  Config: ha-config.json (template - add token on HA or in project ha-config.json)'
  } elseif (-not $seeded) {
    Write-Host '  WARN: ha-config.json on HA has no token — add one and it will survive future deploys'
  }
} else {
  Write-Host '  Config: ha-config.json (kept existing token on HA)'
}

Write-Host "Deploying custom components to $componentsPath"
foreach ($component in @('alsoenergy', 'enphase_powerpack')) {
  $src = Join-Path $localComponents $component
  $dst = Join-Path $componentsPath $component
  if (-not (Test-Path $src)) { continue }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  robocopy $src $dst /MIR /Z /R:2 /W:3 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  $rc = $LASTEXITCODE
  if ($rc -ge 8) {
    Write-Error "robocopy $component failed with exit code $rc"
  }
  Write-Host "  Component: $component"
}

Write-Host "Deploying dashboard_sync to $syncPath"
if (Test-Path $localSync) {
  New-Item -ItemType Directory -Force -Path $syncPath | Out-Null
  robocopy $localSync $syncPath /MIR /Z /R:2 /W:3 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  $rcSync = $LASTEXITCODE
  if ($rcSync -ge 8) {
    Write-Error "robocopy dashboard_sync failed with exit code $rcSync"
  }
}

$localPackages = Join-Path $root 'homeassistant\packages'
$packagesPath = Join-Path $shareRoot 'packages'
if (Test-Path $localPackages) {
  Write-Host "Deploying HA packages to $packagesPath"
  New-Item -ItemType Directory -Force -Path $packagesPath | Out-Null
  robocopy $localPackages $packagesPath /Z /R:2 /W:3 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  $rcPkg = $LASTEXITCODE
  if ($rcPkg -ge 8) {
    Write-Error "robocopy packages failed with exit code $rcPkg"
  }
}

$localSnippets = Join-Path $root 'homeassistant\snippets'
$snippetsPath = Join-Path $shareRoot 'dashboard_snippets'
if (Test-Path $localSnippets) {
  Write-Host "Deploying dashboard_snippets to $snippetsPath"
  New-Item -ItemType Directory -Force -Path $snippetsPath | Out-Null
  robocopy $localSnippets $snippetsPath /Z /R:2 /W:3 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  $rcSnip = $LASTEXITCODE
  if ($rcSnip -ge 8) {
    Write-Error "robocopy dashboard_snippets failed with exit code $rcSnip"
  }
}

Write-Host ''
Write-Host 'Verify on HA:'
$checks = @(
  (Join-Path $wwwPath 'index.html'),
  (Join-Path $wwwPath 'assets'),
  (Join-Path $wwwPath 'shade-map.json'),
  (Join-Path $componentsPath 'alsoenergy\manifest.json')
)
foreach ($path in $checks) {
  if (Test-Path $path) {
    $item = Get-Item $path
    $label = if ($item.PSIsContainer) { "$path\" } else { $path }
    Write-Host "  OK  $label  ($($item.LastWriteTime))"
  } else {
    Write-Host "  MISSING  $path"
  }
}

$versionFile = Join-Path $wwwPath 'version.json'
if (Test-Path $versionFile) {
  Write-Host ''
  Write-Host 'Dashboard version:'
  Get-Content $versionFile
}

Write-Host ''
Write-Host 'Deployed via Samba.'
Write-Host '  Local:  http://homeassistant.local:8123/local/home-dashboard/index.html'
Write-Host '  Remote: https://<your-nabu-casa-id>.ui.nabu.casa/local/home-dashboard/index.html'
Write-Host ''
Write-Host 'After custom component changes: restart Home Assistant (not just reload).'
Write-Host 'Token lives in project ha-config.json (gitignored) and is preserved on HA during deploy.'
Write-Host 'User config (shade/energy/pool/pond maps, zynect-config) is never overwritten on HA — edit on HA or export from Settings.'
