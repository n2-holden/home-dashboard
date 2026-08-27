# Dashboard cache sync (run on HA host only)

This script talks to LAN devices (Homebridge, local HA API) and writes JSON caches
under `config/www/home-dashboard/` that dashboards read — so remote browsers never
call `homebridge.local` or other LAN hosts directly.

## Files written

| Cache | Source |
|-------|--------|
| `shade-schedule-today.json` | Homebridge `schedule.json` |
| `shades-cache.json` | HA cover states for entities in `shade-map.json` |

AlsoEnergy PV data is written by the `alsoenergy` custom component (`pv-cache.json`).
Enphase Shed Solar is written by the `enphase_powerpack` custom component (`shed-cache.json`, one poll every 15 minutes).

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
