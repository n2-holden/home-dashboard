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

## Shed Power thresholds

To configure automatic Shed Power control without packages:

1. Merge `input-number-dashboard.yaml` into the existing `input_number:` block in
   `configuration.yaml`.
2. Merge `input-boolean-dashboard.yaml` into the existing `input_boolean:` block.
3. Replace the old low-battery automation with `automation-shed-power.yaml`.
4. Reload helpers and automations, or restart Home Assistant.

The dashboard changes these shared Home Assistant number helpers:

- `input_number.shed_power_on_soc_threshold`
- `input_number.shed_power_off_soc_threshold`

They are stored by Home Assistant and are therefore consistent across local and remote
dashboard instances.

## Outside light modes

If you are not using packages, merge `input-select-outside.yaml` into the
`input_select:` block, add the three scripts from `scripts-dashboard.yaml` to
`scripts.yaml`, and add the three entries from `automation-outside-lights.yaml`
to `automations.yaml`.

The Outside widget controls the shared `input_select.outside_lights_mode` helper:

- **None** turns all outside lights off.
- **Normal** turns on Sign, Upper Driveway, Courtyard lights, and Garden at sunset,
  then turns everything off at 10:30 PM. Selecting Normal during the day (before 10:30 PM)
  also turns those lights on immediately.
- **Guest** turns all outside lights on.

Mode is restored after Home Assistant or dashboard restarts, but **startup does not change
light states** — only an explicit mode change or a schedule trigger (sunset, etc.) does.

## Verify

**Developer Tools → Services** → run `script.dashboard_set_map_offset` with `kind: pool`, `offset: 12.5`.

Check `config/www/home-dashboard/pool-map.json` — `depthOffset` should update.

## Alternative: packages (one line)

If you prefer not to edit three files, add under `homeassistant:` in `configuration.yaml`:

```yaml
  packages: !include_dir_named packages
```

Then reload HA. Deploy already copies `packages/home-dashboard.yaml`.
