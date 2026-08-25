# Home Dashboard

A local Home Assistant–style control panel. Starts with window shade controls and room for HVAC and other areas later.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Deploy to Home Assistant (Raspberry Pi)

Home Assistant serves files from `/config/www/` at `/local/`. This project builds for that path and uploads over SSH.

### One-time setup

1. On HA: install and start the **Terminal & SSH** add-on; set a password (or SSH key).
2. On your PC: confirm `ssh` / `scp` work (Windows Optional Feature **OpenSSH Client**).
3. In this project:
   ```bash
   copy deploy.env.example deploy.env
   ```
   Edit `deploy.env` — set `HA_HOST` to your Pi’s IP or `homeassistant.local`.

4. Test SSH once:
   ```bash
   ssh root@homeassistant.local
   ```

### Deploy

```bash
npm run deploy
```

That builds with the correct `/local/home-dashboard/` base path and uploads to `/config/www/home-dashboard/` on the Pi.

Then open:

`http://homeassistant.local:8123/local/home-dashboard/index.html`

**Note:** The first time you create the `www` folder, restart Home Assistant so `/local/` starts serving. Later deploys into an existing `www` do not need a restart.

After each deploy, the app loads assets via `version.json` (cache-busted), so you can keep a stable Webpage URL:

`/local/home-dashboard/index.html`

(No need to bump `?v=` on every update. If an old cached `index.html` is stuck once, open with `?v=3` a single time to pick up the new loader.)

To show it inside HA: **Settings → Dashboards → Add dashboard → Webpage**, URL `/local/home-dashboard/index.html`.

### Manual upload (WinSCP)

```bash
npm run build:ha
```

Then copy everything inside `dist/` to `/config/www/home-dashboard/` on the Pi.

## Structure

- `src/data/` — mock house state (swap for Home Assistant API later)
- `src/pages/` — overview and drill-down views
- `src/components/` — reusable widgets and controls
- `scripts/deploy.ps1` — build + SCP to the HA box

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
