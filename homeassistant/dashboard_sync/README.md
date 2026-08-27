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

## Manual run (HA Terminal)

```bash
python3 /config/dashboard_sync/sync_caches.py
```
