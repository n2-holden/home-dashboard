# Build for Home Assistant (/local/home-dashboard/) and upload via SCP.
# Prerequisites: SSH add-on running on HA, OpenSSH client on Windows (scp/ssh).
#
# Usage:
#   1. Copy deploy.env.example → deploy.env and edit HA_HOST / HA_USER
#   2. npm run deploy

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envFile = Join-Path $root 'deploy.env'
if (-not (Test-Path $envFile)) {
  Write-Error "Missing deploy.env. Copy deploy.env.example to deploy.env and set HA_HOST."
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

if (-not $env:HA_HOST) { Write-Error 'HA_HOST is required in deploy.env' }
if (-not $env:HA_USER) { $env:HA_USER = 'root' }
if (-not $env:HA_PATH) { $env:HA_PATH = '/config/www/home-dashboard' }
if (-not $env:HA_PORT) { $env:HA_PORT = '22' }

Write-Host "Building for Home Assistant (base=/local/home-dashboard/)..."
npm run build:ha
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$target = "$($env:HA_USER)@$($env:HA_HOST)"
$sshArgs = @('-p', $env:HA_PORT)
$scpArgs = @('-P', $env:HA_PORT)

Write-Host "Ensuring remote directory $($env:HA_PATH) on $target..."
ssh @sshArgs $target "mkdir -p $($env:HA_PATH)"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Uploading dist/ → ${target}:$($env:HA_PATH)/"
# Clear old assets so renamed hashed files don't pile up
ssh @sshArgs $target "rm -rf $($env:HA_PATH)/*"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

scp @scpArgs -r dist/* "${target}:$($env:HA_PATH)/"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Deployed. Use this exact URL (index.html is required - a trailing slash alone 404s):"
Write-Host "  http://$($env:HA_HOST):8123/local/home-dashboard/index.html"
Write-Host ""
Write-Host "In HA Webpage dashboard, set URL to exactly:"
Write-Host "  /local/home-dashboard/index.html"
Write-Host ""
Write-Host "If you still get 404, on the Pi check that these exist:"
Write-Host "  $($env:HA_PATH)/index.html"
Write-Host "  $($env:HA_PATH)/assets/"
