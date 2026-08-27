# Enphase PowerPack (Cloud) — Home Assistant custom integration

Unofficial Home Assistant integration that reads **IQ PowerPack / Enlighten cloud** data the same way the Enlighten website does (no local Gateway port 443 required).

Creates sensors:

| Sensor | Unit | Notes |
|--------|------|--------|
| Battery SOC | % | State of charge |
| PV Production Power | W | Current PV production |
| Load Power | W | House consumption when Enlighten exposes it |
| Battery Power | W | Charge (−) / discharge (+) when available |
| Grid Power | W | Import (+) / export (−) when available |

Polls Enlighten **at most once every 15 minutes, 24 hours a day** (no sunrise/sunset
pause — battery SOC, charge/discharge, load, and grid still matter at night). Snapshots
are written to `config/www/home-dashboard/shed-cache.json` so any number of dashboards
can read Shed Solar without extra API calls.

> Not affiliated with Enphase. Uses undocumented Enlighten web endpoints that may change.

## Install

1. Copy this folder onto your Home Assistant box:

```text
homeassistant/custom_components/enphase_powerpack/
  →  /config/custom_components/enphase_powerpack/
```

On the Pi (from this PC after deploy or SCP):

```bash
mkdir -p /config/custom_components
# copy the enphase_powerpack directory into /config/custom_components/
```

2. **Restart Home Assistant**
3. **Settings → Devices & services → Add integration**
4. Search **Enphase PowerPack (Cloud)**
5. Enter Enlighten **email** + **password**
6. Leave **Site ID** blank unless login can’t auto-detect it  
   (Site ID is the number in the Enlighten URL: `.../web/5904582/...`)

To also monitor the house **IQ Gateway** array (site `5478356`), add a **second**
integration entry with the same Enlighten login and Site ID `5478356`
(name it e.g. “PV Solar”). Restart after copying **v1.0.18+**.

## MFA

If Enlighten MFA is enabled, programmatic login often fails. Options:
- Temporarily disable MFA for setup, or
- Use a secondary Enlighten user without MFA (installer/shared account)

## Map into the home dashboard

After sensors appear in HA, open this app’s **Settings → Solar sensors** (or add a new home widget later) and map:
- Powerpack production → `… PV Production Power`
- Powerpack battery SOC → `… Battery SOC`

## Troubleshooting

Sensors show **Unavailable** when login works but no SOC/power values were parsed yet.

**v1.0.10** uses the same live path as the Enlighten PowerPack page:
`/pv/aws_sigv4/livestream.json?serial_num=…&device_type=pes`, plus PES `/today` as fallback. Probe line looks like:

`Enphase PowerPack probe site=… soc=… (src=pes_livestream:…) | …`

After copying this folder to HA:

1. Restart Home Assistant  
2. **Devices & services → Enphase PowerPack (Cloud) → ⋯ → Reload**  
3. Check **Settings → System → Logs** for a line like:  
   `Snapshot site=… soc=… pv=… load=… batt=… grid=…`

Enable debug if needed:

```yaml
logger:
  default: warning
  logs:
    custom_components.enphase_powerpack: debug
```

Confirm you can log into [Enlighten](https://enlighten.enphaseenergy.com) with the same credentials.
