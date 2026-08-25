import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Home Assistant (and its Webpage iframe) often cache index.html, so hashed
 * JS/CSS never get picked up. After each build, write version.json and replace
 * index.html with a tiny loader that always fetches version.json?t=timestamp.
 */
function homeAssistantCacheBust(): Plugin {
  return {
    name: 'home-assistant-cache-bust',
    apply: 'build',
    closeBundle() {
      const outDir = join(process.cwd(), 'dist')
      const manifestPath = join(outDir, '.vite', 'manifest.json')
      const altManifest = join(outDir, 'manifest.json')
      const path = existsSync(manifestPath) ? manifestPath : altManifest
      if (!existsSync(path)) {
        console.warn('[ha-cache-bust] No Vite manifest found; skip loader rewrite')
        return
      }

      const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<
        string,
        { file: string; css?: string[]; isEntry?: boolean }
      >
      const entry = Object.values(manifest).find((item) => item.isEntry)
      if (!entry) {
        console.warn('[ha-cache-bust] No entry chunk in manifest; skip loader rewrite')
        return
      }

      const version = {
        build: Date.now().toString(36),
        js: entry.file,
        css: entry.css?.[0] ?? null,
      }
      writeFileSync(join(outDir, 'version.json'), JSON.stringify(version, null, 2))

      const loader = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <title>Home</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap"
      rel="stylesheet"
    />
    <script>
      (async function loadHomeDashboard() {
        var root = new URL('./', location.href);
        var versionUrl = new URL('version.json', root);
        versionUrl.searchParams.set('t', String(Date.now()));
        var res = await fetch(versionUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load version.json (' + res.status + ')');
        var v = await res.json();
        if (v.css) {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.crossOrigin = '';
          link.href = new URL(v.css, root).href;
          document.head.appendChild(link);
        }
        var script = document.createElement('script');
        script.type = 'module';
        script.crossOrigin = '';
        script.src = new URL(v.js, root).href;
        document.body.appendChild(script);
      })().catch(function (err) {
        document.body.innerHTML =
          '<pre style="padding:1.5rem;font:14px/1.4 system-ui">Home dashboard failed to load.\\n' +
          String(err) +
          '</pre>';
      });
    </script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`
      writeFileSync(join(outDir, 'index.html'), loader)
      // Keep empty assets dir reference happy on some hosts
      mkdirSync(join(outDir, 'assets'), { recursive: true })
      console.log(`[ha-cache-bust] Wrote version.json (build ${version.build}) + cache-busting index.html`)
    },
  }
}

// Home Assistant serves /config/www as /local — use VITE_BASE=/local/home-dashboard/ when building for HA
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), homeAssistantCacheBust()],
  build: {
    manifest: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
