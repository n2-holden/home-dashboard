# Fetch Homebridge schedule and write public/shade-schedule-today.json (+ .html backup).
param(
  [string]$SourceUrl = 'http://homebridge.local:8787/'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:HOMEBRIDGE_SCHEDULE_URL = $SourceUrl
node scripts/sync-shade-schedule.mjs
