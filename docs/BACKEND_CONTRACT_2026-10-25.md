# Local backend contract

The current backend is the complete pinned Codecast Convex application plus owned ColloSys changes. Team workspaces require a current membership even for a resource creator or assignee. Projects within one team inherit that team's visibility; they are not separate private-project ACLs. Personal workspaces retain their original explicit sharing semantics.

## Encrypted checkpoints

The local connector alone reads checkpoint content and encrypts it with the existing scrypt/AES-256-GCM format. The backend receives ciphertext and its digest, never the passphrase. `POST /api/projects/:project/backups` reserves storage after verifying an owned workspace's complete checkpoint. `PUT /api/projects/:project/backups/:id` verifies the exact length, digest and envelope; a transaction rechecks current device/project access and the reservation before acknowledging a complete backup.

The current local store reports `location: local-convex-storage, remote: false`. It is on this computer and is not disaster recovery against loss of this computer. Default project quota is 100 backups / 256 MiB, including pending reservations. The project owner can adjust it within 1–100 backups and 24–2048 MiB. Each encrypted backup is at most 24 MiB, stored in ordered chunks of at most 4 MiB. Pending reservations expire after one hour. A periodic collector removes unattached ColloSys chunks older than two hours, without touching original Codecast file types.

Metadata and encrypted bytes are owner-private. Another authorized directory belonging to the same account/project can recover the backup. Downloads pass through an authenticated HTTP action with access checks before each chunk; the application does not disclose permanent file URLs. This follows the [Convex file access guidance](https://docs.convex.dev/file-storage/overview). Deletion removes the manifest, chunk references and stored objects transactionally. A deleted/recreated ID has a different reservation identity, so an older in-flight upload cannot finalize it.

Connector endpoints, all requiring the signed-in local owner:

| Endpoint                                     | Purpose                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/storage`                           | Retention policy, protected checkpoints, disk usage, recovery jobs, last verified backup |
| `POST /api/storage/policy`, `/pin`, `/clean` | Serialized policy, pin and confirmed cleanup operations                                  |
| `POST /api/backups/create`                   | Confirm a checkpoint and passphrase; reserve, encrypt and upload                         |
| `POST /api/backups/recover`                  | Confirm download/decryption into a separate managed recovery directory                   |
| `POST /api/backups/export`                   | Confirm `recoveryId` and a new absolute destination; verify and export bytes             |
| `POST /api/backups/delete`                   | Confirm deletion of an owned backend backup                                              |

Export never overwrites an existing directory or writes into a connected project or managed storage. The exported directory can be registered normally. A failed external export is retained and explicitly reported, avoiding deletion of concurrently added user files. Incomplete managed recovery jobs are reclaimed at startup/cleanup. A recovery is not a restore preview; restoring an existing work directory still requires its separate current-state backup and stale-preview checks.

## Captured sessions and human context handoff

`colloSessions:list` and `messages` expose persisted, project-scoped source messages through bounded pages. They describe captured Codex logs, not remotely executable Agent sessions. Source identity includes workspace, source session and message ID. If restoration of an older local SQLite database causes a message to be imported again, identical source content gets a durable alias receipt pointing at the original sequence. The first observed checkpoint association remains authoritative. Conflicting source content fails.

`colloHandoffs:send` accepts a project, request ID, recipient, title, context and next steps; it may reference a captured session, a complete checkpoint and an existing native task. The backend verifies both members' current project access and the task's exact project/visibility. A session reference freezes its current through-sequence so later messages do not silently change the handoff. Retries with the same request ID are idempotent. The task comment uses the original Codecast writer and updates native Threads/cache bookkeeping, with Agent relay explicitly disabled.

`colloHandoffs:respond` requires the expected revision. Only the recipient accepts/declines; only the sender cancels. Concurrent conflicting responses cannot both succeed. Acceptance validates a still-accessible task; cancellation/decline remain possible after a task is removed or moved, without writing to that now-unrelated task. Accepting a handoff does not automatically apply files, transfer task ownership or execute a model.

## Existing data and migration

New checkpoint receipts maintain cross-part path uniqueness. Previous receipts are verified in batches of at most five parts. Saved-file ingestion and backup reservation advance this migration before accepting new data, returning a retryable response until ready. `colloCheckpoints:verify` lets a client explicitly advance a selected historical checkpoint until `{ready:true, valid:true}` before using it for a handoff. An invalid historical receipt remains readable but cannot serve as verified recovery evidence. Pre-summary receipts retain their explicit legacy-unverified status.

`colloSessions:indexHistory` builds captured-session summaries for previous events, at most twenty bounded events per transaction; concurrent ingestion marks its own projection in the same transaction. Clients repeat until `done:true`. Session list results disclose whether old history has finished indexing. The desktop session/handoff management UI must call these migration endpoints when it is connected; it is not completed merely because these backend functions exist.

## Native permissions and identity

Owned patches cover the original task launch and dispatch checks, task/project list shortcuts, assignee boundaries, change-log access stamps, comment participants, notification reads/watches/delivery and queued push delivery. Membership removal immediately removes team access even when historical creator, assignee or subscription records remain. Account deletion removes membership authority and makes all remaining sessions/API credentials fail closed; shared task/project history is retained. This is not a claim that all historical personal records and credentials are physically erased.

Expired/revoked browser sessions return the original retryable unauthenticated error contract so native queued edits can wait for login. Device grants have a separate background-capture lifecycle and are explicitly revocable. Anonymous login discovery remains available. No cloud, paid model, outbound invitation, public listener or tunnel is introduced.

Actual checks, failures and evidence directories belong in `PLAN.md`; this contract alone is not test evidence.
