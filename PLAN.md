# ColloSys implementation progress

The original 90-minute window below is historical. A later user request authorized all four follow-up areas, with tasks/comments/context handoff explicitly selected. The latest status is the source and architecture audit at the end of this file: **the current implementation has confirmed unresolved defects and has not passed the reliability audit**. Earlier checked items describe implementation and historical test coverage, not unconditional correctness. See [the audit](docs/AUDIT_2026-10-23.md).

Work window: 2026-10-23 00:10:51–01:40:51 Asia/Shanghai.

## Requirements and intended sequence

- [x] Shared v1 event protocol; local Workers + SQLite Durable Object + D1 metadata.
- [x] Authenticated members, workspace ownership, project read/write checks and bounded messages.
- [x] Connector: authorized root, exclusions, stable scans, add/modify/delete/binary detection, durable SQLite outbox.
- [x] Real snapshots using Codecast's isolated-index module in a filtered managed repository.
- [x] Preview, current-state checkpoint, explicit confirmation and stale-preview protection for restore.
- [x] Browser project/member navigation, live activity, diff, history and restore flow with Codecast UI primitives.
- [x] Codex rollout adapter, source selection and consent. A real local transcript was read-only validated; controlled sharing tests use explicitly marked fixtures.
- [x] One-command development startup; reproducible Alice/Bob directories and separate identities.
- [x] Real edit/sync/offline/replay/restart/restore/isolation/auth/sensitive-file/ten-client acceptance.
- [x] Architecture, provenance, local operation, configuration examples and deployment preparation documentation.

## Decisions before implementation

- Interpret user's “costcode” as the previously discussed Codecast.
- Reuse Codecast treeSnapshot.ts at 5dfb04f516122fe4f59a61137219b5a4e2e1f9f8, with a small extracted Git utility. No remote-push or destructive restore helper is imported.
- Reuse Codecast Button/Badge primitives and neutral theme tokens, adapting local imports. Preserve MIT notices.
- Use a separate filtered snapshot repository to protect original Git state, omit tracked credentials, and support non-Git roots. Pin each retained checkpoint to prevent Git GC dropping history.
- Implement the missing collaboration backend on the requested local Cloudflare stack; no hosted service account is needed.
- Agent transcript collection is opt-in to an explicitly selected log source; do not upload the user's existing chat history implicitly.

## Executed verification

- `npm run typecheck`: passed after core, browser settings, permission-cache handling and restore changes.
- `npm test`: 11 tests passed. Real temporary repositories cover exclusion and junction containment, nested ignore negations, refusing state inside the authorized project before creating metadata, unchanged original staging/HEAD, exact binary/CRLF snapshots, restore confirmation/staleness/backups, file-directory transitions, excluded-content preservation, interrupted initialization, outbox persistence, state locking and Codex parsing/deduplication.
- `npm run build`: passed. Latest completed build includes shared-protocol validation of browser cache: approximately 376 kB JavaScript before gzip, 117 kB after gzip. Rollup printed two nonfatal dependency-comment annotation notices.
- `npm run test:e2e`: 17 acceptance checks passed again after the final connector scan and persistence changes, using an actual local Worker, D1, project Durable Object, two connectors and two independent directories. Latest evidence: `.local/acceptance/2026-10-22T17-28-05.998Z/result.json`.
- Acceptance includes a discarded acknowledgement after persistence, actual backend termination/restart, connector restart, queued replay, ten simultaneous local sockets, nonmember and forged-actor rejection, message limits, binary restore, Bob directory isolation, viewer role restrictions, membership revocation and logout invalidation.
- `npm run test:browser`: all 4 Chrome tests passed again on the final running stack. Independent Alice/Bob browser contexts, saved-file sharing, confirmation-gated restore, mobile overflow, outsider rejection, local connector ownership, consent before log sharing, dialog keyboard focus, recovery from invalid cached data, and clearing activity cache after authorization failure.
- Desktop/mobile screenshots: `.local/verification/alice-desktop.png`, `bob-desktop.png`, `mobile.png`.
- Custom project CLI startup was exercised against a third explicitly marked test directory on port 8793: initial capture and a subsequent real saved-file edit reached the backend and the outbox drained. The temporary connector was stopped afterward. Evidence: `.local/verification/custom-connector-result.json`.
- The browser suite was rerun after adding dialog keyboard focus and Escape handling: all 4 tests passed again.
- `npm run verify:codex -- <real-rollout> <project>`: read the actual current Codex session format without uploading its contents; identified 6 user and 22 public assistant messages at the time of that check. Evidence: `.local/verification/real-codex-source.json`.

These are local results, not an assertion of public production readiness. No upstream full-product test suite or public deployment was claimed.

## First-iteration limits (historical; superseded by the continuation below)

- Public authentication, cross-network operations, remote snapshot backup, installation package and public deployment are outside this local iteration.
- No shared-worktree CRDT, automatic merge, remote shell or remote Agent control.
- No project/team creation or invitation UI, production identity provider, retention controls, disk quotas, encrypted remote backup or restore drill.
- Entire captured file snapshots remain local. Server event history cannot reconstruct the full project after losing connector state.
- Snapshot, preview and receipt history currently accumulates without automatic cleanup. The UI shows the latest 200 local checkpoints and at most 5,000 cached shared events.
- File limit 2 MiB, scan limit 10,000 files / 100 MiB. Rename is delete plus add. ACLs, file permissions, links and empty directory history are outside recovery guarantees.
- Restore checks concurrent changes but is not a filesystem transaction across all files. A mid-operation failure leaves a retained backup and reports progress.
- Codex source is one explicitly selected JSONL file, maximum 32 MiB; automatic source discovery, rotation and other Agent adapters are unimplemented.
- Shared Agent content is limited to authored user and public assistant messages. Tool-call/result browsing, per-message audience controls, Agent launch/control and transferable execution state are not implemented. Private reasoning is excluded.
- Final local health check: Alice and Bob connectors both reported zero queued events and no capture/delivery errors. Temporary acceptance/custom-connector listeners were stopped; only the development frontend/backend and the two demonstration connectors remain, all on 127.0.0.1.
- Only Windows local execution and installed Chrome have been exercised. Ten connections use two local identities, not ten independent remote people.
- Timebox completion is not product completion; remaining checklist items stay explicit.

## Second iteration: four authorized follow-up areas

Scope confirmed by the user: tasks, project comments and context handoffs; no applying teammate files. The new authorization supersedes the previous expired timebox, but does not authorize purchases, deployment, tunnels, sending invitations or paid model calls.

### Implemented

- [x] Tasks: owner/editor creation, assignment and status; optimistic version checks reject stale updates. Comments can reference project tasks.
- [x] Context handoff: recipient, progress, next steps, task and verified project activity reference; recipient-only accept/reject. No remote Agent execution or automatic file transfer.
- [x] Password accounts: salted scrypt + server pepper, persistent throttling, hashed sessions, password change invalidates all sessions, development login disabled in real-account startup.
- [x] Teams/projects: UI creation, role management and removal, hashed one-use invitation codes with expiry/revocation, transactional ten-member capacity including concurrent joins. Codes are generated only; none are sent to external people.
- [x] Project onboarding: authenticated/paired loopback manager, explicit directory authorization, Windows folder picker, start/stop/reconnect existing connectors, fresh session credentials on reconnect.
- [x] Codex source discovery: explicitly authorized directory, metadata matching by project cwd, links skipped, source preview plus separate sharing consent. One selected source; automatic log rotation is not claimed.
- [x] Retention/storage: age/count policy, manual pins, pending/latest/preview protection, managed-repository-only GC with parent-chain compaction, expired preview cleanup, conservative storage admission and visible capture refusal. Agent message capture also respects the storage budget.
- [x] Encrypted backup: complete allowed-file archive, gzip + AES-256-GCM + scrypt, owner-scoped R2 storage, size/hash verification and transactional aggregate quota. Passwords never sent to the Worker.
- [x] Recovery: a new connector with no original snapshots downloads and decrypts the object into a separate directory; exact text/binary bytes verified, original and teammate workspaces untouched.
- [x] Distribution code: Windows ZIP includes Node 24.15.0 and dependencies, retained notices, per-user installer and launcher; Git for Windows remains an external prerequisite. No signed MSI or auto-updater is claimed.
- [x] Deployment preparation: production bindings and static assets; existing production placeholder configuration intentionally refuses use until configured. A temporary equivalent config with local stand-in IDs passed Wrangler dry-run bundle validation. No deployment occurred.
- [x] Final archive extraction, isolated installation and bundled-runtime smoke test. The installed application registered a real account, paired a browser, captured a real project directory and delivered activity through the static UI's WebSocket proxy.

### Verification already executed for this continuation

- `npm run typecheck`: passed after final application changes.
- `npm test`: 15 passed, including original recovery/outbox/source tests and new encryption/tamper/retention/quota/discovery checks. A consumed preview remains recorded until file cleanup, and tests verify it is actually removed.
- `npm run test:e2e`: 17 passed on the final connector changes. Evidence `.local/acceptance/2026-10-23T07-08-21.310Z/result.json`.
- `npm run test:extended`: 14 passed. Evidence `.local/extended/2026-10-23T06-57-36.031Z/result.json`. Uses production auth mode, actual local R2/D1/DO, concurrent invitations and a new recovery connector.
- `npm run test:browser`: all 5 Chrome tests passed together (55 seconds). Includes real-account registration, team/project creation, joining, tasks/comments/handoff, paired directory onboarding, encrypted backup/recovery and original manual-edit/restore/permission tests.
- `npm run build`: passed; final bundle approximately 401.72 kB JS / 124.02 kB gzip and 35.68 kB CSS / 8.70 kB gzip. Existing two dependency annotation notices remain nonfatal.
- `prettier --check .`: passed. No dependency packages were added.
- Production-equivalent dry run: Worker bundle 808.60 KiB / gzip 129.35 KiB, local stand-in resource IDs only; printed `--dry-run: exiting now`. Literal production config retains deliberate unresolved IDs and an invalid placeholder bucket name.
- Screenshots inspected: `.local/verification/collaboration-desktop.png`, `collaboration-mobile.png`, `storage-desktop.png`.
- Browser verification found and fixed a race where cleanup could clear a newly re-entered backup passphrase; the field is now disabled while an operation finishes. The legacy revocation test timer now starts after the database tool completes, so Wrangler process startup is not counted as socket propagation delay.
- Windows package: `dist/ColloSys-Windows-2026-10-23T07-05-26-643Z.zip`, 145,107,452 bytes. SHA-256 `ab1b8edeb24f1b567729f4b981b2e2fdff46af9950ff2acf7705ad55fccfc4f6`.
- `node node_modules/tsx/dist/cli.mjs tests/package-smoke.ts dist/ColloSys-Windows-2026-10-23T07-05-26-643Z.zip`: passed. Evidence `.local/installation/2026-10-23T07-09-43.420Z/result.json` and `installed-app.png`; completed at 2026-10-23T07:14:09Z. Eight checks cover ZIP extraction, isolated installation, bundled Node startup, demo login exclusion, real registration, pairing, project capture and WebSocket delivery. Owned test services were stopped afterward.
- The installed application was started directly with its bundled Node runtime for the smoke test. A subsequent attempt to execute the installed desktop VBS/PowerShell entry point was rejected by automatic approval review (`blocked by policy`) before execution. That desktop entry point and shortcut remain unverified; no workaround was attempted.

