# Home Assistant custom integrations

This repo includes custom HA components under `homeassistant/custom_components/`.

## Enphase PowerPack (Cloud)

`homeassistant/custom_components/enphase_powerpack/`

Signs into Enlighten (same cloud path as the website) and exposes Battery SOC, PV power, load, battery power, and grid power — **no local Gateway port 443 required**.

See [enphase_powerpack/README.md](custom_components/enphase_powerpack/README.md) for install steps.

## AlsoEnergy PowerTrack (Cloud)

`homeassistant/custom_components/alsoenergy/`

Uses the [PowerTrack Public API](https://api.alsoenergy.com/swagger/) to expose production power, energy this month, and lifetime energy for a site.

See [alsoenergy/README.md](custom_components/alsoenergy/README.md) for install steps.
