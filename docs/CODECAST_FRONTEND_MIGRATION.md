# Complete Codecast frontend import

**Product scope correction:** the current application includes the actual workbench, not the original promotional website. Marketing routes/imports and public promotional assets have been removed from the integrated build. The unchanged reference described below still contains the full original tree. Following the user's explicit selection, the default launcher now opens an independent Windows window using the pinned original desktop framework. This source-based desktop entry is distinct from both the browser debug entry and a future distributable installer; current architecture and verification are recorded in `CODECAST_ARCHITECTURE.md` and `PLAN.md`.

The user rejected the earlier selected-component adaptation. That implementation is not the requested complete frontend transplant. The fifth-iteration functional test results do not establish product or visual acceptance.

## Source, not a recreation

`third_party/codecast/upstream` contains the complete tracked Codecast source at `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`: web routes, DashboardShell, DashboardLayout, TabContent, inboxStore, theme/style sheets, editors, settings, shared contracts, original backend and vendored platform packages. The root MIT license and independent vendored licenses are retained.

`source-manifest.json` records every upstream Git blob. `npm run codecast:verify` checks all 9,854 regular files. Windows archive extraction converted 9,437 text files to CRLF; the verifier permits that only if normalization reproduces the exact upstream blob. Two symlinks unsupported by Windows tar were omitted and explicitly recorded in `SOURCE.json`: `CLAUDE.md` and the root `convex` convenience link. Neither omits application code. No original page/component/store implementation was edited.

Integration is outside the imported tree, in `third_party/codecast/collo` and root scripts. The selected-components frontend in `packages/web` remains a separate, older implementation. Starting it is not starting the imported frontend.

## Run the actual original application locally

On Windows x64 with the repository's Node runtime:

```powershell
npm run codecast:setup
npm run codecast:reference
```

This installs pinned dependencies without lifecycle scripts and prepares a pinned, SHA-256-checked Windows backend binary. It runs the complete original frontend at `http://127.0.0.1:3297/login`, with an isolated persistent local Convex backend at ports 3298/3299. A request filter at port 3300 permits only that backend's own public JWT discovery documents. Other backend fetches are denied. All listeners use 127.0.0.1. Browser CSP limits requests to local assets and this backend. The wrapper never uses upstream production deployment settings, telemetry configuration or root dev/deploy scripts.

Data, auth keys, logs and test screenshots are under `.local/codecast-reference`; binaries and the dependency installer are also under `.local`. Existing ColloSys accounts, project directories, snapshots and the application on port 5173 are not migrated, modified or reused by this reference. Do not add local secret files to source control.

The frontend retains Codecast's actual original look and all routes. JetBrains Mono files are served locally from the upstream mobile assets, with the separate OFL in `third_party/codecast/JetBrainsMono-OFL.txt`. The original Fraunces font family is served from local variable font files obtained from Google Fonts' official repository; its OFL and source URLs are in `third_party/codecast/collo/fonts`. Builds include Codecast and font licenses under `licenses/`. Original brand assets appear only in this isolated reference and imply no affiliation.

For the built reference (after building the full frontend), use `npm run codecast:reference -- --built`. The explicit build invocation is:

```powershell
$env:COLLOSYS_CODECAST_BACKEND = 'http://127.0.0.1:3298'
Set-Location third_party/codecast/upstream/packages/web
node node_modules/vite/bin/vite.js build --config ../../../collo/vite.config.ts
```

The build is in `dist/codecast-reference`. It is separate from the previous `dist/web` and excluded from the previous Windows application's packaging. The reference does not run the upstream build's deployment, telemetry verification, prerender or IndexNow scripts.

## What is and is not established

- Full source verification, dependency installation, local backend initialization and full Vite production build have been executed successfully.
- Browser testing performed real email/password registration and opened the original Inbox, Projects, Tasks and General settings. These are real original pages, not screenshots or replacement JSX. Further behavioral acceptance results belong in PLAN.md.
- No `seedWorld`, `seedRun`, token injection, fake query responses or fake server success paths are used. The test account is explicitly a local test identity.
- Upstream `EmptyState.tsx` draws illustrative sample session cards behind its first-run setup card. Those are upstream onboarding artwork, not captured sessions or backend records. They must be removed or clearly marked in the eventual ColloSys product; their presence is not evidence of real file synchronization.
- Original Apple/GitHub buttons, email reset and the original CLI install command remain visible because this is the unchanged original reference. They are not configured or approved ColloSys integrations. No OAuth login, email sending, CLI install command, remote agent execution or public deployment was attempted.
- The source compiles as a whole. That does not establish that every original feature works locally. No upstream whole-suite or upstream typecheck result is claimed; the upstream `cast check` infrastructure is not installed. The existing ColloSys typecheck/tests/build were run separately.
- The original frontend is **not yet connected** to ColloSys's existing account system, Workers/D1 backend, local connector, checkpoint restoration or backup flow. This reference is not the finished product.

## Integration decision

**Resolved:** the user chose option (1), the complete Codecast project with the ColloSys checkpoint/restore connector. The integrated application runs on 3407 and is now the default `npm start`; see [current architecture](CODECAST_ARCHITECTURE.md). The original 3297 reference remains isolated. Owned patches in `integrations/codecast` materialize a complete fork under `.local/codecast-app/source`, leaving the original import unchanged. The paragraphs below record the decision context, not an outstanding approval request.

The original frontend is closely coupled to Convex authentication, entity IDs, cached-principal boundaries, reactive feeders and its dispatch model. A faithful complete transplant needs an explicit decision between (1) adapting the complete original stack and integrating ColloSys's snapshot/restore connector, or (2) preserving the Cloudflare backend and implementing authentic adapters for the original frontend contracts. The user was asked this distinction after the complete original stack was made runnable. The current reference does not silently replace the existing backend.

Either route must retain real saved-file capture, independent directories, safe restore confirmation, server-enforced membership, persistent outbox/replay and no automatic teammate file application. It must also replace the original hosted-only onboarding and unsupported execution controls with truthful local behavior while preserving the original page/layout/interaction system.
