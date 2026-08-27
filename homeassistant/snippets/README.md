# Home Assistant snippets (no packages required)

Use these if `configuration.yaml` does **not** use `packages: !include_dir_named packages`.

Deploy copies this folder to `/config/dashboard_snippets/` (`npm run deploy`).

## 1. Shell command

Open **File Editor** → `configuration.yaml`.

If there is **no** `shell_command:` block yet, paste the contents of `configuration-dashboard.yaml`.

If `shell_command:` **already exists**, add only this line under it (same indentation as other commands):

```yaml
  dashboard_update_map_offset: >-
    python3 /config/dashboard_sync/update_map_config.py {{ kind }} {{ offset }}
```

## 2. Script

Open `scripts.yaml` and paste the contents of `scripts-dashboard.yaml`.

(If you don't use `script: !include scripts.yaml`, add a `script:` block in `configuration.yaml` instead.)

## 3. Automation

Open `automations.yaml` and paste the contents of `automation-dashboard-map-offset.yaml` into the list.

## 4. Reload

**Developer Tools → YAML → Reload All** (or restart Home Assistant).

## Verify

**Developer Tools → Services** → run `script.dashboard_set_map_offset` with `kind: pool`, `offset: 12.5`.

Check `config/www/home-dashboard/pool-map.json` — `depthOffset` should update.

## Alternative: packages (one line)

If you prefer not to edit three files, add under `homeassistant:` in `configuration.yaml`:

```yaml
  packages: !include_dir_named packages
```

Then reload HA. Deploy already copies `packages/home-dashboard.yaml`.