### Current boundaries and unverified external work

- No Cloudflare resources purchased, public deployment, tunnel, real invitation delivery or paid model calls. Public TLS, cross-network/sleep recovery, real ten-person load and production CPU/resource limits remain unverified.
- Local R2 is still on this computer, so it is not disaster protection against machine loss. Only configured remote storage may be labeled remote; the UI distinguishes them.
- Backup archive limit 24 MiB compressed; quota 512 MiB per account/project. No partial backup is labeled successful. Data capture remains limited to 2 MiB/file, 10,000 files / 100 MiB scan.
- Storage budget is application admission control, not a filesystem hard quota. Protected snapshots and offline queues can block new capture. Server events are retained; task/comment/handoff UI shows the newest 200, event cache 5,000.
- Recovery previews expire after 24 hours. Ordinary restore previews expire after ten minutes; live multi-file restoration remains non-atomic and retains a current-state checkpoint.
- Password accounts are real but no forgotten-password/email verification/SSO/MFA flow exists. Seven-day sessions require signing in and reconnecting after expiry. Native folder-picker code is implemented; browser automation exercised typed paths.
- Packaging is Windows ZIP + PowerShell, with bundled Node and npm dependencies but external Git. No code signing, MSI, automatic updates or non-Windows packaging. Archive extraction, installation and the installed runtime passed; the VBS desktop launcher and shortcut were not executed because automatic approval review blocked that verification.
- Original failed package directory and zero-byte ZIP `dist/ColloSys-Windows-2026-10-23T07-01-06-112Z*` were retained: automatic approval review rejected their cleanup with a policy block. These are not deliverables.

## Third iteration: frontend source reuse and workspace redesign

User requested substantially better UI and direct reuse of the reference products where possible. Codecast's MIT source was inspected and adapted; no Delta code or brand assets are included. Scope and exact source files are recorded in `docs/FRONTEND_REUSE.md` and `THIRD_PARTY_NOTICES.md`.

- [x] Actual Codecast navigation rows, conversation header frame, collapsible file header, unified-diff parser and minimal-style light/dark tokens integrated with the existing backend.
- [x] Persistent compact navigation, activity list and detail pane; removed the large introductory dashboard copy and nested presentation cards.
- [x] Agent session grouping, chronological captured messages and stable session selection during updates.
- [x] Separate task/discussion/handoff tabs with forms shown on request; keyboard tab navigation.
- [x] Responsive mobile drawer and list/detail navigation; persisted dark mode.
- [x] Correct old/new diff line numbers; no phantom source line from a patch's final newline.
- [x] `npm run typecheck` passed. `npm test`: 17 passed, including two parser regressions.
- [x] `npm run build` passed; two existing nonfatal Zod annotation notices remain.
- [x] `npm run test:browser`: all 5 Chrome scenarios passed together in 59.4 seconds. Extended coverage includes mobile list/detail navigation, dark mode, captured session grouping and exclusion of unconsented historical messages. The first run found a partially obscured mobile drawer dismiss target; its clickable bounds were corrected before the passing run.
- [x] Final build: 410.09 kB JavaScript / 126.91 kB gzip; 42.45 kB CSS / 9.55 kB gzip. `prettier --check .` passed.
- [x] Actual application screenshots captured for desktop diff, dark mode, mobile and a four-message session. Evidence: `.local/design-study/redesign-desktop.png`, `redesign-dark.png`, `redesign-mobile.png`, `redesign-conversation.png` and `result.json`. Real saved files and visibly labelled conversation fixtures pass through the connector and database; no frontend seed data is embedded.
- [x] Refreshed Windows archive: `dist/ColloSys-Windows-2026-10-23T07-51-12-750Z.zip`, 145,126,006 bytes; SHA-256 `718b9effc6fe7f34c57e3fa56bbc1a1b9fbaa87e79fe07f8aee89dc7d8725f45`. Thirteen archive entries were compared byte-for-byte by SHA-256 with the tested frontend build, adapted source, attribution and Codecast license; all match. Local state and credential configuration were excluded. Evidence: `.local/design-study/package-result.json`.
- The earlier installation smoke result applies to the previous archive. This UI-only refresh did not repeat full installation or execute the previously blocked desktop launcher; current checks cover the running development application and the new archive's frontend contents. The launcher limitation remains unchanged.

No backend, connector, authentication, snapshot or restoration implementation was changed in this iteration. Previously recorded integration results remain historical evidence; the current browser suite rechecks the real application flows. Full Codecast frontend parity, markdown/tool-call rendering, remote Agent control and public deployment are not claimed.

## Fourth iteration: source-depth and architecture audit

The user challenged both the depth of UI reuse and the underlying architecture. This iteration performs inspection and isolated fault reproduction; **no product fixes, new package or deployment are included**. Full findings, source locations, test boundaries and repair acceptance criteria are in `docs/AUDIT_2026-10-23.md`. The current Windows archives contain the unresolved implementation defects below.

### Confirmed scope and findings

- Codecast's complete repository was obtained at `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`. Critical UI/state/synchronization/snapshot paths were inspected; its full product and upstream tests were not run. This version is React/Vite with React Router and Next import compatibility shims, not a Next application. The previous frontend reuse rationale is corrected.
- Actual reuse remains selected navigation/header/file-header/parser/theme components. The full persistent workspace, conversation pagination, structured rendering, diff engine and state model have not been ported.
- Delta findings refer only to public plugin source at `500bde479759fa0d62a7e525afda7b9ccd6e9a5c`, not its complete UI or private backend. No Delta implementation was added to the product.
- [ ] A01 / P1: isolate inherited Git routing environment; a fixture reproduced mutation of the original repository's HEAD/index.
- [ ] A02 / P1: validate committed paths and bytes against the checkpoint manifest. Global Git exclusions, oversized `.gitignore` and Windows case-only path changes produced successful metadata with missing/mismatched Git content.
- [ ] A03 / P1: fail closed on unapplied sharing rules. An oversized `.collosysignore` allowed explicitly excluded test plaintext into the outbox.
- [ ] A04 / P1: quoted JSON credential names bypass the current redaction pattern. Function reproduction and source call-chain tracing are confirmed; no real credentials or external upload were involved.
- [ ] A05 / P1: bind session issuance to the credential version. An in-flight old-password login created a valid session after password change, using production handlers and an isolated SQLite D1 adapter with controlled response latency.
- [ ] A06 / P1: scope StoragePanel state and delayed responses to the active project/connector. A real browser with intercepted endpoints sent A's retention policy to B's endpoint; no actual history deletion was performed.
- [ ] A07 / P2: give backup reservations immutable upload generations and conditional completion. Actual local Worker/R2 accepted stale bytes as a newly reserved same-ID backup's completion.
- [ ] A08 / P2: define and enforce permission revocation at the publication boundary. Actual local Worker accepted an event request begun before revocation and completed after it; new requests were correctly rejected.
- [ ] A09 / P2: reject Codex sources with junctions in ancestor directories, not only a linked final file.
- [ ] A10 / P2: make connector reauthentication explicit after logout/login. Real manager/connector with a local test auth service retained the old credential and queued events with a visible 401; manual reconnect exists.
- [ ] Add session and collaboration-history pagination and data adapters before porting the complete target workbench flow. Keep remote Agent control and applying teammate files outside the selected scope.

### Verification executed in this audit

- `npm run typecheck`: passed.
- `npm test`: 17/17 passed, approximately 14.68 seconds. Existing tests do not cover the newly reproduced failures.
- `npm run build`: passed; JS 410.09 kB / gzip 126.91 kB and CSS 42.45 kB / gzip 9.55 kB. Two existing nonfatal Zod annotation notices remain.
- Isolated repro scripts executed under `.local/audit/connector`, `.local/audit/backend` and `.local/audit/integration`. Durable result copies are under `docs/audit-evidence/2026-10-23/`, with SHA-256 equality checked against the original JSON files before formatting.
- Connector fixtures did not alter global Git configuration or user project files. Browser project-race writes were intercepted. Backend fixtures used separate local persistence. Existing development listeners were left running; owned test processes were stopped.
- No repeated full acceptance/browser/installation suite is claimed in this audit. No upstream product execution or public-network validation is claimed. Previously blocked desktop-launcher verification was not retried.
- Retention-interruption and deletion-heavy quota probes did not confirm defects; they are explicitly excluded from the findings. Existing documented non-atomic multi-file restoration is not relabeled as a newly reproduced bug.

Repair order: file/snapshot/sharing isolation → credential, publication, backup and UI context consistency → paginated product data contracts → complete Codecast core-workflow adaptation → expanded acceptance and a newly verified package. Until that work is completed, the current prototype is not a reliable release.

## Fifth iteration: audit repairs and persistent core workbench

This section supersedes the fourth iteration's unresolved status; its report and original evidence remain historical. The user asked to complete each step properly. Exact repairs, test boundaries and remaining external work are in `docs/REPAIR_2026-10-23.md`; source-by-source UI reuse is in `docs/FRONTEND_REUSE.md` and `THIRD_PARTY_NOTICES.md`.

