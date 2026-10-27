import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "../upstream/packages/web/node_modules/vite/dist/node/index.js";
import react from "../upstream/packages/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { sharedResolve } from "../upstream/packages/web/vite.shared";
import { colorThemeBootPlugin } from "../upstream/packages/web/plugins/colorThemeBoot";
import { laneBootPlugin } from "../upstream/packages/web/plugins/laneBoot";
import { themeVarsByMode } from "../upstream/packages/web/lib/theme/themeVars";
import { productTheme } from "../../../integrations/codecast/web/productTheme";

// Run the actual upstream app. Keep adaptation outside the vendored source.
const here = path.dirname(fileURLToPath(import.meta.url));
const appMode = process.env.COLLOSYS_CODECAST_APP === '1';
const originalRoot = path.resolve(here, "../upstream/packages/web");
const webRoot = appMode ? path.resolve(here, '../../../.local/codecast-app/source/packages/web') : originalRoot;
const fontRoot = `/@fs/${path.resolve(webRoot, "../mobile/assets/fonts").replaceAll("\\", "/")}`;
const localFonts = [["Regular", 400], ["Medium", 500], ["SemiBold", 600], ["Bold", 700]].map(([face, weight]) =>
  `@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:${weight};font-display:swap;src:url('${fontRoot}/JetBrainsMono-${face}.ttf') format('truetype');}`
).join("") +
  `@font-face{font-family:'JetBrains Mono';font-style:italic;font-weight:400;font-display:swap;src:url('${fontRoot}/JetBrainsMono-Italic.ttf') format('truetype');}` +
  [["Fraunces", "normal"], ["Fraunces-Italic", "italic"]].map(([face, style]) =>
    `@font-face{font-family:'Fraunces';font-style:${style};font-weight:100 900;font-display:swap;src:url('/@fs/${path.resolve(here, `fonts/${face}.ttf`).replaceAll("\\", "/")}') format('truetype');}`
  ).join("");
const backend = process.env.COLLOSYS_CODECAST_BACKEND;
if (!backend || new URL(backend).hostname !== "127.0.0.1") {
  throw new Error("An explicit loopback Codecast backend is required.");
}
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: ${backend} https://avatars.githubusercontent.com https://lh3.googleusercontent.com`,
  `connect-src 'self' ${backend} ${backend.replace('http:', 'ws:')}${appMode ? ' http://127.0.0.1:* https://avatars.githubusercontent.com https://lh3.googleusercontent.com' : ''}`,
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export default defineConfig({
  root: webRoot,
  publicDir: appMode ? path.resolve(here, '../../../.local/codecast-app/product-public') : undefined,
  envDir: here,
  // Never load the upstream's .env files, production URL or telemetry config.
  define: {
    "import.meta.env.VITE_CONVEX_URL": JSON.stringify(backend),
    "import.meta.env.VITE_POSTHOG_KEY": '""',
    "import.meta.env.VITE_SENTRY_DSN": '""',
    "import.meta.env.VITE_GOOGLE_ADS_SEND_TO": '""',
    "import.meta.env.VITE_CODECAST_INGEST_KEY": '""',
    __CODECAST_BUILD__: JSON.stringify({ sha: "5dfb04f516122fe4f59a61137219b5a4e2e1f9f8", mode: "local-reference", builtAt: "2026-10-23" }),
  },
  plugins: [
    react(), appMode ? {
      name: 'collosys-color-theme-boot',
      transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'script', children: `window.__ccDefaultColorTheme=${JSON.stringify(themeVarsByMode(productTheme))}`, injectTo: 'head-prepend' }] },
    } : colorThemeBootPlugin(), laneBootPlugin(),
    {
      name: "collosys-local-boundary",
      resolveId(id) { if (id === "virtual:pwa-register") return "\0collosys-no-service-worker"; },
      load(id) { if (id === "\0collosys-no-service-worker") return "export function registerSW(){return ()=>{}}"; },
      transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/packages/web/codecast.json")) return { code: "export default {}", map: null };
      },
      generateBundle(_options, bundle) {
        if (appMode) {
          const marketingPages = Object.values(bundle).flatMap(chunk => chunk.type === 'chunk' ? Object.keys(chunk.modules) : [])
            .filter(id => /\/app\/\(marketing\)\/.*(?:page|Page)\.tsx$/.test(id.replaceAll('\\', '/')));
          if (marketingPages.length) this.error(`Marketing pages reached the product build: ${marketingPages.join(', ')}`);
          this.emitFile({ type: 'asset', fileName: 'product-surface.json', source: JSON.stringify({ entry: '/projects', marketingPages }) });
        }
        for (const [name, file] of [["Codecast-MIT.txt", "../upstream/LICENSE"], ["JetBrainsMono-OFL.txt", "../JetBrainsMono-OFL.txt"], ["Fraunces-OFL.txt", "fonts/Fraunces-OFL.txt"]]) {
          this.emitFile({ type: "asset", fileName: `licenses/${name}`, source: readFileSync(path.resolve(here, file), "utf8") });
        }
      },
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          if (appMode) html = html
            .replace(/<title>[\s\S]*?<\/title>/, '<title>ColloSys</title>')
            .replace(/<meta\b[^>]*(?:name="(?:description|apple-itunes-app|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, '')
            .replace(/<link\b[^>]*type="application\/rss\+xml"[^>]*>/g, '')
            .replace("if (location.pathname === '/') return;", '/* Product entry honors the saved application theme. */');
          return html.replace(/<link\b[^>]*href="https:\/\/[^>]*>/g, "")
            .replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${localFonts}</style>`);
        },
      },
    },
  ],
  resolve: { ...sharedResolve, alias: Object.fromEntries(Object.entries(sharedResolve.alias).map(([key, value]) => [key, appMode && path.isAbsolute(value) ? value.replace(originalRoot, webRoot) : value])) },
  css: { postcss: webRoot },
  cacheDir: path.join(webRoot, appMode ? "node_modules/.vite-collo-app" : "node_modules/.vite-collo"),
  server: { host: "127.0.0.1", port: appMode ? 3407 : 3297, strictPort: true, headers: { "Content-Security-Policy": csp }, fs: { allow: [path.resolve(here, ".."), path.resolve(webRoot, '../..')] } },
  optimizeDeps: {
    holdUntilCrawlEnd: true,
    exclude: ["@novnc/novnc"],
    include: ["react", "react-dom", "react-dom/client", "react-router", "convex/react", "@convex-dev/auth/react", "react-markdown", "rehype-highlight", "remark-gfm", "@tanstack/react-virtual", "lucide-react", "sonner", "cmdk", "nanoid", "react-resizable-panels", "dexie", "prosemirror-collab"],
  },
  build: { target: "es2022", outDir: path.resolve(here, appMode ? "../../../dist/codecast-app" : "../../../dist/codecast-reference"), emptyOutDir: appMode, manifest: appMode },
});
