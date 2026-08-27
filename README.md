# Home Dashboard

A local Home Assistant–style control panel. Starts with window shade controls and room for HVAC and other areas later.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Deploy to Home Assistant (Raspberry Pi)

Home Assistant serves files from `/config/www/` at `/local/`. This project builds for that path and copies to the HA box over **Samba** (default on Windows).

### One-time setup

1. On HA: enable **Samba** (Settings → System → Storage).
2. In this project:
   ```bash
   copy deploy.env.example deploy.env
   ```
   Edit `deploy.env` if needed — default `HA_SHARE=\\homeassistant.local\config` usually works.

3. Confirm the share is reachable from your PC (File Explorer → `\\homeassistant.local\config`).

**Optional SSH deploy** (`npm run deploy:ssh`): install **Terminal & SSH** on HA and OpenSSH Client on Windows; set `HA_HOST` / `HA_USER` in `deploy.env`.

### Deploy

```bash
npm run deploy
```

That builds with the correct `/local/home-dashboard/` base path and copies:

- `dist/` → `/config/www/home-dashboard/`
- config JSON from `public/` (shade map, energy map, caches, etc.)
- `homeassistant/custom_components/` → `/config/custom_components/`
- `homeassistant/dashboard_sync/` → `/config/dashboard_sync/`

Then open:

`http://homeassistant.local:8123/local/home-dashboard/index.html`

**Note:** The first time you create the `www` folder, restart Home Assistant so `/local/` starts serving. Later deploys into an existing `www` do not need a restart. After custom component changes, **restart Home Assistant** (not just reload).

After each deploy, the app loads assets via `version.json` (cache-busted), so you can keep a stable Webpage URL:

`/local/home-dashboard/index.html`

(No need to bump `?v=` on every update. If an old cached `index.html` is stuck once, open with `?v=3` a single time to pick up the new loader.)

To show it inside HA: **Settings → Dashboards → Add dashboard → Webpage**, URL `/local/home-dashboard/index.html`.

For **remote** access (Nabu Casa), put your long-lived token in **`ha-config.json` at the project root** (gitignored). Deploy copies it to the HA box and **never overwrites** an existing token there.

```bash
copy public\ha-config.example.json ha-config.json
# edit ha-config.json — paste your token, leave baseUrl empty
npm run deploy
```

### Manual upload (WinSCP / Samba)

```bash
npm run build:ha
```

Then copy everything inside `dist/` to `/config/www/home-dashboard/` on the Pi.

## Structure

- `src/data/` — mock house state (swap for Home Assistant API later)
- `src/pages/` — overview and drill-down views
- `src/components/` — reusable widgets and controls
- `scripts/deploy-ha.ps1` — build + Samba copy to the HA box (default `npm run deploy`)
- `scripts/deploy.ps1` — build + SCP over SSH (`npm run deploy:ssh`)

Shade positions come from Home Assistant `cover` entities when connected (see Settings). Until then, mock data is shown.

### Live shade positions

1. Deploy the app to HA `/local/home-dashboard/`.
2. Open **Settings** in the dashboard.
3. Create a **Long-lived access token** in HA (profile → Long-lived access tokens).
4. Paste the token, leave Base URL blank, connect.
5. Map each shade to a `cover.*` entity (or use **Auto-match names**).
### Live Enphase solar

Requires the Enphase Envoy integration (or equivalent) in Home Assistant.

1. Connect in Settings (same token as shades).
2. Under **Solar sensors**, map:
   - **PV production** → current power production (W or kW)
   - **Battery SOC** → battery state of charge (%)
3. Or use **Auto-match** to pick likely Enphase/Envoy sensors.

The home Solar widget and `/solar` page refresh with the rest of the live data.
