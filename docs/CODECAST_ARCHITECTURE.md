# Current Codecast foundation

The user selected the complete Codecast stack on 2026-10-23. This supersedes the Workers/D1 deployment topology for the current application. The previous implementation is preserved, with its data and historical verification.

On 2026-10-25 the user prioritized zero-fee internal use and explicitly allowed Cloudflare and Convex free allowances together. Keep Convex as the business backend and make Cloudflare static delivery/backup storage optional, rather than operate two authoritative business backends. See [FREE_TIER_ARCHITECTURE.md](FREE_TIER_ARCHITECTURE.md) for verified pricing, actual cost reductions and outstanding cloud-connection work. The current launcher remains local-only; no cloud-readiness or free-capacity claim is implied.

The user clarified that reuse concerns the product workbench, not Codecast's promotional website, and explicitly selected an independent desktop window. The product build excludes marketing routes and page modules, promotional public assets, original installation scripts and website metadata. Root and retired marketing URLs enter the product; signed-out access goes directly to local login with a return path. `npm start` launches the actual Codecast desktop framework around this workbench; the browser entry is a separate debug command. This Windows source launcher is not a distributable installer.

```text
Codecast Electron desktop framework + original React workbench (127.0.0.1:3407)
  ├─ original Convex auth, reactive queries, store/dispatch (3408)
  │    ├─ original accounts, teams, projects, tasks, comments
  │    └─ collo workspaces, scoped device grants, ordered durable events
  └─ launcher pairing + live authenticated identity → local manager (3411)
       └─ one connector per expressly authorized directory (loopback ports)
            ├─ real saved-file watcher + rescan
            ├─ SQLite outbox/checkpoint/preview metadata
            ├─ isolated Git object store with retained snapshot references
            └─ device-scoped HTTP → native Convex HTTP actions (3409)
```

The native Convex process persists SQLite and file storage under `.local/codecast-app`. Its outbound proxy on 3410 permits only GETs to its own public JWT discovery endpoints. Browser CSP allows local assets, the local backend and loopback connector requests. The upstream production deployment scripts, hosted credentials, telemetry config, CLI daemon and paid model APIs are not used.

## Original source and owned changes

`scripts/codecast-prepare.mjs` copies the complete pinned original into an ignored runtime tree, then applies exact, single-occurrence replacements from `integrations/codecast/patches.mjs` and copies owned additions. A generated manifest records SHA-256 hashes of touched files. Dependencies are build-time junctions to the installed upstream dependency trees; the user-project scanner still refuses junctions. `codecast:verify` independently checks every original source file against its Git blob.

The actual Codecast project page gains a Workspaces tab. It retains its original header, tabs, navigation, tasks, timeline, About and detail shell. New controls import the original Button, Dialog and FilePatchDiff components. No replacement App, fake Convex responses, seeded sessions or forced store-initialization flags are used. A server-authorized short-project lookup fixes cold links into an inactive workspace without bypassing the original workspace-switch action.

The complete React build is separate from the original reference and the legacy selected-component build. Startup checks the owned-source fingerprint and rebuilds stale assets. A process lock precedes source preparation. Startup waits for the actual manager endpoint before declaring the application ready.

## Desktop boundary and lifecycle

The pinned `platform/packages/desktop` framework supplies native window lifecycle, bridge, navigation and single-instance handling. `scripts/codecast-desktop-prepare.mjs` copies its source into a separate runtime derivative and admits only the exact local product HTTP origin in its URL validator. Its actual preload/bridge are bundled for a sandboxed renderer; the provenance manifest records this patch. The immutable platform mirror is unchanged.

`integrations/codecast/desktop/main.cjs` supplies a standard Windows frame, product menus, native directory picker and private per-profile storage. Context isolation and OS sandboxing are enabled; renderer Node access and embedded webviews are disabled. Native IPC checks the top frame and exact product origin. Screen capture, protocol registration and host-policy expansion are denied; renderer requests are limited to loopback. The window automatically receives local pairing without printing it.

The last window exits the desktop process. If original application state is pending, a native prompt offers Keep open or explicit Close now. A launcher that owns the local services stops those services after desktop exit; attaching to existing debug services does not take ownership. The default profile preserves login between launches. Windows x64 Electron 44.3.0 is downloaded with a fixed SHA-256 check; first preparation needs internet access. No shortcut or installer is created.

## Identity and access

Browser calls use real original password authentication. Local file-management authorization verifies the live `authSessions` record, its owner and expiry, in addition to the signed JWT; logging out invalidates old browser tokens. The manager also requires a launcher-issued pairing secret and an allowed Origin.

Authorizing a directory mints a random 256-bit credential scoped to exactly one project, workspace and authenticated user. The database stores its SHA-256 hash and a 30-day expiry, not the credential. Reconnecting rotates the grant. Uploads validate the current original Codecast `canAccessProject` rule on every request. `workspace` is access; `team_id` alone grants no access. Actor fields come from the server, and client-supplied actor/user fields fail the strict event schema.

The connector's grant has a separate lifecycle from a browser session, so background saved-file capture can continue after closing/signing out of the browser. Explicit device revocation, account deletion, expiry or lost project access prevents uploads. Browser operations against a local connector additionally require the logged-in owner; a teammate cannot use its restore endpoint.

## Durable delivery

The existing connector commits the checkpoint and event parts in local SQLite before sending. HTTP actions validate bounded input and the shared versioned schema. A Convex mutation checks workspace ownership, rejects sensitive paths, redacts recognized secrets, verifies event-ID collision contents, allocates the next project sequence and inserts the event in one transaction. HTTP ACK is returned only after that mutation commits. Canonical parsed payloads are fingerprinted, so JSON field order does not break duplicate retry detection.

The browser subscribes through original Convex authenticated transport with paginated results. A separate monotonically ordered cursor query supports replay and reconnect validation. Upstream project access is checked on every read. Shared events contain bounded differences; complete checkpoint bytes remain on the source device.

## Restoration and limitations

Restoration reuses ColloSys's existing separate preview directory, current-state backup, explicit confirmation and revalidation. It never commits, resets or pushes the original project. A restores only A's authorized directory. Retention, binary contents, path containment and original Git index integrity retain the existing connector tests.

The original task/comment model and writers remain in use, with recorded native permission patches. Captured Codex messages appear in project activity and have persisted, paged session queries. Human context handoffs can freeze the captured context, reference a verified checkpoint and add a comment through the original task writer; they do not create executable Agent sessions. Native Inbox projection and the corresponding session/handoff management UI remain separate work.

Encrypted backups now use the actual local Convex file store, with owner-scoped downloads, quota reservations, complete receipts and independent recovery/export. The detailed API, migration and failure contract is in [BACKEND_CONTRACT_2026-10-25.md](BACKEND_CONTRACT_2026-10-25.md). Storage is still on the local computer, not remote disaster recovery. The desktop backup/retention management screens and current Windows installer/updater have not been completed. Full upstream `cast check`, every original feature and public-network deployment are not claimed as verified. Actual commands/results are recorded in PLAN.md.
