# Build and deploy to Home Assistant via Samba share (\\homeassistant.local\config).
# This is the reliable deploy path on Windows when SSH/scp is not set up.
#
# Usage:
#   1. Copy deploy.env.example to deploy.env
#   2. Put your token in ha-config.json at the project root (gitignored)
#   3. npm run deploy

$ErrorActionPreference = 'Stop'

# Resolve junctions (e.g. Projects → OneDrive) so Vite/Rollup see a real path.
# Building through a junction breaks Vite's HTML emit with relative ../../ paths.
$root = Split-Path -Parent $PSScriptRoot
$rootItem = Get-Item -LiteralPath $root
if ($rootItem.LinkType -and $rootItem.Target) {
  $target = $rootItem.Target
  if ($target -is [array]) { $target = $target[0] }
  $root = [string]$target
}
Set-Location -LiteralPath $root
Write-Host "Project root: $root"

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

# Never mirror these from dist - they are owned by the HA box (or project-root ha-config.json).
$protectedFiles = @(
  'ha-config.json',
  'pv-cache.json',
  'shed-cache.json',
  'shades-cache.json',
  'shade-map.json',
  'energy-map.json',
  'pool-map.json',
  'pond-map.json',
  'lights-map.json',
  'zynect-config.json',
  'egauge-live.json',
  'control-log.jsonl',
  'dashboard-settings.json',
  'device-comm-status.json',
  'device-comm-notify-state.json',
  'bathroom-fan-timers.json'
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
foreach ($file in @('pv-cache.json', 'shed-cache.json', 'shades-cache.json', 'egauge-live.json', 'device-comm-status.json', 'device-comm-notify-state.json', 'bathroom-fan-timers.json')) {
  $dst = Join-Path $wwwPath $file
  if (-not (Test-Path $dst)) {
    $src = Join-Path $publicPath $file
    if (Test-Path $src) {
      Copy-Item -Path $src -Destination $dst -Force
      Write-Host "  Config: $file (seed placeholder)"
    }
  }
}

# User-owned maps and credentials - seed from public/ only when missing on HA.
$userConfigFiles = @(
  'shade-map.json',
  'energy-map.json',
  'pool-map.json',
  'pond-map.json',
  'lights-map.json',
  'zynect-config.json',
  'dashboard-settings.json'
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

# Generated / synced artifacts - always refresh from public/ on deploy.
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
    Write-Host '  WARN: ha-config.json on HA has no token - add one and it will survive future deploys'
  }
} else {
  Write-Host '  Config: ha-config.json (kept existing token on HA)'
}