- [x] A01/A02: sanitize Git environment/configuration, build exact captured-byte trees and compare manifests; preserve original HEAD/index. Validate legacy snapshots before restore, preserve invalid records and capture a new baseline.
- [x] A03/A04/A09: fail closed on invalid sharing policies, redact quoted JSON credentials in shared payloads, reject source ancestor junctions through checked reads.
- [x] A05/A07/A08: bind session issuance to verified credentials, isolate backup upload generations and conditionally commit, serialize final event authorization with revocation and guard collaboration SQL mutations.
- [x] A06/A10: isolate project/connector settings and unsaved edits, distinguish capture/delivery failures, provide explicit credential reconnect without losing queued events; serialize manager lifecycle and await in-flight creates at shutdown.
- [x] Persistent activity/session/message/checkpoint-file pagination, fixed-head cursors, durable event links and history search; no dependence on the live cache for complete history.
- [x] Actual Codecast Pierre renderer/loading hook, diff model, Markdown structure, scroll functions and detail layout adaptations. Long-session virtualization, reader-anchor preservation, multipart file inventory, split/wrap diff controls, mobile Back and keyboard behavior connected to real data.
- [x] Tasks/comments/handoffs page past the previous limit; loaded older records refresh their versions/status. Polling and mutations cannot discard loaded pages.
- [x] Browser regressions cover delayed A→B→A responses, expired session versus wrong password, bursts over one page, older task edits, accepted handoffs, deep links, initial-load updates, multipart completion and failed-detail retries.
- [x] Audit evidence JSON restored byte-for-byte from original isolated results after formatting; all five hashes match. Added `docs/audit-evidence` to formatting exclusions.

### Executed checks on the repaired implementation

- `npm run typecheck`: passed, including final retry changes and formatting.
- `npm test`: 32/32 passed, 18.67 seconds.
- `npm run test:browser`: 11/11 passed together, about 1.2 minutes. The five original flows use real local services; six regression tests use controlled, explicitly labelled fixtures. Actual rendered Pierre code and Markdown are asserted.
- `npm run test:e2e`: 17/17 passed; `.local/acceptance/2026-10-23T09-21-49.846Z/result.json`.
- `npm run test:extended`: 14/14 passed; `.local/extended/2026-10-23T09-19-45.732Z/result.json`.
- `npm run test:reliability`: 6/6 passed on the final Worker/history changes; `.local/reliability/2026-10-23T09-29-40-586Z/result.json`.
- `npm run build`: passed, 9.33 seconds. Entry JS 635.34 kB / gzip 197.36 kB; CSS 46.58 kB / gzip 10.33 kB. Pierre renderer 498.51 kB / gzip 140.80 kB and language/highlighter chunks load on demand. Existing Zod annotation warnings and chunk-size notices remain nonfatal; no claim of full performance tuning.
- Actual browser screenshots inspected: `.local/verification/workbench-diff.png`, `workbench-session.png`, `workbench-mobile.png`; screenshots use explicitly labelled test data.
- Connector reviewer independently verified legacy snapshot upgrade, integrity tests and manager shutdown. Integration review identified further page/state races and retry errors; repairs have targeted and complete browser coverage.
- `npm audit --omit=dev`: zero known production dependency vulnerabilities. The full dependency tree has seven development/build-chain advisories (five high, two moderate), recorded as a release-hardening limitation because distribution currently includes build tools.

### Packaging and remaining boundaries

The new archive and its own isolated bundled-runtime verification are complete. Earlier archives do not contain this iteration's fixes; current verification does not rely on earlier smoke tests.

- Final `prettier --check .` passed. A formatting-only second pass was needed for two test files.
- Final independent integration review closed both detail-retry findings by inspecting request dependencies and fail-once tests; no remaining blocker was found in that final delta.
- The first package candidate `ColloSys-Windows-2026-10-23T09-35-56-519Z.zip` was generated but is not the selected deliverable: its document links exposed that `PLAN.md` was missing from the packaging file list. The packager now includes it. The candidate is retained.
- Selected package: `dist/ColloSys-Windows-2026-10-23T09-40-15-551Z.zip`, 163,684,052 bytes. SHA-256 `1ffa555426786a5cfc80f03658c1ba185261aee0f421fafc96964830924cc5f3`. Two documentation corrections were synchronized into the candidate before final hashing and smoke testing; no runtime code changed after its build.
- 423 application/source/build/document/license files matched the tested workspace by SHA-256, including migration 0003, complete frontend assets, actual upstream adaptations and `PLAN.md`. No local state or credential configuration was included. Evidence: `.local/verification/repaired-package.json`. This comparison predates the final result additions to this source PLAN and the external distribution verification report.
- `node node_modules/tsx/dist/cli.mjs tests/package-smoke.ts dist/ColloSys-Windows-2026-10-23T09-40-15-551Z.zip`: passed all ten checks, completed 2026-10-23T09:48:29Z. Extracted and installed into an independent directory, started bundled Node, verified production-mode login, real registration, pairing, directory capture, WebSocket delivery, the packaged lazy diff renderer, and a subsequent real saved-file update. No browser page errors. Evidence: `.local/installation/2026-10-23T09-45-08.981Z/result.json` and `installed-app.png`; screenshot inspected. Test-owned processes stopped afterward.
- `dist/README.md` and `dist/VERIFICATION.md` identify this archive and its limitations. Previous archives and failed attempts remain historical artifacts, not the current deliverable.

The selected local workflow is implemented and validated; a complete Codecast/Delta clone, public deployment, real multi-device ten-member testing, signed installer/updater, account recovery/MFA and production resource/backup operations are not completed. The original blocked VBS/PowerShell desktop-launcher test is not retried; direct bundled-Node startup does not verify the desktop shortcut. Capture/backup size limits and non-atomic multi-file restore remain explicit in the architecture and repair notes.

### Interactive launch follow-up

On 2026-10-23, the user requested opening the app. Starting the D-drive source checkout with the default C-drive data directory failed during the first local D1 migration with a workerd internal error. Starting the same code with `COLLOSYS_DATA=D:\Github_Ku\ColloSys\.local\app` succeeded; the built frontend and production-mode local backend returned HTTP 200, with listeners only at 127.0.0.1:5173/8787/8790. The normal application startup requested opening the paired browser window. That process is intentionally left running for the user.

No runtime code or existing data was changed to work around the launch. Cross-drive persistence compatibility is a newly observed unresolved startup issue; its exact upstream cause is not established. The earlier isolated package test used app/data paths on the same drive and did not cover this configuration.

## Sixth iteration: correct the frontend transplant scope

The user rejected the previous login and interior UI and explicitly repeated that the complete existing frontend should be moved, not rebuilt from selected components. The earlier functional pass/package is not product acceptance. No new finished-product or installer claim is made in this iteration.

- [x] Import the complete tracked Codecast source at `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8` into `third_party/codecast/upstream`, preserving original routes, DashboardShell/DashboardLayout, state store, synchronization/dispatch, styles, editors, settings, shared contracts, original Convex functions and platform mirror. No upstream implementation files were changed.
- [x] Record all upstream Git blobs in `source-manifest.json`. All 9,854 regular files verified; Windows CRLF conversion in 9,437 files is explicitly checked by matching the normalized blob. Two unsupported convenience symlinks are documented. Independent review confirmed that the manifest itself matches `git ls-tree` at the pinned commit.
- [x] Prepare a Windows reference launcher and reproducible setup. Bun 1.3.13 is checked before reuse; the pinned Convex Windows archive and executable are checked by SHA-256. Lifecycle scripts and upstream deploy/dev orchestration are not invoked.
- [x] Run the real original frontend and original persistent backend separately at 127.0.0.1:3297/3298/3299. The local request filter at 3300 denies external action requests and allows only the backend's own two public JWT discovery documents. All four listeners were checked as loopback. Existing ColloSys at 5173/8787/8790 remained running.
- [x] Disable upstream telemetry configuration in this reference and use a restrictive browser CSP. Serve original JetBrains Mono and Fraunces font families locally; retain font licenses and emit them with the build.
- [x] Build the complete frontend, not just login or selected components. Initial full build passed in 1m44s; large-chunk and mixed dynamic/static import warnings remain. Final font/license build and its browser test are recorded below when complete.
- [x] Register a real local password account, log in again after the reference backend was restarted, create a real task through the original UI, and retrieve it after password login in another empty browser context. No seeded session world, injected auth token, mocked query or forced store hydration was used.
- [x] Add `npm run test:codecast`: original login, real registration, task creation, wrong-password rejection, fresh-browser task retrieval, original settings/Minimal style, external-fetch rejection and browser-error/network checks. First full run passed eight checks; `.local/codecast-reference/acceptance-1792752909949/result.json`, completed 2026-10-23T10:55:22Z. This test establishes the original reference workflow, not ColloSys integration.
- [x] Keep reference source/dependencies and `dist/codecast-reference` out of the old Windows installer. Preserve the original application/data and the historical package.
- [ ] Resolve the integration route: complete Codecast stack plus our safe snapshot/restore connector, or the original frontend with authentic adapters for the existing Cloudflare backend. This materially changes the backend, so the distinction was asked explicitly rather than silently replacing it. No answer had arrived when this section was written.
- [ ] Connect real ColloSys manual file capture, checkpoints, restore previews/confirmation, team collaboration and durable replay to the complete frontend. The reference is not this integration.
- [ ] Adapt original hosted-only onboarding, install commands, OAuth/email controls and execution capabilities to the actually supported local product. Upstream `EmptyState.tsx` has illustrative sample cards behind onboarding; these are not captured activity and must not be treated as real records.
- [ ] Repeat real two-directory edit/share/offline/replay/restore acceptance against the integrated original frontend before any new product-complete or packaging claim.

Existing ColloSys regression checks this iteration: `npm run typecheck` passed; `npm test` passed 32/32 (38.68s); `npm run build` passed (47.67s). These are separate from the original application. The original `cast check` tool is unavailable and no full upstream typecheck/test-suite result is claimed. Setup replay and source verification passed. A read-only review found one nonblocking Bun-version pin gap, now fixed. The isolated reference's first request filter incorrectly blocked local JWT discovery; that was corrected to the exact local allowlist before the passing authentication acceptance run.

Reproducible commands and scope are in `docs/CODECAST_FRONTEND_MIGRATION.md`. This work is a concrete complete-source/runtime baseline; it is explicitly not the completed ColloSys frontend migration.

### Final reference verification

