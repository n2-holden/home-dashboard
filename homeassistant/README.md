# Home Assistant custom integrations

This repo includes custom HA components under `homeassistant/custom_components/`.

## AlsoEnergy PowerTrack (Cloud)

`homeassistant/custom_components/alsoenergy/`

Uses the [PowerTrack Public API](https://api.alsoenergy.com/swagger/) to expose production power, energy this month, and lifetime energy for a site.

See [alsoenergy/README.md](custom_components/alsoenergy/README.md) for install steps.

## Device-side settings (not deployed from this repo)

### Hot tub temperature Shelly (`shellyemg3-dcb4d9d15c90`)

It tends to stick to a distant eero node, and eero cannot pin clients. Wi‑Fi roaming
threshold is raised from the default −80 dBm to −70 dBm (checked every 60 s) so the
device rescans and moves to a stronger node sooner. Re-apply after a factory reset:

`Wifi.SetConfig` → `{"config":{"roam":{"rssi_thr":-70,"interval":60}}}`
