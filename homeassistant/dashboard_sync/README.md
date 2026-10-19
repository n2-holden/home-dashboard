# Dashboard cache sync (run on HA host only)

These scripts run on the HA host and write JSON caches under
`config/www/home-dashboard/` that dashboards read — so remote browsers never
call LAN hosts directly.

## Files written

| Cache | Source |
|-------|--------|
| `shade-schedule-today.json` | `shade_sun.py` (today's sun close/open intervals per shade) |
| `shade-sun-status.json` | `shade_sun.py` (automatic control on/off, manual holds) |
| `shades-cache.json` | `sync_caches.py` — HA cover states for entities in `shade-map.json` |

## Sun-driven shade control

`shade_sun.py` runs every minute via `shell_command.dashboard_shade_sun` + automation
`dashboard_shade_sun`. Window geometry lives in `shade_sun_config.json` (keyed by Crestron
shade ID; ported from the Homebridge CrestronLutronShades plugin). A shade closes while the
sun is inside its azimuth cone and elevation band, scanning from one hour before sunrise to
sunset; closes of 15 minutes or less are skipped.

- Control only runs while `input_boolean.shade_sun_automation` is on (Schedule dialog on the Shades page).
- Commands are sent only when the sun state changes, so it never fights a manual move.
- A move it didn't make pauses that shade for `manualOverrideMinutes` (120).
- State is kept in `www/home-dashboard/shade-sun-state.json`.
- Per-shade edits from the Schedule dialog (click a shade name) go through
  `shell_command.dashboard_shade_sun_window` into `www/home-dashboard/shade-sun-overrides.json`,
  which is merged over `shade_sun_config.json` and survives deploys. Copy lasting values back into
  `shade_sun_config.json` if you want them in the repo defaults.

AlsoEnergy PV data is written by the `alsoenergy` custom component (`pv-cache.json`).
## Device communication failure alerts

`check_device_comm.py` runs on the HA host every minute via
`shell_command.dashboard_check_device_comm` + automation `dashboard_device_comm_check`.

- Does **not** require any dashboard tab to be open
- Cannot send duplicate emails when multiple dashboards are open
- Uses helpers: `input_boolean.device_comm_failure_email_enabled`,
  `input_number.device_comm_failure_minutes`, plus the email/phone channel toggles
- Edge-triggered state is stored in `www/home-dashboard/device-comm-notify-state.json`
- Shared UI status is written to `www/home-dashboard/device-comm-status.json`
  (dashboards read this so Failure time / Result match notifications)

## Setup on Home Assistant

1. Deploy copies this folder to `/config/dashboard_sync/` (`npm run deploy`).

2. Put a long-lived access token in `/config/www/home-dashboard/ha-config.json`
   on the HA box (Settings → Profile → Long-Lived Access Tokens). Keep `baseUrl` empty.

3. Add to `configuration.yaml`:

```yaml
shell_command:
  sync_dashboard_caches: python3 /config/dashboard_sync/sync_caches.py

automation:
  - id: dashboard_cache_sync_periodic
    alias: Sync dashboard caches
    trigger:
      - platform: time_pattern
        minutes: "/15"
      - platform: homeassistant
        event: start
    action:
      - service: shell_command.sync_dashboard_caches
```

4. Restart Home Assistant.

## Pool / pond offsets (shared across dashboards)

Offsets must be written into `pool-map.json` / `pond-map.json` on the HA host. Deploy copies helpers to `/config/dashboard_sync/` and `/config/dashboard_snippets/`.

**You do not need `packages:` in configuration.yaml.** Follow [../snippets/README.md](../snippets/README.md):

1. Add `shell_command.dashboard_update_map_offset` to `configuration.yaml`
2. Merge `scripts-dashboard.yaml` into `scripts.yaml`
3. Merge `automation-dashboard-map-offset.yaml` into `automations.yaml`
4. Reload YAML

**Optional:** enable packages instead — add `packages: !include_dir_named packages` under `homeassistant:` in `configuration.yaml` and reload HA (deploy copies `packages/home-dashboard.yaml`).

When you change a water level offset in Settings (local or Nabu Casa), every dashboard reloads those JSON files within a few seconds.

## Manual run (HA Terminal)

```bash
python3 /config/dashboard_sync/sync_caches.py
```
