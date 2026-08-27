# AlsoEnergy PowerTrack (Cloud)

Home Assistant custom integration for [AlsoEnergy PowerTrack](https://api.alsoenergy.com/swagger/).

Exposes three sensors per site:

- **Production Power** — current output (`productionData.nowKw`, reported in watts)
- **Energy Produced This Month** — `productionData.monthKwh`
- **Lifetime Energy Produced** — `productionData.lifetimeKwh`

Data comes from `GET /Sites/{siteId}?includeProductionData=true`, polled every 10 minutes during daylight hours (from one hour before sunrise through one hour after sunset, based on your Home Assistant home location).

The integration writes a shared cache file at `config/www/home-dashboard/pv-cache.json`. Only one API call is made per poll interval regardless of how many dashboards or HA consumers are active; dashboards read PV values from that file.

## Install

1. Copy this folder to `config/custom_components/alsoenergy/` on your Home Assistant host.
2. Restart Home Assistant.
3. **Settings → Devices & services → Add integration → AlsoEnergy PowerTrack**.
4. Enter your PowerTrack username/password. Site ID is optional (auto-detects the first site in your account).

## Finding your site ID

Use the [PowerTrack API swagger page](https://api.alsoenergy.com/swagger/) to log in, then call **GET /Sites**. The numeric `siteId` from the response is what you enter during setup (or leave blank to auto-pick the first site).

## Requirements

Your AlsoEnergy account must have access to the PowerTrack Public API. If login fails, confirm you can authenticate at https://api.alsoenergy.com/swagger/ with the same credentials.