- The final full upstream production build passed in 1m30s. It contains local regular/italic Fraunces and JetBrains Mono assets, plus all three application/font licenses. Build output: `dist/codecast-reference`; log: `.local/codecast-reference/build-final.log`. Chunk-size and dynamic/static import warnings remain.
- Final `npm run test:codecast` passed all eight checks against that build. Evidence: `.local/codecast-reference/acceptance-1792753384862/result.json`, with actual browser screenshots in the same directory. The test explicitly loads the local Fraunces font and asserts the original Minimal root class after using the settings control. There were no browser page errors or external HTTP requests.
- An intervening run timed out waiting for the browser's broad `load` event on the Tasks route. The acceptance now waits for DOM readiness plus the actual task/settings controls and persisted record, rather than unrelated page loading. The failed run is retained at `.local/codecast-reference/acceptance-1792753287160/result.json`; it is not counted as a pass.
- Final source re-verification passed 9,854/9,854, and formatting passed for the changed integration scripts/docs/package files. The earlier ColloSys typecheck was repeated after the packaging exclusion and passed. No further integrated-application code was changed after the separately passing 32 tests and build.
- The built original reference remains available on loopback at port 3297; existing ColloSys remains on 5173. No public services were purchased/deployed and no new installer was issued. The frontend/backend integration choice remains pending.

## Seventh iteration — authorized complete Codecast foundation

The user chose the complete Codecast project plus the existing checkpoint/restore connector. The earlier pending architecture decision is resolved. Codecast's real auth/store/projects/tasks/comments and Convex backend are retained. The old Workers application and its data remain preserved.

- [x] Implement a reproducible full fork: copy every pinned upstream regular file and apply the explicit owned patches in integrations/codecast. The original upstream stays byte-verifiable.
- [x] Add native Convex tables/functions for scoped device credentials, workspaces, persisted versioned events, transactional dedup/ACK and cursor replay. Access uses Codecast's actual project access key, not team routing or a client userId.
- [x] Reuse existing root-scoped connector, durable outbox, separate Git snapshots and preview/backup/stale-check restore.
- [x] Extend the original project page with Workspaces, using the original buttons/dialogs/diff component. Replace hosted first-run sample cards and unavailable OAuth buttons in the local fork.
- [x] Finish actual two-member browser and file acceptance, restart verification and 10 local subscriptions.
- [x] Finish typecheck/tests/build and independent read-only review; record passing and failed runs below.
- [x] Update default startup and user-facing documentation after the integrated build passes. `npm start` now starts the complete Codecast application at 127.0.0.1:3407; former commands and data remain under the explicit legacy paths.

During implementation the first API checks passed real account/team/project creation, two connected directories, manual add/change/delete synchronization and sensitive-file exclusion. The first browser run used the cold upstream development graph and was interrupted to switch to a production build. It is not a completed acceptance run. An initial build from the repository root emitted a Tailwind content warning; rebuilding from the actual upstream web working directory corrects this. Neither result is claimed as product acceptance.

Review found and implementation addressed: authSessions validation after logout, stale responses when switching directories, accurate delivery-state UI, and a launcher lock before source preparation. Subsequent review found a build-input fingerprint race and premature manager readiness; preparation/build now verify the same captured inputs and manager readiness waits for directory resume and launcher-file persistence. Final read-only review closed both findings without further actionable defects in that delta.

### Executed integrated verification

- `npm run typecheck`: passed on final connector/manager changes. This checks the root application's connector/shared/scripts/tests and legacy packages; it is not a complete upstream Codecast typecheck. The upstream `cast check` tool remains unavailable. Convex extensions were bundled and executed on the real local backend, not substituted by mocked queries.
- `npm test`: 32/32 passed on the final changes, 19.64 seconds. These include snapshot byte integrity, original Git preservation, junction/credential exclusion, stale restore, durable queue, retention and encrypted archive regressions. Legacy Worker tests remain regression coverage of the preserved implementation, not proof of the new Convex functions.
- `npm run build`: the complete integrated frontend built successfully in 1m12s. A subsequent `npm start` exercised automatic preparation and rebuilding for changed integration inputs; that build passed in 1m4s. Logs: `.local/codecast-app/build-final.log` and `build.log`. Existing large-chunk and mixed dynamic/static import notices remain; no performance-optimization claim. The corrected build runs from the actual fork web directory, with working Tailwind content detection.
- `npm run test:integration`: the final run passed 12/12 against the integrated production build, with no browser page errors. Evidence: `.local/codecast-app/acceptance-1792757640466/result.json`; screenshots `team-workspaces.png` and `restore-preview.png` were inspected. Real local accounts/team/project, original password login, original project navigation, actual browser directory consent, two independent roots, file add/change/delete, cross-member display, durable queue/replay, duplicate/collision handling, forged actors/workspaces, sensitive-file exclusion, outsider rejection, owner-only restore, stale-preview refusal, backup-before-restore and unchanged original index/B directory were exercised.
- Cold short project URLs outside the active workspace resolve through actual project permissions and the original workspace switch. An earlier run stalled in that case; it was repaired before the passing final run. Failed/interrupted runs remain recorded and are not counted as successful acceptance.
- Ten independent WebSocket clients received a real saved-file event. They used two local test identities on one machine; this is not ten real users or an across-network test.
- The real Codex adapter read an explicitly labelled test-format JSONL fixture. This verifies parsing, project scope and sharing, not execution of a real Agent or integration of imported messages into the native Inbox.
- Signing out was followed by real requests using the retained old JWT. Local access, device credential minting and connector operations rejected it. Device event authorization remains scoped to its workspace/project and checks current project access.
- Real outage/restart: `node tests/codecast-restart.mjs before .local/codecast-app/acceptance-1792757640466` stopped only the verified native test backend, then captured a real file edit into SQLite while it was unavailable. The integrated application was fully stopped and restarted via `npm start`; `node tests/codecast-restart.mjs after .local/codecast-app/acceptance-1792757640466` passed. Prior account, event IDs/sequences and checkpoints persisted, the pending edit replayed exactly once, and B remained unchanged. Evidence: `restart-result.json` beside the final acceptance result. Credential-bearing `restart-test.json` remains private local test state.
- Duplicate startup was rejected before overwriting the running fork; the generated source modification time remained unchanged. The final default startup resumed configured directories before reporting readiness. All five application service ports (3407–3411) were verified bound only to 127.0.0.1. The app is intentionally left running, and its launcher requested opening the paired browser URL without printing the pairing secret.
- Full original-source verification passed 9,854/9,854 regular files (9,437 exact CRLF-normalized Git blob matches; two documented convenience symlinks omitted). No upstream implementation source was edited. The complete runtime fork records 17 explicitly changed/added files and its preparation fingerprint.

### Current boundaries after the foundation change

The complete Codecast source, original frontend/auth/store and real Convex backend now form the default application. The added saved-file/checkpoint/restore workflow is integrated and locally verified. This is not a claim that every original hosted feature or every earlier legacy feature has been adapted.

- Native Codecast Inbox projection and conversation handoff for collected Agent sessions remain unfinished; captured Codex messages currently appear in project activity. Tasks/comments retain their original implementation, with no claim of exhaustive upstream feature acceptance.
- Legacy accounts/projects are preserved in their former data directory and have not been migrated. The new application uses a separate native Codecast account database; first use requires local registration.
- Snapshot retention/encrypted-archive core code is retained, but the former backup/retention settings UI and its remote-storage backend are not migrated to this Convex product. Checkpoint bytes remain on the source device; server activity is not a full remote backup.
- The complete new application has no new installer. The earlier Windows archives contain the former custom frontend/Workers architecture, are explicitly labelled historical in distribution docs, and cannot be used as evidence for this migration. `legacy:package:windows` is an explicit legacy command.
- Production authentication/recovery, public deployment, TLS/cross-network behavior, remote-device reconnect, backup operations and resource limits remain unverified. Original hosted Agent, terminal and external integrations are not advertised as working local capabilities; outbound backend requests are restricted. No paid model calls, public deployment, tunnels or invitation delivery occurred.
- Full upstream typecheck/tests and full dependency/security/performance audit remain outstanding. The recorded tests prove their stated local workflows, not complete product readiness.

## Eighth iteration — product workbench and independent desktop entry

The user rejected the inclusion of the original marketing website and explicitly confirmed an independent desktop software window. The default entry now uses the actual pinned Codecast desktop framework with the original product workbench. Browser access is an explicit debugging path. This iteration does not issue a new installer or claim all earlier product work is complete.

- [x] Remove original marketing page imports/routes, promotional assets, installer scripts and website metadata from the product build. Preserve the full immutable reference separately. Anonymous root and retired website URLs resolve to local login with the correct product return path.
- [x] Reuse `platform/packages/desktop` through a separately generated derivative, retaining the upstream MIT license and recording its exact local-origin validator patch. Bundle the original preload/bridge for sandboxed renderers. The original platform mirror remains unchanged.
- [x] Implement the Windows product frame/menu, local pairing, native folder picker, per-profile login persistence and restricted native IPC/network permissions. Deny screen capture and capability expansion. Default startup launches the desktop and manages only the services it owns.
- [x] Fix two issues found by actual Windows testing: custom BrowserWindow subclasses disappeared from Electron's static enumeration; original pending-state beforeunload silently canceled quitting. The adapter now returns genuine BrowserWindow instances and provides an explicit Keep open/Close now native prompt.
- [x] Keep the preparation fingerprint check after desktop preparation as well as the original source preparation. Stop secondary desktop processes before they initialize Chromium against an already-used profile, while retaining original single-instance focus behavior.

### Executed checks and evidence

- `npm run typecheck`: passed. This remains the root connector/shared/legacy typecheck, not a full upstream Codecast typecheck.
- `npm test`: 32/32 passed, 18.98 seconds; `.local/codecast-app/test-desktop-final.log`.
- `npm run build`: passed in 56.21 seconds; `.local/codecast-app/build-desktop-final.log`. The manifest asserts that no original marketing page module enters the product build. Existing upstream large-chunk and mixed-import notices remain. A later desktop single-instance adapter change triggers the normal launcher rebuild, recorded below.
- `npm run test:integration`: 13/13 passed, `.local/codecast-app/acceptance-1792761967800/result.json`. This extends the prior 12 real collaboration checks with anonymous root/retired-route login, absent marketing chunks/metadata and absent installer/RSS assets. The final native-window tests cover the subsequent desktop-only changes.
- `npm run test:desktop -- .local/codecast-app/acceptance-1792761967800`: 8/8 passed, `.local/codecast-app/desktop-acceptance-1792764273153/result.json`. Actual visible Electron windows exercised original password login/project navigation, sandbox/IPC boundaries, real Windows folder-picker opening/cancellation, directory consent/connector creation, real file diff and confirmed byte restoration, unchanged B directory, close/reopen login persistence and both pending-state close choices. No page errors occurred.
- The folder-picker cancellation test observes the actual OS dialog and uses Windows UI Automation plus its standard Cancel command; its screenshot is `native-folder-picker.png`. The subsequent directory-selection response and close-prompt button responses are explicitly controlled test responses. The native bridge, authenticated backend, files, checkpoint and restore actions remain real. Renderer screenshots `desktop-login.png`, `desktop-workbench.png`, `desktop-restore.png` were inspected.
- Original source re-verification passed 9,854/9,854 regular files, including 9,437 CRLF-normalized matches and two documented omitted symlinks. The complete generated fork now records 19 explicitly changed/added files, plus the separately recorded desktop derivative.
- Final read-only integration review found no remaining blocking defect in the window constructor, close prompt, build fingerprint or ownership of service shutdown. Runtime verification is separate from that static review.
- Changed integration/scripts/docs/package files passed formatting checks. Electron 44.3.0 Windows x64 was downloaded and verified against its pinned SHA-256; original runtime and Chromium notices are retained. A full dependency audit is not claimed; installation reported eight development-tree advisories (three moderate, five high).

