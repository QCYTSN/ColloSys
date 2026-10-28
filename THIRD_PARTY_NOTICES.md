# Source reuse

## Complete-project integration (2026-10-23)

Product-scope correction: `integrations/codecast/product-patches.json` removes the original marketing route imports, redirects retired website URLs to the product, and updates the authentication return path and root theme behavior. Product builds omit marketing assets, original installation scripts and website metadata. The original complete reference remains unchanged; source preservation does not mean that every original website page is part of ColloSys.

The user authorized using the complete Codecast MIT project as the application foundation. The pinned original described below remains unchanged. `scripts/codecast-prepare.mjs` creates a full runnable fork and applies the explicit modifications in `integrations/codecast/patches.mjs`: added checkpoint tables/HTTP routes, the original project page's Workspaces tab, local account/onboarding controls, ColloSys name, local fonts/network boundary and cold short-project lookup. New files in `integrations/codecast/convex` and `integrations/codecast/web` connect the existing safe local connector. The generated `.local/codecast-app/fork-manifest.json` identifies every touched file and its resulting hash. All original MIT/vendor/font notices are retained in source and the frontend build. This derivative does not imply affiliation with Codecast. Delta proprietary code is not included.

The old component-level adaptation and the untouched 3297 reference below are historical/separate runtimes. The current integrated frontend is `dist/codecast-app`, with the original Convex backend running locally; it does not run on the old Workers backend.

### Original desktop framework adaptation

The same pinned MIT commit supplies `platform/packages/desktop/src` and its package metadata. `scripts/codecast-desktop-prepare.mjs` creates a runtime derivative under `.local/codecast-app/desktop-framework`, retaining the original MIT license. Its only direct source patch extends the HTTPS URL validator to admit the exact `http://127.0.0.1:3407` product origin. The original preload and bridge are bundled with esbuild for an OS-sandboxed renderer. `provenance.json` records the source, commit, file count and patched hash; the upstream platform mirror remains unchanged.

The owned `integrations/codecast/desktop/main.cjs` configures and wraps this framework with a Windows frame, ColloSys menus/profile, restricted IPC/network permissions, automatic local pairing, a native directory picker and an explicit pending-change close prompt. These adaptations are ColloSys changes, not claims about unmodified upstream behavior.

The Windows x64 development launcher uses Electron 44.3.0. Its official archive SHA-256 is `26bf9a617d58d81772b3d68305d59ee48272969c15083c06db634a77358a8d9d`; an alternate download source must match the same checksum. The unmodified runtime includes `LICENSE` and `LICENSES.chromium.html` in `node_modules/electron/dist`. No new distributable installer is issued in this iteration; any future redistribution must retain these notices.

## Complete Codecast source import (current migration)

Current status, 2026-10-24: the independent upstream reference remains unchanged. The product is now the complete generated fork, connected to the ColloSys local connector through the original Convex/auth foundation and original desktop bridge. Earlier reference-only and selected-component status paragraphs below are historical. Current adaptations are recorded in `integrations/codecast/patches.mjs`, `backend-patches.mjs`, `frontend-patches.mjs` and the generated fork manifest.

The latest owned changes register collaboration collections in the original store/IDB, retain original principal-boundary clearing, add project-scoped live feeders and checkpoint detail queries, and reuse the original `DetailSplitLayout`, `SegmentedToggle`, Timeline `RailDay`/`RailRow` and `FilePatchDiff` directly. Backend adaptations enforce active sessions at public function boundaries and the ten-member limit at team-membership writes. Connector changes enforce per-turn Codex project attribution and serialize recovery of stale process locks. See `docs/SPECIALIZATION_AUDIT_2026-10-24.md` for evidence and limitations. These adaptations do not modify the pinned mirror or imply Codecast endorsement.

The complete source at `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8` is retained in `third_party/codecast/upstream`, with its MIT LICENSE, independent licenses and platform vendor manifest. `third_party/codecast/SOURCE.json` and `source-manifest.json` identify the import and two omitted convenience symlinks. All 9,854 ordinary source files match upstream content; the verifier explicitly accounts for Windows CRLF conversion. No upstream implementation files were edited.

`third_party/codecast/collo/vite.config.ts` supplies an isolated local build/runtime boundary without rewriting pages. It fixes the backend to loopback, prevents production telemetry configuration from entering the app, preserves original routing/styles/components, and serves the original JetBrains Mono assets locally. Font copyright and SIL OFL 1.1 are retained in `third_party/codecast/JetBrainsMono-OFL.txt` ([official license](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt)).

