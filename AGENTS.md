# ColloSys engineering contract

- Build a real locally runnable collaboration system for teams of up to ten. Frontend, local connector and persistent backend are required.
- Keep each member's work directory independent. Activity synchronization never applies another member's files automatically.
- Manual saved-file edits work without an Agent. Agent attribution must be evidence-based.
- Only scan explicitly configured roots. Never follow symlinks/junctions. Exclude credentials, dependencies and build output before snapshotting or sending.
- Preserve original Git index, HEAD and branches. Snapshots live in a separate managed repository. Pin retained snapshots to references.
- Restore through a separate preview directory, back up current state, require explicit confirmation and reject stale previews. Never use reset --hard on user directories.
- Backend determines actor identity and validates project/workspace membership. Development login must fail closed outside loopback development.
- Persist outbox before sending, acknowledge only after server persistence, deduplicate by event ID, and support cursor replay.
- Keep protocol versioned and shared. State what is captured locally versus backed up remotely.
- Reuse is recorded in THIRD_PARTY_NOTICES.md with upstream commit and changes. Delta proprietary code is not included.
- All development servers bind to loopback. Do not buy, deploy, tunnel, send invitations, or call paid model APIs without an explicit user request.
- Verify with npm run typecheck, npm test, npm run build, npm run typecheck:integration (against the current prepared fork) and meaningful real local acceptance tests. Record actual results and unfinished requirements in PLAN.md.

## Previous authorized work window

User requested 90 minutes of implementation, then stop regardless of progress. Started 2026-10-23 00:10:51 Asia/Shanghai; stop at 01:40:51. Use the time to implement and verify, not to claim the full product finished.

## Current authorized continuation

The user subsequently authorized completing all four follow-up areas. Collaboration scope is tasks, comments and context handoff; applying teammate files is excluded. Implement account/team/project management, Windows installation and project/source onboarding, retention/quotas and encrypted backup/recovery. Complete local verification and deployment preparation; purchasing, public deployment, tunnels and sending invitations remain unauthorized. The previous time window has ended and does not limit this newly requested continuation.

## Authorized foundation change (2026-10-23)

The user explicitly chose to adapt the complete Codecast open-source project and integrate ColloSys checkpoints/restoration. Preserve Codecast's actual frontend, authentication, store and Convex backend. Workers/D1 and the selected-component frontend are now the preserved legacy implementation, not the target architecture. Keep the pinned original in third_party/codecast/upstream unchanged; owned patches and additions live in integrations/codecast and materialize the complete runnable fork under .local/codecast-app/source. Never edit generated fork files as the source of truth. The current work is authorized; do not repeat the already-answered architecture question.

## Product frontend scope correction

The user wants the actual application workbench. Complete-source reuse does not authorize shipping Codecast's marketing homepage, pricing, downloads, blog, promotional assets or original-domain installation scripts. Keep those in the immutable upstream reference only; exclude them from the ColloSys application routes/build. The product entry goes directly to the workbench or its local sign-in and preserves the requested project after sign-in. A browser test is not evidence that a desktop client has been implemented; do not conflate website removal with choosing or completing the final runtime form.

The user then explicitly selected an independent desktop software window. The default product entry must launch that desktop window; a browser-only launcher does not satisfy this requirement. Reuse the pinned Codecast desktop framework with recorded, owned Windows/local adaptations, keep the original platform mirror unchanged, and verify actual native-window behavior. Browser startup is a separate debug command. No desktop shortcut or public installer is implied by this decision.

## Free-first internal deployment direction (2026-10-25)

The user prioritizes zero provider fees during early internal use and explicitly permits combining Cloudflare and Convex free allowances. A Cloudflare-only backend is not required. Retain the current Codecast/Convex business data, auth, reactive transport and workbench. Do not resurrect the legacy Workers/D1 backend or maintain two authoritative copies of accounts/tasks solely to use both vendors. Future commercial use does not require a different database by definition.

Target Convex Free with its hard caps, not Starter usage-based overages. Cloudflare static asset delivery is optional; R2 is an optional later backup provider with metered overages, not a guaranteed zero-cost prerequisite. Never auto-upgrade plans, enable a billing subscription, deploy publicly or purchase services. Keep snapshots/local recovery usable when remote limits stop synchronization, and retain pending events. Do not cache authorization to reduce bills.

Only collaboration maintenance crons are exported by the current fork; original hosted automation schedules stay in the immutable reference. A cron reduction does not certify every manual hosted-action entrypoint as disabled. `npm run cost:audit` reports source-based invocation estimates and remaining cloud blockers; it is not live provider telemetry. Ten users and local tests do not prove the deployment fits free database I/O, storage or traffic caps. Preserve the independent desktop requirement when adding cloud connectivity.

## Frontend research and visual decision gate (2026-10-26)

Read the current revision record in `docs/workbench-revision/WORKLOG.md`. The earlier `docs/design/` and `docs/design-sample/` files are historical evidence and unapproved candidates; their palette, layout, metaphors, sample count and library preferences are not permanent product instructions. `docs/design/reference-research.md` retains useful pinned source traces, subject to current verification.

The latest request supersedes the two-candidate exercise: implement one polished, operable collaboration workspace at an isolated entry, compare equal-content native reference behavior, and stop at visual selection. Activities need not belong to a task. Progress, action requests, delivery, attribution and backup integrity are independent facts. Keep the existing protocol and business stores authoritative. The user explicitly prohibited local skills; do not use them unless the user subsequently changes this instruction. Do not run their generators, hooks, normalizers, scoring or review workflows. Do not infer design approval from a prior skill report.

Stop at the user's visual selection gate. Do not migrate production routes or replace backend/state logic until the user chooses a direction. Generated fork source is never the source of truth for edits. Subsequent implementation must preserve independent desktop delivery, existing authentication/Convex/store, evidence-based attribution and safe local restoration. New design work must retain the confirmed Google Sans, supplied peanut mark and one consistent icon family unless the user changes those choices.

## Authorized complete product UI change (2026-10-27)

The latest user request and `ColloSys_Product_UI_Completion_Brief.md` explicitly supersede the isolated-preview-only and production-route migration gates above. Complete the formal desktop application shell, branding asset pipeline, core pages and navigation using the existing full Codecast application and ColloSys services. `/workbench-preview` is a development reference, not the final product. Preserve auth, permissions, Convex/store, connector and safe restoration. Reuse verified AgentTypeIcon/BrandIcons for Agent identity; Phosphor consistency concerns functional icons, not replacing distinct Agent marks. Keep appId, userData and compatibility protocols unless an explicit migration is necessary. No local skills, unsolicited commits/pushes, public deployment, invitations or paid model calls. Verify product completeness and visual quality separately using the normal desktop entry and real persisted data.
