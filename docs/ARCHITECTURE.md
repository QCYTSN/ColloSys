# Architecture

**Historical topology:** the user subsequently selected the complete Codecast stack. The current application is described in [CODECAST_ARCHITECTURE.md](CODECAST_ARCHITECTURE.md). The Workers/selected-component architecture below describes the preserved legacy application.

**Current status, 2026-10-23:** the [original audit](AUDIT_2026-10-23.md) is retained as pre-repair evidence. Its ten findings have received implementation changes and regression coverage; see the [repair record](REPAIR_2026-10-23.md). This document describes current mechanisms and their limits, not a guarantee against every filesystem race or a public deployment certification.

## Runtime boundaries

```
Browser (React/Vite, 127.0.0.1:5173)
  ├─ authenticated REST + ticketed WebSocket → Worker (127.0.0.1:8787)
  │    ├─ D1: users, teams, projects, project membership, sessions, workspaces
  │    └─ one SQLite Durable Object per project: ordered durable events
  └─ authenticated loopback requests → member's connector (8791 / 8792 / custom)
       ├─ authorized project root: read saved files, apply confirmed restore only
       ├─ connector SQLite: checkpoints, outbox, receipts, source dedupe, previews
       └─ filtered snapshot Git repository: complete allowed-file bytes
```

`packages/shared/src/protocol.ts` is the versioned wire boundary, validated on the server with strict schemas. Actor fields are added by the authenticated backend, not accepted from the client.

## Saved-file capture

The connector combines Chokidar events with a five-second full rescan. Events are debounced and writes are allowed to settle. A scan reads regular files through handles, compares file identities and modification information, checks path containment, and skips symlinks/junctions. A changed or unstable scan is retried rather than published as complete.

Only one scheduled scan may be queued or running; additional notifications request another pass instead of building an unbounded queue behind a slow disk. Nested `.gitignore` negations are applied in directory order. `.collosysignore` exclusions are an additional sharing restriction and cannot be overridden by a child's `.gitignore`.

File content is hashed. Only content changes create an automatic checkpoint. Capture timestamps describe successful observations, not each keypress or every intermediate save. There is no cross-file atomic filesystem snapshot: independent files may have been read at slightly different instants. A detected mutation invalidates that scan; application-level consistency still needs the developer to stop related writers.

Allowed files are captured into a separate managed repository. Git subprocesses discard inherited routing/configuration environment, use an isolated index and disable external configuration/hooks. Explicit captured-byte blobs and paths build the tree without Git ignore/attribute transformations; tree inventory and object IDs are compared with the manifest before persistence. Every retained checkpoint is pinned under `refs/collosys/checkpoints/<id>`. Legacy checkpoints are byte-verified before use; invalid metadata is preserved and marked unusable, and a fresh valid baseline is captured. No original user Git object or history is copied. Invalid, unreadable, linked or oversized sharing-rule files stop capture rather than silently disabling exclusions.

The checkpoint row and all its outgoing event parts commit in one connector SQLite transaction. A crash before that transaction can leave an unindexed local Git object/reference, but cannot publish a checkpoint with missing file objects. A subsequent scan recovers by capturing current state. The prototype has no orphan object cleanup.

Large changes are split into bounded event parts. Each part names the checkpoint, total parts and part number. Text diffs are bounded and may be truncated; complete allowed-file content remains local. A formerly captured file that becomes excluded or oversized is marked `excluded`, not incorrectly declared deleted from disk.

## Delivery and replay

1. Persist an event ID and payload in SQLite before any send.
2. Worker validates session, project write permission and workspace ownership; it enforces size and path rules and redacts common credential patterns.
3. The project Durable Object inserts the event into SQLite with a unique event ID and increasing sequence, then synchronizes storage before acknowledging.
4. Repeated identical requests return the original sequence. Reusing an ID for changed content or another actor is rejected.
5. Only a matching ID and valid server sequence removes the connector outbox row. Network and authorization failures remain visible in the durable queue and retry with bounded backoff.
6. WebSocket notifications contain a new head sequence. Browsers retrieve actual events after their cursor; startup, reconnect and periodic polling use the same replay path.
7. Events and cursor are cached per user/project in browser storage with a 5,000-record live cache cap. Persistent history, session lists, messages and checkpoint file details have independent bounded SQL pagination, search and event-link lookup. They do not derive complete history from this cache. A 401/403 clears the cached activity and stops reconnection for that session. Server event retention is currently unbounded.

These are at-least-once requests with idempotent persistence, not a claim of exactly-once network delivery. A test proxy explicitly discards an acknowledgement after server persistence to verify this boundary.

## Authentication and access

Development account selection is allowed only when `AUTH_MODE=development` and the Worker URL is loopback. It creates random bearer tokens; only SHA-256 token hashes and expiration are stored in D1. Browser tabs use sessionStorage for independent identities. The separate password flow uses salted scrypt (N=32768, r=8, p=3), a server-held HMAC pepper, database-backed rate limits and seven-day revocable sessions. Production requires AUTH_PEPPER and cannot use development login. Password change revokes all existing sessions.

Session issuance conditionally matches the credential verifier used during password verification, preventing an in-flight old-password login from creating a session after a password change. Typed session-invalid responses trigger sign-in; a wrong current password on account settings does not incorrectly log the user out.

