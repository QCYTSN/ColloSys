# Frontend source reuse and connected workbench

> **Current architecture (2026-10-24):** the sections below describe the historical selected-component frontend under `packages/web`, not the current product. ColloSys now uses the complete pinned Codecast workbench and original store/Convex/desktop foundation. Owned integration is under `integrations/codecast`; see [the current specialization audit](SPECIALIZATION_AUDIT_2026-10-24.md). Do not count the older browser results as validation of the current desktop or its migrated features.

Codecast's complete repository was obtained at MIT commit `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`. The files below were read before adaptation. Its pinned app uses React/Vite and React Router, with compatibility shims for Next-named imports. The complete upstream product and upstream tests were not run. Delta references cover public materials and plugin source, not its private UI/backend.

The earlier third iteration reused navigation and headers but lacked the persistent workbench behind them. The current iteration adds real paginated data contracts, complete checkpoint inventory, rich diff/message readers and navigation behavior. It remains an adaptation for ColloSys's selected collaboration scope, not a claim to have copied the entire Codecast application.

## Source and adaptation

| Upstream source under `packages/web` unless stated  | Local implementation and change                                                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/sidebar/navPrimitives.tsx`              | `components/codecast/Rail.tsx`: heading, section rows and counts; ColloSys projects/members replace upstream stores, dragging and desktop dependencies.                                    |
| `components/conversation/ConversationHeaderBar.tsx` | Header frame and slots; captured member/session metadata.                                                                                                                                  |
| `components/FileDiffView.tsx`                       | Collapsible file header; translated labels and ColloSys renderer slot.                                                                                                                     |
| `lib/diffModel.ts`                                  | Full pure diff model and conversion helpers.                                                                                                                                               |
| `components/diff/PierreDiff.tsx`                    | Actual Pierre renderer, CSS-variable theme, language helpers; unified/split and wrapping controls wired to ColloSys changes.                                                               |
| `components/diff/pierre.ts`                         | Renderer loading/preloading hook; theme and language load before mount, with readable patch fallback. Unused annotation helpers omitted.                                                   |
| `components/tools/MarkdownRenderer.tsx`             | Memoized block/rendering structure adapted for captured public messages, React Markdown + GFM. Raw HTML and upstream canvas/object controls omitted; images are explicit links.            |
| `components/conversationScroll.ts`                  | Pure follow-stream, initial-edge and resize-scroll behavior; ColloSys supplies virtualized rows and pagination.                                                                            |
| `components/DetailSplitLayout.tsx`                  | Mounted-list and Escape ownership behavior. ColloSys adds resizable desktop panes and mobile list/detail Back; upstream full-stage overlay and stage system are not represented as copied. |
| `app/globals.css`                                   | Selected minimal-style light/dark tokens and panel rules, adapted sizing for Chinese text.                                                                                                 |
| `packages/convex/convex/fileChanges/patchParser.ts` | Pure patch parser, including local correction to ignore empty transport lines after newline-terminated patches.                                                                            |

Source: [Codecast fixed commit](https://github.com/codecast-sh/codecast/tree/5dfb04f516122fe4f59a61137219b5a4e2e1f9f8). Attribution and dependency versions are recorded in `THIRD_PARTY_NOTICES.md`, `third_party/codecast/LICENSE` and the lockfile. No Delta code, Codecast branding or hosted backend dependency is required.

## What connects these components

- `WorkspaceBrowser` queries persistent activity and session summaries by fixed-head sequence cursors, with member/search filters. Refresh drains every new page before moving the cursor, including bursts larger than a page. Older rows remain accessible beyond the 5,000-event live cache.
- `SessionReader` fetches messages by workspace/session and durable event anchors. Virtual rows bound rendered DOM size; prepending older messages preserves the reading position. New messages follow only when the reader is at the end; otherwise the latest-message control is explicit.
- `CheckpointReader` combines all captured event parts, reports incomplete/duplicate inventory, pages file metadata and loads one patch on selection. A later event part updates the checkpoint's activity sequence and filename search results. Truncated/binary/excluded changes retain explicit boundaries.
- Event links use persistent `/event` lookup. Browser Back, mobile Back and Escape preserve navigation; detail retries reload the failed resource instead of only the surrounding list.
- Tasks/comments/handoffs have stable insertion cursors. Polling, mutation and loading older rows are serialized so a delayed poll cannot remove newly loaded rows; edited older tasks and accepted handoffs receive current versions.
- Independent roots and restore preview/confirmation remain enforced by the connector. The frontend does not launch Agents or write teammate code. Captured Agent content is limited to user and public assistant messages; structured tool-output playback is outside this protocol.

## Executed verification

The final complete Chrome suite passed 11 tests. Five use real local accounts/backend/connectors; six regression scenarios use explicitly labelled fixtures and controlled transport latency with the actual SQLite handlers to reproduce page/state races. They do not count as real multi-device testing. SQL tests separately cover 5,103 stored events, 301 sessions, equal timestamps, message anchors, multipart inventory and fixed-head pagination.

Screenshots inspected from the running app: `.local/verification/workbench-diff.png`, `workbench-session.png`, `workbench-mobile.png`. These use clearly labelled test data; production UI has no embedded fake feed. The actual diff renderer was visually checked as well as asserted through its rendered code content.

See `PLAN.md` and `REPAIR_2026-10-23.md` for current package verification and remaining external work.