### Final normal-start verification

- The normal launcher rebuilt the final desktop adapter successfully in 51.81 seconds (`.local/codecast-app/build.log`). A repeated start originally let the second Chromium process touch the active cache before quitting; acquiring the same single-instance lock before framework initialization removes that initialization and still focuses the original window.
- Testing the actual `npm start` entry exposed a separate Windows launch defect: the shared helper hid the desktop process along with background services. The launcher now uses a visible process for the requested interactive desktop while retaining hidden background helpers. The hidden startup attempt was stopped and is not counted as a passing first launch.
- The final desktop acceptance passed 8/8 again after these changes: `.local/codecast-app/desktop-acceptance-1792764651318/result.json`, with no page errors. Its actual native picker and desktop screenshots are retained. Test profiles remain isolated from the default user profile.
- Actual `npm start` then opened one visible native ColloSys window; a second `npm start` exited successfully while preserving that same visible process. Closing the native window exited the owning launcher with code 0 and stopped all five product service ports (3407–3411). The old 5173 application and untouched 3297 reference remained running. Evidence: `launcher-result.json` and `native-default-start.png` beside the final desktop acceptance result.
- The default desktop was restarted for the user after verification. It uses the local account database and the normal `desktop-profiles/default` profile, with no automatic test-account login.

### Failed attempts and remaining scope

Earlier desktop runs are retained as failures: `desktop-acceptance-1792763224864` exposed the native-window enumeration bug; `desktop-acceptance-1792763331059` passed six workflows but hung on cleanup because beforeunload blocked quit. It was stopped and explicitly marked failed. Subsequent native-picker harness attempts used the launcher PID instead of the Electron main PID, assumed an unavailable UI Automation pattern, or looked for a nonexistent web Cancel button; those failed runs were not counted as passes. The passing test uses the real main PID, the observed native dialog and the application's existing Escape dismissal.

Original Inbox projection/conversation handoff for captured Agent sessions, legacy backup/retention settings migration, a new installer, full upstream tests/typecheck, exhaustive feature/security/performance verification and public deployment acceptance remain outstanding as recorded above. Desktop login uses the current Codecast account database; old legacy accounts have not been migrated. File checkpoints are local to their source device, not remotely backed up. No public services, tunnels, paid API calls, invitations or desktop shortcuts were created.

## Ninth iteration — evidence-based specialization audit (2026-10-24)

The user again rejected shallow reuse and asked for ColloSys's own specialization on Codecast/Delta foundations. Importing the complete upstream and passing selected flows are not acceptance of either product design or the whole backend. Keep the original workbench and desktop framework; investigate and repair integration gaps against actual upstream patterns.

- [x] Trace the current frontend, native store/cache/navigation, local connector and authenticated backend together; record concrete defects and evidence, including limitations of publicly available Delta sources.
- [x] Integrate collaboration reads with the original store and ownership boundaries; preserve useful state, deep links, complete checkpoint inspection and honest failure/retry behavior. Use original visual/interaction primitives instead of a replacement aesthetic.
- [x] Audit and fix confirmed authorization, event consistency, delivery and snapshot/recovery defects with focused failure tests. Preserve original Git and independent member directories.
- [x] Run root typecheck/tests/full product build and real local integration/desktop acceptance, including the new failure cases; inspect original-versus-integrated UI behavior. Record actual results and remaining requirements without a finished-product claim.

Current audit scope is the full saved-file capture/share/inspect/restore workflow and its integration quality. It does not silently authorize public deployment, paid models or private Delta code reuse. Remaining product areas retain their explicit status until separately implemented and verified.

### Source findings and implemented repairs

The complete source trace, concrete findings and current versus historical reuse are in `docs/SPECIALIZATION_AUDIT_2026-10-24.md`. `docs/SOURCE_STUDY.md` and `docs/FRONTEND_REUSE.md` now explicitly mark their selected-component architecture as historical. Delta's local research copy contains four saved public plugin files, not an intact full checkout or evidence of its private backend.

The original Codecast workbench now feeds collaboration records into registered collections in its real store/IDB (cache schema 69), uses project/principal ownership boundaries, catches up a changed head without skipping pages, loads event details independently by URL, and assembles checkpoint parts with explicit completeness. The list/detail surface uses the original Timeline Rail, SegmentedToggle, DetailSplitLayout, pane-aware router and DiffView. Hidden panes suspend local-directory polling. Older async requests cannot place prior-account or prior-directory data into the new scope. These are additions to the actual workbench, not another selected-component replacement.

The backend baseline proved that revoked JWTs still accessed native project APIs, duplicate or inconsistent checkpoint parts were accepted, and two simultaneous joiners could grow a nine-person team to eleven. Owned patches now enforce active sessions on public functions and the browser JWT HTTP replay path, checkpoint-part consistency in the ingest transaction, and team capacity at membership insertion. Source device authorization remains separately revocable; signing out of the browser is not claimed to revoke an independently issued device credential. Existing over-capacity test teams are not silently modified.

Connector repairs address Codex cross-project turns, malformed log rows, simultaneous stale PID lock recovery and checking junction ancestors before creating state directories. Real fault tests also verify already-correct outbox/ACK and backup-before-restore behavior rather than describing them as newly found defects.

Final view review additionally fixed preview/path binding for Codex source confirmation, disabled mutable consent controls during requests, corrected excluded binary files falsely described as captured, and made historical restore availability conditional on retention. A loading detail no longer labels a new checkpoint as an unverified older record before its summary arrives.

### Actual verification

- `npm run typecheck`: passed. `npm test`: 47/47 passed (14.9s), including eight new connector failure cases and seven collaboration-model cases. The latter cover head-gap reconciliation, cursor progress, principal epochs, project isolation and checkpoint assembly.
- `npm run typecheck:integration`: passed on the final view changes, 12 owned files checked against actual generated upstream types. This new command catches the previously unchecked extension layer. It refuses a stale prepared fork. It is not the full upstream test/typecheck suite; `cast check` remains unavailable.
- `npm run build`: passed the complete application. Final startup rebuilding after the last view fixes also passed, 55.19s, in `.local/codecast-app/build.log`. Existing upstream chunk-size/circular-reexport warnings remain and are not represented as performance verification.
- `npm run codecast:verify`: 9,854/9,854 original ordinary files verified, zero failures. The final generated fork has 41 explicit changed/added files; the original mirror is unchanged.
- `npm run test:integration`: 13/13 passed, `.local/codecast-app/acceptance-1792833572853/result.json`. This covers real independent member directories, manual add/change/delete, durable queue/restart/replay, permissions/spoofing, stale and confirmed restore, real saved bytes, original Git and peer-directory preservation, cold project links and ten local WebSocket clients.
- `node tests/codecast-backend-audit.mjs`: eight groups passed, `.local/codecast-app/backend-audit-1792833590411/result.json`. Repair comparison is retained at `backend-audit-1792832626965/result.json`: duplicate/conflicting parts 200 → 409, concurrent last-seat joins two → one, post-logout native access accepted → rejected. Further cases cover 23 out-of-order parts, byte-bounded large-content pages, authorized direct lookup, continuous sequence replay, concurrent deduplication, credential rotation, membership/device revocation, and revocation during an unfinished streaming upload.
- `node tests/codecast-workbench-audit.mjs .local/codecast-app/acceptance-1792833572853`: five real scenarios passed, then the original account menu did not open on the first click. The failed run remains unchanged at `workbench-audit-1792833675172/result.json`. The passing scenarios include 241 real files displayed as one complete checkpoint, 45 real captures during browser disconnection with every persisted event recovered, cold old-event deep links/reload/Back and cached-data removal in two revoked-member windows. The script then used the actual original menu and visible first-run dismissal; `--account-only .local/codecast-app/workbench-audit-1792833675172` passed separately at `workbench-audit-1792833968204/result.json`. This is five plus one executed scenarios, not a claim that the earlier complete run passed.
- `node tests/codecast-agent-preview-audit.mjs .local/codecast-app/acceptance-1792833572853`: five cases passed on the final view, `.local/codecast-app/agent-preview-audit-1792834175701-5b567688/result.json`. Real responses were delayed (not fabricated) to verify source/consent locking, A-to-B preview invalidation and actual connected source B. A real binary grown beyond 2 MiB displayed uncaptured-content semantics. No page errors or external requests. Test source changes were restored and its added file removed.

Initial native acceptance passed eight cases at `desktop-acceptance-1792833673551/result.json`. A final-view rerun at `desktop-acceptance-1792834190243/result.json` exposed an acceptance-harness error: it searched only the first replay page, so reuse of a test project with more than twenty events hid the new desktop event from its assertion. The test now consumes the actual continuation cursor. This failure is retained rather than relabelled; final native rerun result is recorded below once complete.

The final native rerun passed all eight cases on the final production build: `desktop-acceptance-1792834305185/result.json`. Its actual Windows screenshot was inspected, including the original workbench, current retention wording and colored text changes from the original diff renderer. Native folder picker/cancel, consent, saved-file capture, actual confirmed restore and peer preservation, window isolation, close behavior and profile reopening all passed. The independent desktop framework and product layout remain the actual Codecast implementation plus the recorded owned adaptations.

The corrected full workbench suite was then rerun against the final build and passed all six cases in one run: `workbench-audit-1792834482639/result.json`, no page errors. This includes the actual source/UI changes from final review, a fresh 241-file directory and another 45-capture disconnected-browser exercise. Earlier failed and single-case results above remain available for traceability.

