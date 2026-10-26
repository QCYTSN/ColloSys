# ColloSys workbench: hierarchy rebuild

Status: implemented replacement sample, awaiting the user's visual evaluation. It supersedes the rejected warm reading-desk sample; it is not approval to migrate the rest of the product.

## Open

Run `npm run design` from the repository to open the independent Windows desktop sample. `npm start` opens the existing real product. The browser debug entry is `http://127.0.0.1:3407/design-lab` while local services are running.

The sample uses explicitly labeled synthetic members, messages, patches and checkpoints. It performs no Agent execution or real file restore. Real accounts, connectors, synchronization and recovery remain in the existing product.

## What changed

- One project bar replaces the repeated brand, team, project sidebar and breadcrumb. The left index contains only activity scope, search and member filtering.
- The real upstream ConversationHeaderBar supplies the reader's title/action frame. Title and provenance occupy a compact context header; conversation, changes and checkpoints are local to the selected work.
- Conversation reading sits beside contextual file and storage evidence. Files open directly to their corresponding diff. There is no always-present checkpoint CTA footer.
- Narrow readers expose the same evidence through a named disclosure. Choosing a file or history closes the disclosure and opens the selected view.
- File changes have a file navigator and a dedicated diff area. Original FilePatchDiff renders real fixture patches with line numbers. The history screen distinguishes current capture and predecessor, owner device and off-machine backup.
- Google Sans, the supplied peanut artwork and Phosphor remain. Neutral gray-blue structural surfaces, white reading space and consistent message/toolbar/file-row typography replace the earlier warm palette. Chinese uses the system sans fallback; code remains monospace.
- Work progress and delivery health are separate fixture fields. A device being offline does not imply that work is running or complete.

Preserved behaviors: URL-addressed selection, per-activity file choice, persistent panel sizing, historical reading position, explicit follow-latest, keyboard menus and dialogs, focus return, reduced motion, manual edits without an Agent session, teammate read-only preview and stale-preview rejection in the non-writing rehearsal. Teammate scope expands within its history row; only own-workspace restore uses a confirmation dialog. Both system and sample reduced-motion settings include portaled menus, overlays and dialogs.

## Matched native-reader comparison

The More menu exposes “同内容原生会话对照”. This mounts the **actual pinned Codecast ConversationView**, with the same synthetic message text and a read-only guest configuration. The native reader retains its own styles; it is not a new imitation made for comparison. The adapter is `integrations/codecast/web/DesignReference.tsx`.

This comparison is specifically the native conversation reader. It does not pretend to be a full native account/session/desktop workflow. The previous sparse owned Workspaces baseline is recorded as inadequate in [HIERARCHY_REJECTION.md](HIERARCHY_REJECTION.md).

## Evidence and boundaries

Current executed checks and evidence paths are recorded in PLAN.md and REBUILD_REVIEW.md. Historical screenshots and REVIEW.md remain evidence of the rejected sample, not current screenshots. New captures are under screenshots/rebuild.

No global theme migration, production session-reader wiring, dark-theme design or deployment is claimed by this sample. The isolated route does not change backend authority, the original Git/workspace protection rules or the default product entry.