Write-Host "Deploying custom components to $componentsPath"
foreach ($component in @('alsoenergy', 'enphase_powerpack', 'egauge_live', 'doorbird_intercom')) {
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

# configuration.yaml does not include_dir packages, so wire the live eGauge
# sensor in explicitly. Do not include home-dashboard.yaml here - those
# helpers already live in configuration.yaml and would duplicate.
# Pool pump email alert is deployed into automations.yaml (see EnsurePoolPumpAlertAutomation).
$configYaml = Join-Path $shareRoot 'configuration.yaml'
$egaugeInclude = 'packages/egauge-live.yaml'
if (Test-Path $configYaml) {
  $configText = [System.IO.File]::ReadAllText($configYaml)
  if ($configText -notmatch [regex]::Escape($egaugeInclude)) {
    $utf8 = New-Object System.Text.UTF8Encoding $false
    $prefix = @"
homeassistant:
  packages:
    egauge_live: !include packages/egauge-live.yaml

"@
    [System.IO.File]::WriteAllText($configYaml, $prefix + $configText, $utf8)
    Write-Host "  Wired $egaugeInclude into configuration.yaml (restart HA to load it)"
  } else {
    Write-Host "  configuration.yaml already includes $egaugeInclude"
  }
}

function Ensure-YamlHelperKey {
  param(
    [string]$FilePath,
    [string]$SectionName,
    [string]$KeyName,
    [string]$HelperBlock,
    [string]$Label
  )
  if (-not (Test-Path $FilePath)) {
    Write-Host "  Skip $Label - $(Split-Path $FilePath -Leaf) missing"
    return
  }
  $text = [System.IO.File]::ReadAllText($FilePath)
  if ($text -match [regex]::Escape($KeyName)) {
    Write-Host "  $(Split-Path $FilePath -Leaf) already has $KeyName"
    return
  }
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $sectionPattern = "(?m)^${SectionName}:\s*\r?\n"
  $match = [regex]::Match($text, $sectionPattern)
  if ($match.Success) {
    $insertAt = $match.Index + $match.Length
    $updated = $text.Substring(0, $insertAt) + $HelperBlock + "`r`n" + $text.Substring($insertAt)
    [System.IO.File]::WriteAllText($FilePath, $updated, $utf8)
    Write-Host "  Added $KeyName under ${SectionName}: (restart HA to load it)"
  } else {
    $updated = $text.TrimEnd() + "`r`n`r`n${SectionName}:`r`n$HelperBlock`r`n"
    [System.IO.File]::WriteAllText($FilePath, $updated, $utf8)
    Write-Host "  Created ${SectionName}: with $KeyName (restart HA to load it)"
  }
}

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'pool_pump_off_email_enabled' -Label 'pool pump email boolean' -HelperBlock @"
  pool_pump_off_email_enabled:
    name: Pool pump stopped email
    icon: mdi:email-alert-outline
    initial: true
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'pool_pump_off_phone_enabled' -Label 'pool pump phone boolean' -HelperBlock @"
  pool_pump_off_phone_enabled:
    name: Pool pump stopped phone
    icon: mdi:cellphone-message
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'device_comm_failure_email_enabled' -Label 'device comm boolean' -HelperBlock @"
  device_comm_failure_email_enabled:
    name: Device communication failure email
    icon: mdi:lan-disconnect
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'device_comm_failure_phone_enabled' -Label 'device comm phone boolean' -HelperBlock @"
  device_comm_failure_phone_enabled:
    name: Device communication failure phone
    icon: mdi:cellphone-message
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'command_failed_email_enabled' -Label 'command failed boolean' -HelperBlock @"
  command_failed_email_enabled:
    name: Command failed email
    icon: mdi:alert-circle-outline
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'command_failed_phone_enabled' -Label 'command failed phone boolean' -HelperBlock @"
  command_failed_phone_enabled:
    name: Command failed phone
    icon: mdi:cellphone-message
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'pool_pump_auto_on_enabled' -Label 'pool pump auto-on boolean' -HelperBlock @"
  pool_pump_auto_on_enabled:
    name: Pool pump auto turn-on
    icon: mdi:pump
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'device_comm_failure_minutes' -Label 'device comm minutes' -HelperBlock @"
  device_comm_failure_minutes:
    name: Device communication failure minutes
    min: 1
    max: 1440
    step: 1
    unit_of_measurement: "min"
    mode: box
    initial: 15
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'doorbell_email_enabled' -Label 'doorbell alert boolean' -HelperBlock @"
  doorbell_email_enabled:
    name: Gate doorbell alert
    icon: mdi:doorbell
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'dashboard_calendar_reminder_dismissed' -Label 'calendar reminder dismissed boolean' -HelperBlock @"
  dashboard_calendar_reminder_dismissed:
    name: Calendar reminder dismissed
    icon: mdi:bell-cancel
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'dashboard_reminder_1_enabled' -Label 'reminder 1 enabled' -HelperBlock @"
  dashboard_reminder_1_enabled:
    name: Reminder 1 enabled
    icon: mdi:bell-ring
    initial: true
"@
Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'dashboard_reminder_1_active' -Label 'reminder 1 active' -HelperBlock @"
  dashboard_reminder_1_active:
    name: Reminder 1 active
    icon: mdi:bell-badge
    initial: false
"@
Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_text' -KeyName 'dashboard_reminder_1_message' -Label 'reminder 1 message' -HelperBlock @"
  dashboard_reminder_1_message:
    name: Reminder 1 message
    icon: mdi:message-text
    mode: text
    max: 64
    initial: Reminder
"@
Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_datetime' -KeyName 'dashboard_reminder_1_reset' -Label 'reminder 1 reset time' -HelperBlock @"
  dashboard_reminder_1_reset:
    name: Reminder 1 reset time
    icon: mdi:clock-outline
    has_date: false
    has_time: true
    initial: "03:00:00"
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'dashboard_reminder_2_enabled' -Label 'reminder 2 enabled' -HelperBlock @"
  dashboard_reminder_2_enabled:
    name: Reminder 2 enabled
    icon: mdi:bell-ring
    initial: false
"@
Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'dashboard_reminder_2_active' -Label 'reminder 2 active' -HelperBlock @"
  dashboard_reminder_2_active:
    name: Reminder 2 active
    icon: mdi:bell-badge
    initial: false
"@
Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_text' -KeyName 'dashboard_reminder_2_message' -Label 'reminder 2 message' -HelperBlock @"
  dashboard_reminder_2_message:
    name: Reminder 2 message
    icon: mdi:message-text
    mode: text
    max: 64
    initial: Reminder 2
"@
Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_datetime' -KeyName 'dashboard_reminder_2_reset' -Label 'reminder 2 reset time' -HelperBlock @"
  dashboard_reminder_2_reset:
    name: Reminder 2 reset time
    icon: mdi:clock-outline
    has_date: false
    has_time: true
    initial: "03:00:00"
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'doorbell_icon_minutes' -Label 'doorbell icon minutes' -HelperBlock @"
  doorbell_icon_minutes:
    name: Gate doorbell icon minutes
    min: 1
    max: 1440
    step: 1
    unit_of_measurement: "min"
    mode: box
    initial: 5
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_datetime' -KeyName 'dashboard_doorbell_last_ring' -Label 'doorbell last ring datetime' -HelperBlock @"
  dashboard_doorbell_last_ring:
    name: Gate doorbell last ring
    has_date: true
    has_time: true
    icon: mdi:doorbell
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_datetime' -KeyName 'dashboard_driveway_alarm_last' -Label 'driveway alarm last trigger datetime' -HelperBlock @"
  dashboard_driveway_alarm_last:
    name: Driveway alarm last trigger
    has_date: true
    has_time: true
    icon: mdi:road-variant
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'pool_pump_auto_on_minutes' -Label 'pool pump auto-on minutes' -HelperBlock @"
  pool_pump_auto_on_minutes:
    name: Pool pump auto turn-on minutes
    min: 1
    max: 1440
    step: 1
    unit_of_measurement: "min"
    mode: box
    initial: 10
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'shed_power_auto_enabled' -Label 'shed power auto boolean' -HelperBlock @"
  shed_power_auto_enabled:
    name: Shed power auto
    icon: mdi:transmission-tower
    initial: true
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'bathroom_fan_auto_off_enabled' -Label 'bathroom fan auto-off boolean' -HelperBlock @"
  bathroom_fan_auto_off_enabled:
    name: Bathroom fan auto-off
    icon: mdi:fan
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'bathroom_fan_auto_off_minutes' -Label 'bathroom fan auto-off minutes' -HelperBlock @"
  bathroom_fan_auto_off_minutes:
    name: Bathroom fan auto-off minutes
    min: 1
    max: 1440
    step: 1
    unit_of_measurement: "min"
    mode: box
    initial: 30
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'pond_fill_auto_enabled' -Label 'pond fill auto boolean' -HelperBlock @"
  pond_fill_auto_enabled:
    name: Pond fill auto
    icon: mdi:pipe-valve
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'pond_fill_low_inches' -Label 'pond fill low inches' -HelperBlock @"
  pond_fill_low_inches:
    name: Pond fill low inches
    min: -50
    max: 50
    step: 0.1
    unit_of_measurement: "in"
    mode: box
    initial: -1.5
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'pond_fill_full_inches' -Label 'pond fill full inches' -HelperBlock @"
  pond_fill_full_inches:
    name: Pond fill full inches
    min: -50
    max: 50
    step: 0.1
    unit_of_measurement: "in"
    mode: box
    initial: 0
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'pool_low_water_email_enabled' -Label 'pool low water boolean' -HelperBlock @"
  pool_low_water_email_enabled:
    name: Pool low water email
    icon: mdi:pool
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'pool_low_water_phone_enabled' -Label 'pool low water phone boolean' -HelperBlock @"
  pool_low_water_phone_enabled:
    name: Pool low water phone
    icon: mdi:cellphone-message
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'pond_low_water_email_enabled' -Label 'pond low water boolean' -HelperBlock @"
  pond_low_water_email_enabled:
    name: Pond low water email
    icon: mdi:waves
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'pond_low_water_phone_enabled' -Label 'pond low water phone boolean' -HelperBlock @"
  pond_low_water_phone_enabled:
    name: Pond low water phone
    icon: mdi:cellphone-message
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'cistern_low_water_email_enabled' -Label 'cistern low water boolean' -HelperBlock @"
  cistern_low_water_email_enabled:
    name: Cistern low water email
    icon: mdi:water-percent
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'cistern_low_water_phone_enabled' -Label 'cistern low water phone boolean' -HelperBlock @"
  cistern_low_water_phone_enabled:
    name: Cistern low water phone
    icon: mdi:cellphone-message
    initial: false
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'pool_low_water_inches' -Label 'pool low water inches' -HelperBlock @"
  pool_low_water_inches:
    name: Pool low water inches
    min: -50
    max: 50
    step: 0.1
    unit_of_measurement: "in"
    mode: box
    initial: -1
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'pond_low_water_inches' -Label 'pond low water inches' -HelperBlock @"
  pond_low_water_inches:
    name: Pond low water inches
    min: -50
    max: 50
    step: 0.1
    unit_of_measurement: "in"
    mode: box
    initial: -2
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'cistern_low_water_percent' -Label 'cistern low water percent' -HelperBlock @"
  cistern_low_water_percent:
    name: Cistern low water percent
    min: 0
    max: 100
    step: 1
    unit_of_measurement: "%"
    mode: box
    initial: 50
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'pool_water_level_offset' -Label 'pool water offset' -HelperBlock @"
  pool_water_level_offset:
    name: Pool water level offset
    min: -100
    max: 200
    step: 0.1
    unit_of_measurement: "in"
    mode: box
    initial: 0
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_number' -KeyName 'pond_water_level_offset' -Label 'pond water offset' -HelperBlock @"
  pond_water_level_offset:
    name: Pond water level offset
    min: -100
    max: 200
    step: 0.1
    unit_of_measurement: "in"
    mode: box
    initial: 0
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_text' -KeyName 'dashboard_notify_email' -Label 'notify email override' -HelperBlock @"
  dashboard_notify_email:
    name: Dashboard notify email override
    icon: mdi:email-edit-outline
    mode: text
    initial: ""
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_text' -KeyName 'dashboard_notify_phone' -Label 'notify phone target' -HelperBlock @"
  dashboard_notify_phone:
    name: Dashboard notify phone target
    icon: mdi:cellphone-message
    mode: text
    initial: "notify.holdens_iphone"
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'dashboard_notify_email_enabled' -Label 'notify email channel' -HelperBlock @"
  dashboard_notify_email_enabled:
    name: Dashboard notify email channel
    icon: mdi:email-outline
    initial: true
"@

Ensure-YamlHelperKey -FilePath $configYaml -SectionName 'input_boolean' -KeyName 'dashboard_notify_phone_enabled' -Label 'notify phone channel' -HelperBlock @"
  dashboard_notify_phone_enabled:
    name: Dashboard notify phone channel
    icon: mdi:cellphone-message
    initial: false
"@

function Ensure-ShellCommandSendEmail {
  if (-not (Test-Path $configYaml)) {
    Write-Host '  Skip dashboard_send_email shell_command - configuration.yaml missing'
    return
  }
  $configText = [System.IO.File]::ReadAllText($configYaml)
  if ($configText -match 'dashboard_send_email:') {
    Write-Host '  configuration.yaml already has dashboard_send_email'
    return
  }
  $block = @"
  dashboard_send_email: >-
    python3 /config/dashboard_sync/send_notify_email.py
    --title "{{ title }}"
    --message-b64 "{{ message_b64 }}"
    --recipient "{{ recipient }}"
"@
  $utf8 = New-Object System.Text.UTF8Encoding $false
  if ($configText -match '(?m)^shell_command:\s*\r?\n') {
    $match = [regex]::Match($configText, '(?m)^shell_command:\s*\r?\n')
    $insertAt = $match.Index + $match.Length
    $updated = $configText.Substring(0, $insertAt) + $block + "`r`n" + $configText.Substring($insertAt)
    [System.IO.File]::WriteAllText($configYaml, $updated, $utf8)
    Write-Host '  Added shell_command.dashboard_send_email (restart HA to load it)'
  } else {
    $updated = $configText.TrimEnd() + "`r`n`r`nshell_command:`r`n$block`r`n"
    [System.IO.File]::WriteAllText($configYaml, $updated, $utf8)
    Write-Host '  Created shell_command with dashboard_send_email (restart HA to load it)'
  }
}
Ensure-ShellCommandSendEmail

function Ensure-ShellCommandUpdateSettings {
  if (-not (Test-Path $configYaml)) {
    Write-Host '  Skip dashboard_update_settings shell_command - configuration.yaml missing'
    return
  }
  $configText = [System.IO.File]::ReadAllText($configYaml)
  if ($configText -match 'dashboard_update_settings:') {
    Write-Host '  configuration.yaml already has dashboard_update_settings'
    return
  }
  $block = @"
  dashboard_update_settings: >-
    python3 /config/dashboard_sync/update_dashboard_settings.py
    --patch-b64 "{{ patch_b64 }}"
"@
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $match = [regex]::Match($configText, '(?m)^shell_command:\s*\r?\n')
  if ($match.Success) {
    $insertAt = $match.Index + $match.Length
    $updated = $configText.Substring(0, $insertAt) + $block + "`r`n" + $configText.Substring($insertAt)
    [System.IO.File]::WriteAllText($configYaml, $updated, $utf8)
    Write-Host '  Added shell_command.dashboard_update_settings (restart HA to load it)'
  } else {
    $updated = $configText.TrimEnd() + "`r`n`r`nshell_command:`r`n$block`r`n"
    [System.IO.File]::WriteAllText($configYaml, $updated, $utf8)
    Write-Host '  Created shell_command with dashboard_update_settings (restart HA to load it)'
  }
}
Ensure-ShellCommandUpdateSettings

function Ensure-ShellCommandCheckDeviceComm {
  if (-not (Test-Path $configYaml)) {
    Write-Host '  Skip dashboard_check_device_comm shell_command - configuration.yaml missing'
    return
  }
  $configText = [System.IO.File]::ReadAllText($configYaml)
  if ($configText -match 'dashboard_check_device_comm:') {
    Write-Host '  configuration.yaml already has dashboard_check_device_comm'
    return
  }
  $block = @"
  dashboard_check_device_comm: python3 /config/dashboard_sync/check_device_comm.py
"@
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $match = [regex]::Match($configText, '(?m)^shell_command:\s*\r?\n')
  if ($match.Success) {
    $insertAt = $match.Index + $match.Length
    $updated = $configText.Substring(0, $insertAt) + $block + "`r`n" + $configText.Substring($insertAt)
    [System.IO.File]::WriteAllText($configYaml, $updated, $utf8)
    Write-Host '  Added shell_command.dashboard_check_device_comm (restart HA to load it)'
  } else {
    $updated = $configText.TrimEnd() + "`r`n`r`nshell_command:`r`n$block`r`n"
    [System.IO.File]::WriteAllText($configYaml, $updated, $utf8)
    Write-Host '  Created shell_command with dashboard_check_device_comm (restart HA to load it)'
  }
}
Ensure-ShellCommandCheckDeviceComm

function Ensure-ShellCommandCheckBathroomFans {
  if (-not (Test-Path $configYaml)) {
    Write-Host '  Skip dashboard_check_bathroom_fans shell_command - configuration.yaml missing'
    return
  }
  $configText = [System.IO.File]::ReadAllText($configYaml)
  if ($configText -match 'dashboard_check_bathroom_fans:') {
    Write-Host '  configuration.yaml already has dashboard_check_bathroom_fans'
    return
  }
  $block = @"
  dashboard_check_bathroom_fans: python3 /config/dashboard_sync/check_bathroom_fans.py
"@
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $match = [regex]::Match($configText, '(?m)^shell_command:\s*\r?\n')
  if ($match.Success) {
    $insertAt = $match.Index + $match.Length
    $updated = $configText.Substring(0, $insertAt) + $block + "`r`n" + $configText.Substring($insertAt)
    [System.IO.File]::WriteAllText($configYaml, $updated, $utf8)
    Write-Host '  Added shell_command.dashboard_check_bathroom_fans (restart HA to load it)'
  } else {
    $updated = $configText.TrimEnd() + "`r`n`r`nshell_command:`r`n$block`r`n"
    [System.IO.File]::WriteAllText($configYaml, $updated, $utf8)
    Write-Host '  Created shell_command with dashboard_check_bathroom_fans (restart HA to load it)'
  }
}
Ensure-ShellCommandCheckBathroomFans

function Ensure-DashboardScriptFromSnippet {
  param(
    [string]$ScriptKey,
    [string]$SnippetRelativePath,
    [string]$Label
  )
  $scriptsPath = Join-Path $shareRoot 'scripts.yaml'
  $snippetPath = Join-Path $root $SnippetRelativePath
  if (-not (Test-Path $scriptsPath) -or -not (Test-Path $snippetPath)) {
    Write-Host "  Skip $Label - scripts.yaml or snippet missing"
    return
  }
  $snippetRaw = [System.IO.File]::ReadAllText($snippetPath)
  $snippetMatch = [regex]::Match(
    $snippetRaw,
    "(?ms)^$([regex]::Escape($ScriptKey)):.*?(?=(\r?\n[a-z0-9_]+:|\z))"
  )
  if (-not $snippetMatch.Success) {
    Write-Host "  Skip $Label - snippet missing key"
    return
  }
  $snippet = $snippetMatch.Value.TrimEnd()
  $scriptsText = [System.IO.File]::ReadAllText($scriptsPath)
  $utf8 = New-Object System.Text.UTF8Encoding $false
  if ($scriptsText -match "(?m)^$([regex]::Escape($ScriptKey)):") {
    $updated = [regex]::Replace(
      $scriptsText,
      "(?ms)^$([regex]::Escape($ScriptKey)):.*?(?=(\r?\n[a-z0-9_]+:|\z))",
      ($snippet + "`r`n"),
      1
    )
    if ($updated -eq $scriptsText) {
      Write-Host "  scripts.yaml $ScriptKey left unchanged"
      return
    }
    [System.IO.File]::WriteAllText($scriptsPath, $updated, $utf8)
    Write-Host "  Updated $ScriptKey in scripts.yaml (reload Scripts in HA)"
    return
  }
  [System.IO.File]::WriteAllText($scriptsPath, $scriptsText.TrimEnd() + "`r`n`r`n" + $snippet + "`r`n", $utf8)
  Write-Host "  Appended $ScriptKey to scripts.yaml (reload Scripts in HA)"
}

Ensure-DashboardScriptFromSnippet -ScriptKey 'dashboard_notify_email' -SnippetRelativePath 'homeassistant\snippets\script-dashboard-notify-email.yaml' -Label 'dashboard_notify_email script'
Ensure-DashboardScriptFromSnippet -ScriptKey 'dashboard_notify_phone' -SnippetRelativePath 'homeassistant\snippets\script-dashboard-notify-phone.yaml' -Label 'dashboard_notify_phone script'
Ensure-DashboardScriptFromSnippet -ScriptKey 'dashboard_update_settings' -SnippetRelativePath 'homeassistant\snippets\script-dashboard-update-settings.yaml' -Label 'dashboard_update_settings script'
Ensure-DashboardScriptFromSnippet -ScriptKey 'outside_lights_all_off' -SnippetRelativePath 'homeassistant\snippets\scripts-dashboard.yaml' -Label 'outside lights all-off script'
Ensure-DashboardScriptFromSnippet -ScriptKey 'outside_lights_normal_on' -SnippetRelativePath 'homeassistant\snippets\scripts-dashboard.yaml' -Label 'outside lights Normal script'
Ensure-DashboardScriptFromSnippet -ScriptKey 'outside_lights_normal_late_off' -SnippetRelativePath 'homeassistant\snippets\scripts-dashboard.yaml' -Label 'outside lights Normal late-off script'
Ensure-DashboardScriptFromSnippet -ScriptKey 'outside_lights_sign_off' -SnippetRelativePath 'homeassistant\snippets\scripts-dashboard.yaml' -Label 'outside lights sign-off script'
Ensure-DashboardScriptFromSnippet -ScriptKey 'outside_lights_guest_on' -SnippetRelativePath 'homeassistant\snippets\scripts-dashboard.yaml' -Label 'outside lights Guest script'

function Ensure-AutomationFromSnippet {
  param(
    [string]$AutomationId,
    [string]$SnippetRelativePath,
    [string]$Label
  )
  $autoPath = Join-Path $shareRoot 'automations.yaml'
  $snippetPath = Join-Path $root $SnippetRelativePath
  if (-not (Test-Path $autoPath) -or -not (Test-Path $snippetPath)) {
    Write-Host "  Skip $Label - automations.yaml or snippet missing"
    return
  }
  $snippetRaw = [System.IO.File]::ReadAllText($snippetPath)
  $snippetMatch = [regex]::Match($snippetRaw, "(?ms)^- id: $([regex]::Escape($AutomationId))\b.*")
  if (-not $snippetMatch.Success) {
    Write-Host "  Skip $Label - snippet missing - id block"
    return
  }
  $snippet = $snippetMatch.Value.TrimEnd()
  $autoText = [System.IO.File]::ReadAllText($autoPath)
  $utf8 = New-Object System.Text.UTF8Encoding $false
  if ($autoText -match "(?m)^- id: $([regex]::Escape($AutomationId))\b") {
    $updated = [regex]::Replace(
      $autoText,
      "(?ms)^- id: $([regex]::Escape($AutomationId))\b.*?(?=(\r?\n- id: |\z))",
      ($snippet + "`r`n"),
      1
    )
    if ($updated -eq $autoText) {
      Write-Host "  automations.yaml $AutomationId left unchanged"
      return
    }
    [System.IO.File]::WriteAllText($autoPath, $updated, $utf8)
    Write-Host "  Updated $AutomationId in automations.yaml (reload Automations in HA)"
    return
  }
  [System.IO.File]::WriteAllText($autoPath, $autoText.TrimEnd() + "`r`n`r`n" + $snippet + "`r`n", $utf8)
  Write-Host "  Appended $AutomationId to automations.yaml (reload Automations in HA)"
}

Ensure-AutomationFromSnippet -AutomationId 'pool_pump_off_email' -SnippetRelativePath 'homeassistant\snippets\automation-pool-pump-off-email.yaml' -Label 'pool pump email automation'
Ensure-AutomationFromSnippet -AutomationId 'pool_pump_auto_on' -SnippetRelativePath 'homeassistant\snippets\automation-pool-pump-auto-on.yaml' -Label 'pool pump auto-on automation'
Ensure-AutomationFromSnippet -AutomationId 'dashboard_bathroom_fan_auto_off' -SnippetRelativePath 'homeassistant\snippets\automation-bathroom-fan-auto-off.yaml' -Label 'bathroom fan auto-off automation'
Ensure-AutomationFromSnippet -AutomationId 'pond_fill_open_on_low' -SnippetRelativePath 'homeassistant\snippets\automation-pond-fill-auto.yaml' -Label 'pond fill open automation'
Ensure-AutomationFromSnippet -AutomationId 'pond_fill_close_on_full' -SnippetRelativePath 'homeassistant\snippets\automation-pond-fill-auto.yaml' -Label 'pond fill close automation'
Ensure-AutomationFromSnippet -AutomationId 'shed_power_on_low_battery' -SnippetRelativePath 'homeassistant\snippets\automation-shed-power.yaml' -Label 'shed power auto automation'
Ensure-AutomationFromSnippet -AutomationId 'pool_low_water_email' -SnippetRelativePath 'homeassistant\snippets\automation-pool-low-water-email.yaml' -Label 'pool low water automation'
Ensure-AutomationFromSnippet -AutomationId 'pond_low_water_email' -SnippetRelativePath 'homeassistant\snippets\automation-pond-low-water-email.yaml' -Label 'pond low water automation'
Ensure-AutomationFromSnippet -AutomationId 'cistern_low_water_email' -SnippetRelativePath 'homeassistant\snippets\automation-cistern-low-water-email.yaml' -Label 'cistern low water automation'
Ensure-AutomationFromSnippet -AutomationId 'dashboard_doorbell_pressed' -SnippetRelativePath 'homeassistant\snippets\automation-doorbell-pressed.yaml' -Label 'gate doorbell automation'
Ensure-AutomationFromSnippet -AutomationId 'dashboard_driveway_alarm_triggered' -SnippetRelativePath 'homeassistant\snippets\automation-driveway-alarm.yaml' -Label 'driveway alarm automation'
Ensure-AutomationFromSnippet -AutomationId 'dashboard_reminder_1_reset' -SnippetRelativePath 'homeassistant\snippets\automation-reminder-1-reset.yaml' -Label 'reminder 1 reset automation'
Ensure-AutomationFromSnippet -AutomationId 'dashboard_reminder_2_reset' -SnippetRelativePath 'homeassistant\snippets\automation-reminder-2-reset.yaml' -Label 'reminder 2 reset automation'
Ensure-AutomationFromSnippet -AutomationId 'dashboard_calendar_reminder_reset' -SnippetRelativePath 'homeassistant\snippets\automation-calendar-reminder-reset.yaml' -Label 'legacy calendar reminder reset automation'
Ensure-AutomationFromSnippet -AutomationId 'dashboard_device_comm_check' -SnippetRelativePath 'homeassistant\snippets\automation-device-comm-check.yaml' -Label 'device communication check automation'
Ensure-AutomationFromSnippet -AutomationId 'outside_lights_none_mode' -SnippetRelativePath 'homeassistant\snippets\automation-outside-lights.yaml' -Label 'outside lights None automation'
Ensure-AutomationFromSnippet -AutomationId 'outside_lights_normal_mode' -SnippetRelativePath 'homeassistant\snippets\automation-outside-lights.yaml' -Label 'outside lights Normal automation'
Ensure-AutomationFromSnippet -AutomationId 'outside_lights_guest_mode' -SnippetRelativePath 'homeassistant\snippets\automation-outside-lights.yaml' -Label 'outside lights Guest automation'

if (Test-Path $configYaml) {
  $configText = [System.IO.File]::ReadAllText($configYaml)
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $changed = $false
  if ($configText -notmatch '(?m)^egauge_live:') {
    $configText = $configText.TrimEnd() + "`r`n`r`negauge_live: {}`r`n"
    $changed = $true
    Write-Host '  Added egauge_live: to configuration.yaml (restart HA to load the 1s poller)'
  } else {
    Write-Host '  configuration.yaml already has egauge_live:'
  }
  if ($configText -notmatch '(?m)^doorbird_intercom:') {
    $configText = $configText.TrimEnd() + "`r`n`r`ndoorbird_intercom: {}`r`n"
    $changed = $true
    Write-Host '  Added doorbird_intercom: to configuration.yaml (restart HA to load DoorBird audio proxy)'
  } else {
    Write-Host '  configuration.yaml already has doorbird_intercom:'
  }
  if ($changed) {
    [System.IO.File]::WriteAllText($configYaml, $configText, $utf8)
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
  (Join-Path $wwwPath 'view.html'),
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
Write-Host '  Local (full):  http://homeassistant.local:8123/local/home-dashboard/index.html'
Write-Host '  Local (view):  http://homeassistant.local:8123/local/home-dashboard/view.html'
Write-Host '  Remote (full): https://<your-nabu-casa-id>.ui.nabu.casa/local/home-dashboard/index.html'
Write-Host '  Remote (view): https://<your-nabu-casa-id>.ui.nabu.casa/local/home-dashboard/view.html'
Write-Host ''
Write-Host 'After custom component changes: restart Home Assistant (not just reload).'
Write-Host 'Token lives in project ha-config.json (gitignored) and is preserved on HA during deploy.'
Write-Host 'User config (shade/energy/pool/pond maps, zynect-config) is never overwritten on HA - edit on HA or export from Settings.'