Fraunces regular/italic variable fonts are retained in `third_party/codecast/collo/fonts` from the [official Google Fonts source](https://github.com/google/fonts/tree/main/ofl/fraunces), with their SIL OFL 1.1 and source URLs. These replace the original frontend's Google Fonts network request; they do not introduce a different font family. The standalone frontend build includes Codecast and both font licenses.

Original Codecast branding remains in this local reference only. It is not represented as ColloSys's own design or as affiliation with Codecast. The reference is not yet connected to the ColloSys connector/backend and is excluded from the old installer. Runtime pins are in `runtime-lock.json`; the Convex binary is a local development dependency, not redistributed in the old Windows package. See `docs/CODECAST_FRONTEND_MIGRATION.md` for actual boundaries.

The sections below document the older selected-component implementation and remain historical, not evidence that the full frontend had already been imported.

## Codecast (MIT)

Source: https://github.com/codecast-sh/codecast

Pinned commit: `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`.

Copyright (c) 2025 Codecast. Full license: `third_party/codecast/LICENSE`.

- `packages/connector/src/vendor/codecast/treeSnapshot.ts`: upstream `packages/cli/src/treeSnapshot.ts`; local Git utility import adapted. Runs only against the filtered ColloSys snapshot repository, never directly against the user's project.
- `packages/connector/src/vendor/codecast/git.ts`: selected Git helpers/constants from upstream `wipSnapshot.ts`, using Node child_process. Remote push and restore operations excluded.
- `packages/web/src/components/ui/button.tsx`, `badge.tsx`, `button.css`: upstream corresponding UI primitives; local utility import adjusted.
- Web theme: selected neutral light/dark CSS variables from upstream `packages/web/app/globals.css`; project layout adapted to ColloSys requirements.

No Codecast brand assets or hosted backend dependencies are required.

### Frontend reuse, third iteration

The same pinned commit is used for the following additional source adaptations:

- `packages/web/src/components/codecast/Rail.tsx`: `RailHeading`, `SectionRow`, related types and count primitive extracted from `packages/web/components/sidebar/navPrimitives.tsx`. Removed upstream routing compatibility, stage dragging and desktop-window dependencies; ColloSys supplies authenticated projects and members. At this commit, upstream's Next-named imports resolve to React Router compatibility shims in its Vite app.
- `packages/web/src/components/codecast/ConversationHeaderBar.tsx`: header slots and title from the upstream conversation header. Removed the upstream Agent status and Tooltip provider dependencies; only captured ColloSys metadata is supplied.
- `packages/web/src/components/codecast/FileDiffView.tsx`: upstream file header/collapse component. Defaults expanded and accepts the ColloSys patch renderer as children, replacing the Convex/Pierre renderer dependency.
- `packages/web/src/components/codecast/patchParser.ts`: pure unified patch parser from `packages/convex/convex/fileChanges/patchParser.ts`, without backend dependencies. Unprefixed empty trailing lines are ignored so the viewer does not invent an extra source line after a newline-terminated patch.
- `packages/web/src/components/codecast/theme.css`: selected `.minimal-style` light/dark tokens and panel rules from `packages/web/app/globals.css`. ColloSys layout and responsive styles remain in `style.css`.

The upstream sidebar, conversation, diff and theme source files were read before adaptation. Official Codecast screenshots and Delta's public website were inspected as visual references. No Delta implementation or branded artwork is included. This is a connected adaptation of these components, not a claim to have imported the entire Codecast frontend or its remote execution features.

### Core workbench adaptations after the audit

All Codecast adaptations below use the same pinned MIT commit and retain the license in `third_party/codecast/LICENSE`:

- `components/codecast/diffModel.ts`: upstream `packages/web/lib/diffModel.ts`, including its complete pure diff data model and conversion helpers.
- `components/codecast/PierreDiff.tsx`: upstream `packages/web/components/diff/PierreDiff.tsx`, including the CSS-variable theme, language preloading and actual Pierre renderer. Local import paths and unified/split selection adapted.
- `components/codecast/pierre.ts`: upstream renderer-loading and preloading hook from `packages/web/components/diff/pierre.ts`; unused line-anchor helpers excluded. Theme/language preload before renderer mount is preserved because mounting early can produce an empty diff.
- `components/codecast/MarkdownRenderer.tsx`: upstream `packages/web/components/tools/MarkdownRenderer.tsx` block memoization and renderer structure adapted to captured public messages. Uses React Markdown and GFM; upstream canvas/object controls and raw HTML omitted. Images become explicit links instead of automatic remote requests.
- `components/codecast/DetailSplitLayout.tsx`: upstream mounted-list and Escape ownership behavior. ColloSys adds resizable desktop panes and mobile list/detail navigation; upstream's complete stage system is not copied.
- `components/codecast/conversationScroll.ts`: selected upstream pure follow-stream, initial-edge and resize-scroll functions. ColloSys supplies paginated backend data, virtualization and anchor preservation.

`WorkspaceBrowser`, `SessionReader` and `CheckpointReader`, their history/session/file APIs, authentication and collaboration state are ColloSys integrations. These are not represented as the complete upstream application. Exact dependency versions for the renderer and supporting libraries are recorded in `package-lock.json`; their own licenses remain in `node_modules` and the Windows distribution.

The connector adaptation now sanitizes inherited Git routing/configuration variables. ColloSys constructs the snapshot index from explicitly captured byte blobs, verifies the tree inventory against the manifest, and validates legacy snapshots before restore. These safety adaptations extend the originally selected upstream helpers; they are not attributed to unmodified upstream behavior.

### Complete-foundation backend adaptations (2026-10-25)

The full current fork remains pinned to Codecast MIT commit `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`. Owned `integrations/codecast/native-backend-patches.mjs` records exact adaptations to native access stamps, task/project reads, task launch/dispatch, assignee validation, task comments and Threads, notifications/queued pushes, account membership cleanup and platform API-token verification. The generated platform auth package resolves its dependencies through a build-only junction to the installed Convex dependency workspace, while retaining the patched generated source. The original mirror is unchanged.

Owned Convex modules implement scoped event receipts, cross-part checkpoint path validation/migration, captured-session projections and human handoffs, plus encrypted-backup quota/manifests and private chunked storage. Handoffs reuse the actual Codecast task comment writer with an explicit option disabling automatic Agent relay. These additions are ColloSys behavior, not a claim about unmodified Codecast capabilities. Connector retention journals, recovery/export and bounded downloads extend the previously recorded snapshot adaptations.

The free-first internal adaptation exports an owned eight-job maintenance registry instead of the original 63-job hosted automation registry. It preserves the selected upstream maintenance functions and retention timing, while retaining all original source unchanged. The original workbench's ColloSys extension combines local inspection and uses checkpoint-triggered refresh with a slower idle fallback; authorization remains live on every request. Connector delivery adds persistent quota/registration backoff. This does not migrate the business backend to Cloudflare or certify every upstream feature for cloud use.

## Delta public-reference boundary

The public Delta Claude plugin was studied at `500bde479759fa0d62a7e525afda7b9ccd6e9a5c`. No Delta code or assets are copied into this repository. Durable delivery and explicit execution/visibility boundaries informed the design; the DeltaDB core is proprietary.

Other dependencies retain their own licenses in the installed packages and lockfile.

## October 27 complete ColloSys product UI

The owned integration now adapts the actual application at MIT Codecast commit `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`: DashboardLayout/Sidebar/TabShell, CompanyDocument/projects, native tasks and TaskCommentStream, ConversationView, FileDiffLayout, SettingsModal, AgentTypeIcon/BrandIcons, AvatarImg and original UI primitives. `product-ui-patches.mjs` records exact anchored changes; additions live in `integrations/codecast/web`. Original source and desktop platform mirrors remain unchanged. Authentication, Convex persistence and existing stores remain authoritative.

Shared functional icon adaptations use Phosphor React 2.1.10 under its existing MIT notice. Agent identity marks retain their original upstream definitions and identity; they do not represent product branding or newly supported capture adapters. Google Sans and its OFL remain unchanged. The supplied peanut source is cropped and proportionally rasterized into required PNG/ICO sizes by the deterministic owned `codecast-brand.mjs`; the original supplied image remains unmodified. Sharp 0.35.5 is a build-time dependency (Apache-2.0; its installed bundled library notices remain included), not a new runtime image service. No OpenDesign implementation, skill output, brand imagery or Delta proprietary code is included.

## Windows runtime distribution

The Windows package includes the unmodified Node.js 24.15.0 runtime from the build machine. Its complete upstream license and bundled-component notices are retained in `third_party/node/LICENSE` and copied to `app/runtime/NODE-LICENSE.txt`. Source: https://raw.githubusercontent.com/nodejs/node/v24.15.0/LICENSE. The package also retains the installed npm packages' license files. Git for Windows is an external prerequisite and is not redistributed.

ColloSys retention code compacts parent chains in its own managed snapshot repository. Snapshot helper changes are described above; original user repositories are not the target of snapshot or retention operations.
# October 25 original design sample assets and primitives

The isolated `/design-lab` route is owned ColloSys implementation. It reuses the pinned Codecast `FilePatchDiff` renderer and `conversationScroll.shouldFollowStreaming` policy, existing Radix interaction dependencies, React Router and resizable-panel foundation. It does not claim that captured fixture messages are native executable Codecast conversations. Original Codecast source and license remain unchanged.

The hierarchy rebuild also composes the actual `components/conversation/ConversationHeaderBar.tsx` frame with owned title, metadata and action slots. An explicitly labeled comparison mode (`reference=codecast`) mounts the actual upstream `ConversationView` with the identical synthetic messages, read-only guest props and no composer. This is a native-reader comparison, not evidence that the complete production workbench or a real Agent connection has been reproduced in the sample. Both components remain at the upstream version recorded above; scoped ColloSys CSS changes only the new sample header, while the reference reader retains the upstream styling. Codecast's header priority, shared transcript width and progressive disclosure rules inform the owned composition; the original three-column sample and its fixed checkpoint footer have been replaced.

- Phosphor React 2.1.10 (`@phosphor-icons/react`), MIT; source: https://github.com/phosphor-icons/react. The installed package retains its LICENSE, and the product asset bundle includes a copy. Only the sample's central `DesignIcons.tsx` imports the chosen icon family.
- Google Sans variable roman font, downloaded 2026-10-25 from Google Fonts `ofl/googlesans/GoogleSans[GRAD,opsz,wght].ttf`: https://github.com/google/fonts/tree/main/ofl/googlesans. SIL Open Font License without reserved font names; OFL and trademark notice ship beside the unmodified font. The actual font is self-hosted; no runtime font CDN dependency is introduced. Chinese text uses system sans-serif fallback and code uses the existing monospaced font.
- Peanut graphic: supplied by the user in `a8d3693fe3432b68eebf3b4aa03e0c06.png`. The exact image bytes are preserved as `integrations/codecast/assets/design/peanut-reference.png`; the interface displays the mark through an SVG viewport crop. No claim to own the original artwork is made, and the source text is not used to imply an unrelated company endorsement.

## October 26 reference research and isolated layout exploration

### Subsequent context-workspace revision

The isolated `/workbench-preview` uses the pinned Codecast `FilePatchDiff` directly, including its patch parser, diff model and Pierre renderer. It imports `conversationScroll.shouldFollowStreaming`, uses the installed TanStack virtualizer and resizable panels, and renders the actual `ConversationView` in an explicitly labeled same-message fixture reference mode. It does not copy or replace upstream source or its production business store. Owned `ContextModel`, `ContextScenario`, `ContextReader`, `ContextWorkbench` and scoped CSS live in `integrations/codecast/web` and are materialized through the existing preparation mechanism. The independent preview desktop entry uses the already recorded Codecast Windows framework adaptation without changing the default product entry. Existing Google Sans, supplied peanut image and Phosphor provenance remain unchanged. No OpenDesign implementation or proprietary Delta code is included.

The October 27 visual revision additionally wraps the actual Codecast `components/ui/button.tsx` and its `button.css` at the same MIT pin through owned `ContextControls.tsx`. It preserves the upstream control implementation and adapts scoped appearance and variants. OpenDesign remains read-only visual/source reference at the above recorded pin; no implementation, brand imagery or fonts were imported from it. Existing Google Sans, peanut and Phosphor assets are unchanged.

### October 27 formal-application refinement

At the same Codecast MIT pin `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`, owned `refinement-patches.mjs` adapts DashboardLayout, TabBar, IntentHeader, SettingsModal/settings fields, DetailSplitLayout, ConversationView, FileDiffLayout and Radix dialog/menu surfaces. `ProductProjects` reads the existing project store and authorized collaboration queries. File/line restoration reuses Codecast's existing `topDiffRow`/`landOnDiffRow`; captured-message restoration uses its virtualized ConversationView jump mechanism. UI hints live in the original InboxStore, without duplicating business records or permissions. The original mirror, brand assets, Google Sans and AgentTypeIcon/BrandIcons remain unchanged. No additional implementation or media was imported from OpenDesign, and no proprietary Delta code is included.

### Earlier A/B exploration (historical)

`design-explorations/workbench-20261026` is new ColloSys-owned prototype source, isolated from the product. No OpenDesign implementation code or promotional assets are included in the preview. OpenDesign source was studied at Apache-2.0 commit `26d60298f8129e229a1c10aab4df7ca25b1e9ad3`; its public-site screenshots/DOM measurements are research evidence in `docs/design/evidence/references`, not application assets. The complete source remains in an ignored, read-only research checkout. Codecast was studied at the existing MIT pin `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`, with no changes to the original mirror. The new preview uses installed Radix interaction packages resolved from that workspace, the root React runtime and Phosphor Icons 2.1.10, retaining their installed licenses. It reuses the already supplied peanut artwork and local Google Sans font under the provenance and license noted above, with SVG viewport cropping rather than redrawing or editing the bitmap. No new font or image was downloaded for the product. Its small diff is an explicitly synthetic plain-text comparison, not an adapted Pierre or OpenDesign renderer. No Delta proprietary code is included.