The audit-owned runtime was stopped after verification; ports 3407–3411 are closed. Persisted application data, source and evidence remain. The normal `npm start` entry is unchanged and will launch the independent desktop window with its local services.

Remaining product work is still explicit: native Inbox/executable Agent context handoff, migration of backup/retention management screens, a current installer/updater and final feature-entry cleanup, followed by separate production/remote acceptance. Root retention and encrypted-backup tests do not prove their current desktop management UI is finished. No invitations, paid APIs, public deployment, tunnels or desktop shortcuts were created.

## Backend completion — 2026-10-25 (local backend scope verified)

The user explicitly prioritizes a thoroughly implemented backend. Preserve the full Codecast foundation and native task/comment model; do not redesign the frontend in this iteration.

- [x] Connect encrypted checkpoint backups to the actual local Convex file store: scoped device authorization, transactional quota reservations, digest verification, retries, deletion/upload races, expiry, recovery into an independent directory and garbage collection.
- [x] Build persisted, project-scoped captured-session queries and context handoff, tied to actual events/checkpoints and native tasks. Enforce sender/recipient visibility, retry identity and concurrent response safety. No automatic file application or Agent execution.
- [x] Audit and repair native account/team/project/task/comment boundaries and multipart event integrity. Add meaningful adversarial acceptance cases for each confirmed issue.
- [x] Execute real local backend/connector acceptance, persistence across restart, existing core integration, root tests/typecheck, owned integration typecheck and full application build. Record failures and final results, plus any remaining product/UI/production scope.

Acceptance must use persisted local services and real encrypted checkpoint contents; unit tests or interface definitions alone are insufficient. Existing successful checks above are historical until rerun for this iteration.

### Implemented backend and connector behavior

The current foundation remains the complete pinned Codecast Convex application, original native task/comment implementation and independent desktop framework. Owned additions and exact patches materialize the full fork; the original source is unchanged. The API and migration contract is documented in `docs/BACKEND_CONTRACT_2026-10-25.md`, and reuse changes are recorded in `THIRD_PARTY_NOTICES.md`.

- Encrypted checkpoint storage now uses actual local Convex file storage, with owner-private metadata/bytes, verified checkpoint ownership, transactionally reserved project quotas and authenticated download. Ciphertext is limited to 24 MiB per backup and stored in ordered 4 MiB chunks. Finalization rechecks current authority and the exact reservation; deletion/recreation and mid-upload revocation cannot publish stale bytes. Duplicate uploads acknowledge one manifest. Reservations expire after one hour; scheduled collection removes only old unattached ColloSys objects. This is explicitly local storage, not an off-machine backup.
- Recovery downloads/decrypts real bytes into separately tracked recovery directories. Export verifies the manifest and writes only into a new destination, which can then be registered normally. The source work directory and peers remain independent. Retention operations are serialized; persistent deletion and Git-GC journals recover interrupted cleanup. Incomplete managed recovery jobs are reclaimed after restart. Recovery is not mislabeled as an ordinary restore preview.
- Captured sessions now have persistent, bounded queries and migration of older history. Message reimports with the same source identity/content receive durable alias acknowledgements without blocking the connector outbox. Handoffs freeze their source sequence, verify both members and any referenced native task/checkpoint, use the original task comment writer with Agent relay disabled, and resolve concurrent acceptance/decline with revisions. A moved/deleted task cannot be accepted, but the handoff can still be declined/cancelled.
- Native team access now checks current membership before historical owner/assignee shortcuts. Repairs cover list/sync paths, assignee writes, three task launch paths, comment participants and notification reads/subscriptions/queued delivery. Deleted accounts invalidate remaining credentials, including credentials beyond the original deletion batch, and release team memberships. Revoked browser sessions preserve the original retryable unauthenticated contract for queued edits. Shared history is retained; full physical account-data erasure is not claimed.
- Multipart checkpoint receipts now enforce cross-part path uniqueness. Existing receipts migrate in bounded batches before new ingest or backup creation. Invalid/pre-summary historical receipts cannot masquerade as verified recovery evidence. Historical session indexing also advances in bounded transactions rather than exceeding backend read limits.

### Executed verification for this iteration

- `npm run typecheck`: passed. `npm test`: 55/55 passed, 39.56 seconds, including eight added storage failure/recovery tests. These include interrupted snapshot deletion, GC retry, recovery cleanup, pin/cleanup serialization, bounded download and verified export.
- `npm run typecheck:integration`: passed on 19 owned files against actual generated upstream types. A separate TypeScript diagnostic comparison of 33 native patches across 13 upstream files plus the helper found zero new diagnostics; three original dependency-resolution diagnostics remained in its immutable-source overlay. Evidence: `.local/codecast-app/native-semantic-2026-10-25.json`. This is not a complete upstream typecheck or security certification.
- `npm run test:backend`: 10/10 real local groups passed, `.local/codecast-app/backend-completion-1792909158471/result.json`. Real encryption/upload/download/recovery/export/registration, wrong passphrase, quota contention, duplicate concurrent 24 MiB uploads, corruption, deletion/recreation, mid-stream revocation, source-message reimport, captured-session paging, native task comments, frozen context, handoff response races and member removal were exercised. The maximum-size transport fixtures are explicitly TEST data; actual checkpoint encryption/recovery is exercised separately. Pre-upgrade receipt migration and session indexing across 19 MiB of old checkpoint records used local administrator fixture import, not a shipped test endpoint.
- `npm run test:backend:native`: five source groups and five actual API groups passed, `.local/codecast-app/native-backend-audit-1792909159410/result.json`. Actual API coverage includes outsider assignment/subscription rejection, all three unauthorized task-launch entrypoints, removed creator/assignee access, sync/notification scope, deletion with 51 credentials and retryable logout behavior. No Agent or paid model was executed.
- `node tests/codecast-backend-audit.mjs`: all eight existing backend regression groups passed, `.local/codecast-app/backend-audit-1792909157983/result.json`, covering multipart receipts, large pages, replay, concurrent deduplication, device/session/member revocation and the last team seat race.
- `npm run build`: complete production application passed in 1m9s before final formatting. The final formatting-only rebuild passed in 1m14s, `.local/codecast-app/backend-completion-build-final.log`. Original chunk-size/circular-reexport notices remain; this is not a performance audit.
- `npm run test:integration`: 13/13 passed on the production build, `.local/codecast-app/acceptance-1792909668759/result.json`, with no browser page errors. This reruns original login, two independent roots, manual edits, durable queue/replay, original workbench, stale/confirmed restore, original Git/peer preservation, scope rejection and ten local WebSocket clients. An earlier development-mode run timed out at first navigation before any checks; `.local/codecast-app/acceptance-1792909228617/result.json` remains failed and is not counted as a pass.
- `node tests/codecast-backend-completion.mjs --after-restart .local/codecast-app/backend-completion-1792909158471`: passed after stopping and restarting all application services. It verified actual persisted ciphertext by digest, completed receipt, session pagination and accepted handoff; evidence is `restart-result.json` in that folder.
- `npm run codecast:verify`: all 9,854 original ordinary files verified with zero failures. The prepared complete fork contains 62 explicit changed/added files. The original platform mirror and original source remain immutable.

Final production desktop verification passed 8/8, with no page errors: `.local/codecast-app/desktop-acceptance-1792909963991/result.json`. This exercised actual Windows windows, original login/workbench, native folder picker/cancellation, explicit directory consent, file changes, confirmed byte restoration, profile persistence and both close-prompt choices. The restore screenshot was inspected. Picker selection and close-prompt responses retain the explicitly controlled responses documented in the earlier desktop acceptance; folder-picker opening/cancellation and the backend/files/restore are real.

A second restart check deliberately stopped the verified backend process, saved a new file edit while it was unavailable, then fully restarted the local services. `node tests/codecast-restart.mjs before|after .local/codecast-app/acceptance-1792909668759` passed: ten existing events kept their IDs/sequences, the durable pending edit replayed exactly once, checkpoints persisted and B's directory was unchanged. Evidence: `restart-result.json` in that acceptance folder. All five service ports were observed listening only on 127.0.0.1. Test-owned services were stopped after verification, and ports 3407–3411 were confirmed closed. Persisted data/evidence remain; the unchanged `npm start` entry launches the independent desktop normally.

The final integration typecheck was initially started concurrently with launcher preparation, which recopies original files before applying owned patches. It reported seven missing collaboration-store/derived-type diagnostics while reading that intermediate tree. This invocation failed and is not a valid check of the completed fork. After preparation finished, the sequential final invocation passed all 19 owned files, `.local/codecast-app/backend-completion-typecheck-final.log`. Source preparation and checks that read the prepared tree must run sequentially. The earlier independent/native and successful integration checks remain separately recorded above. Final modified implementation/test files passed formatting checks.

### Remaining product and production scope

This iteration completes the listed local backend workflows, not the whole product. The existing desktop workbench remains; captured-session/native Inbox and handoff management screens, retention/backup/recovery management screens and a current installer/updater still need integration. Clients connecting the new screens must finish historical session indexing and checkpoint verification before presenting verified handoff evidence. An oversized pre-upgrade checkpoint may require repeated retryable backup attempts while its bounded verification advances.

Project visibility within a team still follows Codecast's team workspace model; separate private-project membership is not implemented. Captured context handoff does not execute an Agent, assign ownership automatically or apply another member's files. The legacy account database is not migrated. Full upstream tests, exhaustive feature/security/performance testing, production identity/recovery, off-machine disaster recovery and public/cross-network acceptance remain unverified. No purchasing, deployment, tunnel, invitation delivery, paid model calls or desktop shortcut creation occurred.

## Free-first internal use — 2026-10-25

The user wants early internal use to incur no provider fees and explicitly permits Cloudflare plus Convex free allowances. Keep the current Convex business/auth/realtime foundation and original desktop workbench. Cloudflare-only operation and two parallel business databases are not required. Current pricing, the division of responsibilities and outstanding cloud work are recorded in `docs/FREE_TIER_ARCHITECTURE.md` and the updated engineering contract.

- [x] Verify official current pricing and distinguish Convex Free hard caps from Starter metered overages; treat R2 as an optional metered service rather than a zero-fee prerequisite.
- [x] Inspect actual source-level idle costs and implement lower-cost collaboration maintenance, combined live-authorized local reads and persistent quota/registration retry delays.
- [x] Add an offline source-based budget report and adversarial real-HTTP tests, including no cached authorization and retained checkpoint bytes after a quota failure/restart.
- [x] Finish original product acceptance and actual browser response-order/idle-request checks; record the evidence below. Public deployment is neither requested nor performed.