REST always derives identity from the stored token. Reading requires project membership; writing additionally requires an owner/editor role and workspace ownership. Final event publication and membership changes pass through the same project DO gate and recheck the session. Collaboration SQL writes also require current access at the mutation boundary; a rejected conditional write cannot be acknowledged as success. Workspace IDs cannot be reassigned by another member. Browser origin is checked. SQL uses bound parameters.

WebSocket connections use a 30-second single-use ticket obtained through authenticated REST, so the long-lived bearer token is not placed in a socket URL. Ticket redemption checks session and membership again. Notifications and heartbeat replies recheck access. Read access does not grant access to another member's local connector.

Local restore and Agent source selection require an authenticated account matching the connector owner. The connector serves loopback only and accepts browser origins only from the local frontend. If the backend cannot authenticate the request, these controls fail closed; background file capture still continues offline.

## Restore

A preview materializes target files in a new state-directory subfolder, without touching the live project. It records the observed current manifest and the exact target checkpoint. Confirmation is a separate POST with an explicit boolean.

Confirmation checks expiry and the current manifest, saves a new current-state checkpoint, checks again, and rechecks each file immediately before replacing/deleting it. Target content comes from pinned Git objects, not mutable preview files. The source project's Git index and branch remain untouched. Failures stop the operation and retain the backup; restore is not an all-files atomic transaction and cannot exclude every possible hostile concurrent filesystem race.

File-to-directory and directory-to-file transitions remove captured old files before writing replacements. Replacing a directory first checks that it contains no unmanaged or excluded files. Directory removal uses empty-directory operations only, so newly appearing content causes refusal instead of recursive deletion.

## Agent boundary

The Codex adapter parses actual rollout JSONL, scoped by `session_meta.cwd`. Only canonical `response_item` user messages and public assistant `final`/`commentary` messages are shared. `event_msg` copies, reasoning, tool outputs and initialization context are excluded. Stable source message IDs prevent duplicate ingestion; unchanged source files are not reparsed.

Selection requires an explicit local file and a confirmation. Existing history is skipped by default. Source identity and dedupe survive restarts. A file exceeding 32 MiB is refused with a visible status. The prototype does not tail rotated multi-file sessions, invoke models, or control Agents.

## Reuse boundary

Codecast supplies selected snapshot helpers, UI primitives, the Pierre diff renderer and loading mechanism, Markdown rendering structure, and scroll/layout behaviors. ColloSys supplies byte-verified snapshot construction, directory authorization, filtering, outbox transactions, project events, Cloudflare backend, paginated history, browser state and restore safety workflow. Exact source adaptations are in `FRONTEND_REUSE.md` and `THIRD_PARTY_NOTICES.md`. Delta's public plugin informed protocol design only; no Delta implementation is included.

## Second iteration additions

- `accounts.ts`, `teams.ts`: independent password accounts; transactional team creation and single-use hashed invitation codes; a SQLite trigger enforces ten team members even during concurrent acceptance. Only team owners provision projects and manage access. Passwords, invitation secrets and bearer tokens are never stored in plaintext in D1.
- `collaboration.ts`: shared strict schemas in `packages/shared/src/collaboration.ts`; tasks with optimistic version checks, project/task comments, context handoffs with recipient-only acceptance/rejection. Referenced activity must exist in the project's Durable Object. Lists use immutable insertion cursors, 50 rows/page. The browser serializes polling, pagination and mutations, refreshes all loaded rows, and preserves older records across overlapping requests. Handoff links load referenced events from persistent storage.
- `manager.ts`: a loopback process manager authenticated with both browser pairing and the actual member session. Explicit root confirmation starts connectors, and reconnecting refreshes their credentials. A native Windows folder picker is available. Metadata-only Codex discovery scans only the explicitly authorized log directory and requires separate consent before sharing a selected source.
- Manager start/stop operations are serialized per workspace; shutdown waits for in-flight HTTP creates and closes their final listeners. Connector status distinguishes capture from delivery, including explicit reauthentication/access failures, and queued events survive credential replacement.
- `retention.ts`: configured age/count limits, pinned checkpoints, outbox/preview protection and storage admission budget. Expired previews are removed. Garbage collection only affects the separate managed repository; retained commits are detached from old parent chains so expired content can be reclaimed.
- `archive.ts` / `backups.ts`: complete captured-file archives, gzip, random-salt scrypt key derivation, AES-256-GCM, SHA-256 transport/content validation. R2 stores ciphertext; D1 stores ownership, digest, reservation size and completion. A database trigger enforces 512 MiB per member per project including unfinished reservations. Single compressed archives are capped at 24 MiB; oversized snapshots fail explicitly without partial upload.
- Backup reservations have immutable generations and generation-specific object keys. Completion conditionally matches generation, digest and size; an old upload cannot complete or delete a newly reserved backup with the same public ID. Migration preserves access to old object keys.
- Recovery reconstructs into a new directory with no writes to the live worktree. Recovery previews expire after 24 hours; copy needed files before expiry. Ordinary restore previews remain valid for ten minutes. The entire backend persistence directory and AUTH_PEPPER must also be protected if operating a local server.
- `scripts/start.ts` and `local-web.ts`: an installed app serves the built UI on loopback and proxies authenticated requests/WebSockets to a selected backend. Thus the browser and connector remain on the same computer even when COLLOSYS_BACKEND is remote HTTPS. No public website is given arbitrary loopback authority.

Local tests exercise the actual workerd crypto/R2/SQLite APIs. Production CPU limits, TLS, accounts on separate devices and public-network reconnect remain deployment validation, not locally proven behavior.