The actual original Convex cron export has 63 jobs, approximately 738,450 entry invocations per 30 days. The fork now exports eight maintenance jobs, 49,710 entries, preserving native sync delivery recovery, auth relay cleanup and retention functions at their original timing. Disabled hosted automation cron definitions remain in the original reference; this does not disable all manual/one-off scheduling paths. The saved-file and native reactive query transports are unchanged.

The original workbench made two local inspection requests every 2.5 seconds, each requiring a backend identity request. It now makes one combined `/api/inspect` request on its own new checkpoint or manual refresh, with a 30-second idle fallback. Every request still validates the live session; restoring or changing files has no authentication cache. The explicit 10-member, 8-hour, 22-day idle scenario drops from 5,068,800 to 211,200 backend identity requests, excluding internal query invocations and all other application traffic. These estimates do not establish free-plan capacity or a billing guarantee.

Independent review found two concrete defects during this change: an older same-scope inspection response could overwrite the newer checkpoint list, and successful registration with no queued events retained an old authorization warning. Request generations now reject stale success/error responses, and registration success resets the delivery state. The new HTTP tests cover empty-queue recovery as well as non-JSON 429, Retry-After, persistence across restart, credential rotation and immediate revoked-session rejection.

Executed checks: `npm test` passed 61/61 (30.95s), `npm run build` passed (2m19s), and `npm run typecheck:integration` passed 20 owned files against generated upstream types. Initial root typecheck found unvalidated `response.json()` return types in the new HTTP handling/tests; these were corrected with object/receipt validation and explicit test response types. Final `npm run typecheck` passed, and the affected cost/connector-safety tests were rerun together, 14/14 passed (8.16s). Logs are `.local/codecast-app/free-tier-tests.log`, `free-tier-build.log`, `free-tier-integration-typecheck.log` and `free-tier-retry-final.log`.

Final `npm run test:integration` passed all 13 groups on the production application with no reported errors: `.local/codecast-app/acceptance-1792911958839/result.json`. This reruns the real account/workbench, independent directories, saved-file changes, persistent replay, permission checks, stale and confirmed restore, original Git/peer preservation, ten local WebSocket clients and immediate browser-session revocation.

`npm run test:cost -- .local/codecast-app/acceptance-1792909668759` passed both actual-browser scenarios, `.local/codecast-app/cost-audit-1792911958852/result.json`: eight idle seconds made zero inspection requests; an actual new checkpoint refreshed history while an older real response was deliberately delayed, and releasing that old response did not remove the new checkpoint. This verifies response ordering with real files and responses, not fabricated history. The offline cost report is `.local/codecast-app/free-tier-budget.log`.

Final source verification passed all 9,854 original ordinary files with zero failures; the prepared full fork contains 63 explicitly changed/added files. This iteration did not rerun native-window acceptance because the desktop framework was unchanged; the prior native result above remains historical. Test-owned services were stopped after verification and ports 3407–3411 were confirmed closed. Persisted local data and evidence remain, and `npm start` still launches the independent desktop application.

Cloud readiness remains false: remote endpoint configuration, isolated deployment/account/device state, production signup/access, non-cron external automation review, actual provider usage measurement, deployment-wide storage/traffic caps and public-network acceptance remain separate work. The current default is still loopback-only. No free cloud service has been provisioned and no ten-person cloud capacity claim is made.

## Frontend design method — 2026-10-25

The user requests a deeply grounded method for an original visual and information design, preserving proven behavior and using three interactive samples of one core scenario before any broad migration. The source pass and implementation/acceptance method are recorded in `docs/FRONTEND_DESIGN_METHOD_2026-10-25.md`; `PRODUCT.md` records already explicit product constraints, without selecting a visual direction.

- [x] Recheck current repository instructions, uncommitted state, owned collaboration view and original theme, modal, navigation and conversation source. Confirm the important gap: captured Agent activity renders individual text messages; the upstream full conversation component and backend session APIs do not establish a complete integrated session frontend.
- [x] Define shared scenario, genuine alternative structures, reuse boundaries, equal-content comparison and behavior/visual acceptance evidence. Preserve original source and all current uncommitted work.
- [ ] Run a fresh product baseline and record actual screenshots and missing interactions.
- [ ] Implement three isolated, interactive design samples sharing the scenario and existing behavior foundations; explicitly identify test-only capabilities.
- [ ] Execute the specified content/state/viewport/browser/desktop checks and project checks; present comparison evidence and tradeoffs for the user's selection.

This planning/source-inspection pass does not claim the samples are implemented or the interface visually audited. No runtime/UI source, backend behavior, dependencies or global styles changed; no services were started and no tests/build were rerun for these documentation additions.

## Original frontend sample — 2026-10-25

The user's subsequent brief selects **one own implementation**, Google Sans, a unified Hugeicons-or-Phosphor family, the supplied peanut mark, and substantial layout/typography/motion changes. This supersedes the earlier three-direction exercise. The work remains an isolated core-workbench sample pending user selection, not an authorized whole-product migration.

- [x] Run and operate the real current product before designing. `node tests/codecast-design-baseline.mjs` passed; `.local/codecast-app/design-baseline/` holds actual activity, difference, captured-message and restore-preview screenshots. The captured-session UI is still an individual-message integration, not the complete upstream ConversationView. Original baseline and sample use different datasets; these screenshots are not a matched-content comparison.
- [x] Implement `/design-lab` through owned fork patches, with six synthetic activities, three members, long mixed-language content, manual/Agent/source states, added/modified/deleted patches, per-activity two-state checkpoint histories and explicitly non-writing recovery rehearsal. Add `npm run design` through the actual desktop framework; `npm start` retains the existing product entry.
- [x] Use self-hosted Google Sans with Chinese system fallback and code monospace; one Phosphor mapping; the supplied original peanut image rendered through a cropped viewport. Retain font/icon licenses and provenance. Reuse installed Radix menu/dialog/tabs, resizable panels, original FilePatchDiff/Pierre rendering and original shouldFollowStreaming policy. No global theme replacement or new full component suite.
- [x] Implement working member/search filters, bookmarks, URL selection, per-activity file and reading memory, unread replay behavior, keyboard focus return, layout persistence, loading/empty/error states, reduced motion and narrow list/detail navigation. Menu/dialog interaction and saved-file backend capabilities remain distinct from the sample's synthetic data.
- [x] Repair findings from independent finish review: source-device ownership and teammate read-only preview; 11 px metadata floor and darker secondary text; readable syntax palette with line numbers and patch-derived totals; clean peanut presentation; reachable narrow activity list; independent checkpoint IDs/titles/dates. The retained fixture shows +30/−5, including deletion. These changes are confined to the sample.
- [x] Record the provisional design and its reuse/limitations under `docs/design-sample/`; preserve original source and all pre-existing uncommitted files. No commit, reset, stash, shortcut or deployment was created.

### Executed checks

- `npm run typecheck`: passed. `npm test`: 61/61 passed in 39.52 seconds during this iteration. No backend/connector logic was changed by the visual sample.
- `npm run typecheck:integration`: passed on all 23 owned files against the fully prepared current upstream types, including the final post-build run. Preparation and typechecking ran sequentially.
- `npm run build`: passed; final production build completed in 1m16s, `.local/codecast-app/design-build-final.log`. Existing upstream chunk/circular-reexport notices remain; no performance certification is claimed.
- `npm run codecast:verify`: all 9,854 original ordinary files verified, zero failures. Prepared fork: 67 explicitly changed/added files. The original platform/source mirror is unchanged.
- `node tests/codecast-design-audit.mjs`: 9/9 final browser groups passed, `.local/codecast-app/design-browser-1792915783368/result.json`, with no page errors or external requests observed. Includes 1440×900, 1280×800, narrow detail and 760px list/detail navigation. Additional actual-browser captures `09-yesterday-history.png` and `10-narrow-search-list.png` verify distinct prior/current history dates and a visible searchable narrow index.
- `node tests/codecast-design-audit.mjs --desktop`: 8/8 final groups passed in a visible native Windows window, `.local/codecast-app/design-desktop-1792915793606/result.json`. Sandbox and context isolation were enabled, Node integration disabled. All final screenshot states were captured after finite animations settled; native scaling produced a 1281 CSS-pixel content width for the requested 1280 case. The exact 1280 browser case also passed.
- Code syntax token contrast across normal, addition, deletion and emphasized backgrounds measured at least 4.64:1; shared secondary text against the rail measured 4.99:1. This is a scoped reading check, not a complete accessibility audit.
- `npm run test:integration`: 13/13 original real-product groups passed, `.local/codecast-app/acceptance-1792915664073/result.json`. This separately exercises password accounts, two independent roots, real manual file edits, persistent queue/replay, deduplication, membership/sensitive-file restrictions, stale and confirmed restore preserving the peer/Git state, real original UI preview, cold project navigation, logout invalidation and ten local WebSocket clients. It does not turn the design fixture into a real backend-integrated frontend.
- The Impeccable detector was run once, `.local/codecast-app/design-detector.json`, returning no findings. Real screenshots and finish review were also used; the detector alone was not treated as a quality verdict.
- Independent final finish review found all seven requested corrections resolved and returned `ship` for this synthetic sample only; evidence and boundaries are recorded in `docs/design-sample/REVIEW.md`. User direction selection remains pending.
- The documented `scripts/codecast-design.mjs` entry was launched after tests; its native window reached the existing `ColloSys desktop window ready` hook. It subsequently closed normally and the owned services shut down. Ports 3407–3411 were then confirmed closed. Use `npm run design` to reopen. Selected actual screenshots are preserved under `docs/design-sample/screenshots/` for review without running the app.

### Failed attempts retained

An early launch raced a newly added license asset and correctly rejected changed preparation inputs; the subsequent stable build/start succeeded. Two browser attempts began before the service was ready (`design-browser-1792914348508`, `design-browser-1792914426954`) and failed connection establishment; the harness now waits for readiness. The first final contrast probe was attached as unassigned light DOM beneath the diff renderer's shadow host and returned empty computed colors (`design-browser-1792915611291`); the next run exposed a lazy-render readiness race (`design-browser-1792915711500`). Both runs passed the seven interaction groups but are failed overall, not counted as final passes. The probe now resolves the actual host variables into visible DOM and explicitly waits for the renderer. Final browser/native runs above pass. Formatting initially flagged the newly edited audit script; it was formatted before delivery.

### Remaining scope

The sample data, Agent messages, presence, checkpoint records and restore rehearsal are explicitly synthetic. It does not add real captured-session/native Inbox integration, task/comment/handoff management screens, real backup management or a complete frontend migration. The actual product backend remains separately verified and preserved. A dark design counterpart, large-list performance, complete accessibility review, package/updater and public/cross-network checks remain outside this sample. Baseline/sample data parity remains unfulfilled; the screenshots must not be presented as a controlled comparison of equal content. The user has not yet selected this visual direction for global use.

## Visual rejection and hierarchy diagnosis — 2026-10-25

The user rejected the delivered direction as far below Codecast, recognizably generic and poorly hierarchical. This supersedes the prior scoped `ship for review` recommendation. PRODUCT.md, the sample record, its design sidecar and the root launch documentation now mark the visual direction as rejected; it must not become an approved migration baseline. Confirmed logo/font/family choices and useful engineering remain preserved.

Two independent read-only assessments inspected the source and fresh browser states. Actual 1440×900 measurement places the first message text at y=404.64 after a 59 px scope bar, 49 px detail toolbar, 136.14 px headline/facts block and 43 px tabs, with a persistent 67 px checkpoint footer. The sidebar's checkpoint item acts on the selected activity rather than a project-level history, while the similarly named footer opens a preview. The old baseline script inspected our owned Workspaces integration with different sparse content, not an equal-content native conversation baseline. Detailed evidence, source lessons, limitations and correction order are in `docs/design-sample/HIERARCHY_REJECTION.md`.

The detector returned no pattern findings; this did not override source/browser design findings. Live overlay injection was blocked by the existing CSP and was not bypassed. Clean screenshots and DOM measurements were retained. This turn did not edit UI/backend implementation or rerun functional suites; it corrects the diagnosis and acceptance record. No replacement direction is claimed completed.

## Core workbench rebuild — 2026-10-25

The user authorized a rebuild after rejecting the earlier sample. This iteration implements one replacement core scenario at `/design-lab`, pending the user's visual evaluation. It does not approve a global migration. The previously confirmed Google Sans, supplied peanut artwork, unified Phosphor family, independent desktop window and functioning interaction foundations remain.

- [x] Replace repeated navigation/header layers with one project bar, an activity index and a dominant reader with contextual file/storage evidence. Remove the persistent checkpoint action footer and scope history to selected work. At 1440×900, the first paragraph starts at y=232 rather than the prior sample's approximately 401 px.
- [x] Compose the actual upstream ConversationHeaderBar, retain original FilePatchDiff and shouldFollowStreaming behavior, and implement a dedicated file navigator/diff view. The More menu mounts actual upstream ConversationView with identical test messages for a specifically reader-only comparison; it is not a complete native-product baseline.
- [x] Rework scoped typography, surfaces, spacing and state expression; separate work progress from delivery health. Keep current source/backend foundations, no global style replacement and no new whole component suite.
- [x] Preserve filtering, URL selection, file/reading memory, incoming-message reading position, keyboard/focus behavior, resized panel persistence and narrow evidence access. Teammate checkpoint scope expands inline; own restore retains an explicitly non-writing confirmation/stale-preview rehearsal.
- [x] Resolve the two independent finish-review findings: nonmodal teammate scope and meaningful disclosure motion. Actual frame sampling verifies approximately 180 ms expansion, with inert/aria-hidden for collapsed content. A final reduced-motion coverage correction includes portal roots and descendants for both OS and local preferences; actual menu/dialog computed styles are checked.
- [x] Record current source-derived rules under `docs/design-sample/rebuild/`, comparison/caveats in `docs/design-sample/REBUILD_REVIEW.md`, and final actual captures/results under `docs/design-sample/screenshots/rebuild/`. Historical rejected evidence remains unchanged. Updated provenance records the native header/reader reuse.

### Actual validation

- `npm run typecheck`: passed. `npm test`: 61/61 passed. No backend or connector implementation changed in this iteration.
- `npm run typecheck:integration`: 24 owned files passed against the prepared actual upstream types; final typed-source result `.local/design-v2-typecheck.log`. Subsequent changes affected only isolated CSS, browser tests and documentation.
- `npm run build`: final production build after the portal-motion correction passed in 1m21s, `.local/design-v2-build-final.log`. Existing upstream circular-reexport/chunk-size notices remain.
- `npm run codecast:verify`: 9,854 pinned original files verified with zero failures. Current prepared complete fork: 68 explicit changed/added files. Original platform and source mirrors remain unchanged.
- `npm run test:integration`: all 13 real-product groups passed, `.local/codecast-app/acceptance-1792918795288/result.json`, no reported errors. This separately exercises real accounts, two independent directories, saved-file events, durable outbox/replay/deduplication, permissions and sensitive paths, stale/confirmed recovery preserving peer files and Git state, original workbench and ten local sockets. It does not make the fixture a backend-integrated frontend.
- `node tests/codecast-design-audit.mjs`: final 11 browser groups passed, `.local/codecast-app/design-v2-browser-1792919722655/result.json`. `--desktop`: final 8 groups passed in an actual visible native Windows window, `.local/codecast-app/design-v2-desktop-1792919722658/result.json`. Both include the final manual/OS reduced-motion portal checks, zero reported page errors and zero external requests. Sandbox/context isolation were enabled; Node integration disabled.
- Tested 1440×900, 1280×800, narrow detail, plus browser 760/390 px navigation. Native scaling gives 1281 CSS px for the nominal 1280 case; exact browser 1280 separately passes. Code token minimum contrast is 5.04:1 across current reading/diff surfaces; secondary text 5.14:1. These checks are not a full accessibility audit.
- Modified implementation/test files passed formatting. Impeccable detector ran once with no findings; rendered inspection and independent review remain separate. Independent final disposition is `ship` for user review of this sample, with both requested corrections resolved; no user visual acceptance is inferred.

### Failures retained and remaining scope

The initial cold development navigation timed out during dependency optimization. The first narrow-evidence test exposed a width threshold issue, corrected to the actual 760 px reader breakpoint. Initial comment contrast was 4.459:1; it was darkened and final tests pass. A final rebuild attempt was correctly refused while this run's services were active; those verified owned processes were stopped before rebuilding. Formatting flagged the updated audit script and was rerun to completion. Failed attempts are not counted as successful evidence.

This replacement is still explicitly synthetic: members/messages/presence, patches/checkpoints and recovery rehearsal do not perform production writes. Real captured-session/native Inbox, task/comment/handoff and backup management screens, all-page migration, dark counterpart, large-list performance, full accessibility, installer/updater and public-network acceptance remain unfinished. The current real product and backend remain separate and preserved. No purchase, deployment, tunnel, invitation, paid model call, shortcut, commit, reset or stash was performed.

After final tests, the verified test-owned launcher was stopped and `npm run design` was started through the documented desktop entry. An actual Electron top-level window titled ColloSys with a nonzero native handle was observed. It is left open for the user's review; closing this launcher-owned desktop shuts down its local services. Reopen with `npm run design`.

## Reference research, two candidates, and temporary wrap-up — 2026-10-26

The user rejected the preceding visual direction, requested deep OpenDesign/Codecast research and two distinct interactive layout candidates, then explicitly requested temporarily wrapping up and publishing this repository to GitHub as Public. Production frontend migration is paused at stage C; neither candidate is user-approved. Public source publication is authorized; public application deployment, purchases, paid model calls and invitations remain outside this work.

- Preserved the pre-research working tree in local recovery reference `refs/checkpoints/before-design-research-20261026` at `276186e0983905d95d3811dcb19f5e5eecbfec83`. This private recovery reference is not part of the public push.
- Read the pinned Codecast source and actual OpenDesign public website plus source at `26d60298f8129e229a1c10aab4df7ca25b1e9ad3`. Recorded source hashes, evidence limits, adopt/adapt/reject decisions, current UI audit and information architecture under `docs/design/`.
- Implemented an isolated A/B browser preview in `design-explorations/workbench-20261026`: complete pending queue above selected detail versus horizontal work chooser and focused reader. Synthetic data is explicit. Comments and inspectable handoff drafts remain in page memory. Restore is a non-writing stale-preview simulation.
- Completed real-browser captures at 1440×900, 1280×800, 1920×1080, 800×900 and 390×844. Final `validation.json` passes 17 checks, with no observed page errors or external requests. Includes keyboard/focus behavior, retained handoff draft, narrow evidence after desktop collapse, readable viewed-state tooltip and reduced motion. Screenshots and limitations: `docs/design/preview-validation.md`.
- `npm run typecheck`: passed. `npm test`: 61/61 passed. `npm run build`: passed after stopping this run's active product server; existing upstream bundle notices remain. `npm run typecheck:integration`: 24 owned files passed against the current prepared fork. Logs stay local under `.local/design-research-20261026`.
- `npm run codecast:verify`: 9,854 original ordinary files, zero failures. Independent preview typecheck and production build passed. Existing real-product read-only design baseline passed; independent original Codecast acceptance passed 8 checks. No new native-window or full end-to-end recovery certification is claimed for the candidate UI.
- Independent finish review requested five bounded corrections: retained handoff draft, narrow evidence reachability, settled opaque dialog capture, discoverable viewed state, and accurate documentation. Corrections and browser checks are complete; final review outcome is recorded in `docs/design/preview-validation.md`.
- Remaining: user direction selection, real backend/native workbench integration, all-page migration, long-record behavior, full accessibility, dark theme, performance, packaging/updater and cross-network acceptance. A's short-window nested scrolling is explicitly documented rather than hidden.

Publication preparation excludes `.local`, dependencies, generated builds, runtime environment files, local databases and private key files. The only retained production environment files are unchanged public upstream endpoint/client-identifier files; upstream test-token fixtures and PEM-parsing patterns remain original source. No local secrets were found in the publication scan. Source licenses and provenance remain in `THIRD_PARTY_NOTICES.md` and `third_party/`.

Public repository created: https://github.com/QCYTSN/ColloSys. Publication uses the new `main` source history only, not local recovery references. All 9,854 staged upstream file blobs and their executable modes match the pinned manifest exactly; root `.gitattributes` retains canonical LF on Windows clones. The two documented upstream symlinks remain omitted as before. The source package remains npm-private; GitHub Public does not imply publishing an npm package or deploying the application.
