# Unified design execution record

Authoritative request: the expanded user-pasted “ColloSys：统一视觉语言与精密参数实施规格 v1”, attachment `867e8266-a83e-437a-b5ee-b3a20d7224ba`, and its companion execution packet. The expanded brief is preserved as `../DESIGN.md`; the packet's token JSON is adopted into the existing owned theme path. Its contrast JSON is only a mathematical proposal, not evidence of runtime contrast.

Starting branch/commit: `codex/product-ui` / `f4a1e815ef2fc63612e7d22f8dcd61576eab71cd`. The prior round was committed and pushed before this request. This round has no commit, push or deployment authorization. No local skills, skill scripts, agents, paid calls or invitations were used. The upstream/platform mirrors and existing local data remain intact.

Subsequent publication instruction: after the implementation handoff, the user explicitly requested “先提交推送”. This authorizes committing and pushing this revision, its tests and evidence to the existing public `QCYTSN/ColloSys` repository on `codex/product-ui`. Uncommitted/unpushed statements below describe the verification stage. Recorded build identities remain unchanged; publication does not imply visual approval, resolution of latency/OAuth limits, a merge into main or application deployment.

Publication preparation includes all 22 intentionally retained evidence logs despite the repository's general log ignore rule. The changed-file scan found no configured-secret/JWT/key patterns in source, text evidence or the six decompressed traces, and no individual file above 50 MB. Staged whitespace checks have only verbatim font-license trailing spaces and raw command-log whitespace; these source records are preserved. Owned source, tests and authored documentation pass the whitespace check. The implementation fingerprint remains unchanged.

## Baseline and scope

Fresh baseline screenshots use the normal formal routes with the persisted TEST dense fixture: project/activity, tasks with actual Active/Display menus, captured conversation, 32-file checkpoint Diff, settings and login. Production menus and heavy flows were sampled in three independent Chrome rounds at 1440×900, DPR 1, zoom 1. Before measurements reside under `evidence/before/production`; screenshots under `evidence/before/screens`. Metadata in each file retains the actual old production package identity (historical pre-publication commit with content fingerprint `7f4ea772ccf37367598f60ed97eebf1129cc028d30023d59499cbbea3cbdc1cb`), rather than relabelling it as the later publication commit. No build or parallel browser work overlapped these measurements.

The baseline capture harness initially attempted navigation before the services were ready, then reached an activity row before pagination settled, and later tried opening an already-open settings dialog. Those harness issues were corrected to wait for actual content/readiness. Failed captures are not counted as passed states.

The formal application, existing business stores, authenticated queries, native entry, data permissions, restore previews and confirmation flow remain the target. `/workbench-preview` is not the deliverable. Implementation is owned source plus exact upstream seams; prepared source is generated only.

## Implementation record

- `design-tokens.json` is the sole source for new primitives and semantic colors. The existing theme runtime adapts those values to the remaining upstream components; product semantics do not read legacy `--sol-*` colors back. Boot and native-window background read the same palette. Existing valid accent preferences are preserved, including values that cannot be distinguished from an old default; only a fresh preference receives Forest.
- Google Sans is retained. Its actual local file has opsz 17–18, wght 400–700 and GRAD -50–200, and contains no Chinese glyphs. Noto Sans SC supplies Chinese locally; Newsreader Roman is confined to the art caption. Font file inspection is in `evidence/font-files.json`; real rendered-font inspection is a separate acceptance requirement.
- Shared menu primitives retain Radix focus/keyboard/positioning and immediate model callbacks. List triggers now move the entire inner face (border, background, text and icon) by 0.7 px, while the button anchor stays fixed. Rapid presses start from the current computed transform. Menus use opacity plus translation without scale.
- Formal shell and core pages adopt the new roles, gutters, sidebar range, reading width and shared controls. Redundant activity heading copy is removed; source connection, member filter and local history remain available.
- Conversation/code composition keeps its actual children mounted when switching at 1064 CSS px (420 reading + 600 code + 40 timeline + 4 separator). Hidden panes retain geometry and become inert: `display:none` was found to reset a nested scroller during real resize timing. Pixel minima replace percentage approximations that lost the separator width. The file tree switches at its actual 804 px container and retains the original file/row recovery mechanism.
- Task titles now wrap unbroken strings inside the 720 px reading axis; task metadata, status stations and comment initials use readable roles. Narrow settings display complete keyboard-action descriptions. Storage errors scroll the associated field and message into view before returning focus, preserving confirmation, request identity and passphrase-clearing behavior.
- The original local SVG water scene replaces Fold in the bundled login component and public asset chain. Main landscape layers remain fixed. Reflection and masked light are the only animated layers; the existing enum-only auth and visibility boundaries are retained. Authentication never waits for an art animation.

## Reference boundary

The specified palette and dimensions are ColloSys design decisions. [Geist's Anthropic project](https://geist.co/work/anthropic) and the [brand-team interview](https://www.thesubtext.online/all/anthropic-interview) informed the relationship of restrained UI typography and editorial artwork, not a claim to Claude's internal design tokens. Official [Google Sans](https://github.com/googlefonts/googlesans), [Newsreader](https://github.com/productiontype/Newsreader) and pinned Google Fonts sources establish font provenance. No reference site's code or artwork was copied.

## Verification

The implementation is based on `f4a1e815ef2fc63612e7d22f8dcd61576eab71cd`, with uncommitted source fingerprint `7d773de1755a4c27abd5cfc4655aef57391de908507d365a39958494c7a0ea42`, 214 explicit prepared changes and 81 owned integration files. Historical menu-motion reports are retained only as prior-round evidence.

Required checks passed: `npm run typecheck`; `npm test` (69/69); `npm run build` (1m03s, retained upstream circular/import and large-chunk warnings); `npm run typecheck:integration` against the current prepared fork (81 files); `npm run codecast:verify` (9,854 immutable files, zero failures).

The real-flow suites cover menus and keyboard/focus, native zoom, password login and art, startup, auth races, principal/security boundaries, provider policy, project identity, native appearance/relaunch, reading/draft continuity, stale storage confirmation, membership revocation and durable auth. The identity suite's old outer-trigger transform assertion was replaced by inner-face motion plus an unchanged anchor assertion. Older 500-weight and “Dark mode” switch expectations were updated to the current explicit 600-weight role and Light/Dark buttons; the functional and accessibility assertions remain.

Additional real TEST flows exercise nested Verify/Retry buttons without accidental form submission, long handoff drafts, recipient acceptance/decline and revoked access. The storage suite uses actual local encryption, recovery to a separate directory, export, deletion, invalid passphrase and invalid destination, with declared HTTP/clipboard faults. Source and independent TEST teammate directories are byte-for-byte unchanged. The retained overflow counterexamples still fail when they should. The 720 px settings test exposed truncated keyboard descriptions, now fixed at their existing source.

Final browser verification covers **52 actual states**: login and focus, projects, activity, Tasks, Active/Display, captured conversation, task detail with an unbroken title, handoffs/detail, history/storage, settings, and the four requested viewport sizes with light/dark, sidebar 208/280 and the context pane expanded. Actual computed roles, Chrome rendered-font records and screenshots are in `evidence/final-audit/runtime.json`. `parameter-assertions.json` checks the measurements against the specification: no sampled visible text below 12 px, no sampled enabled non-gradient text below 4.5:1 after ancestor composition, no document horizontal overflow, and control/focus boundaries above 3:1. Task title self-clipping has its own assertion. This is a measured sample, not a claim about every arbitrary future state.

Actual typography: Google Sans for UI; local Noto Sans SC for Chinese (CDP may expose the variable file's internal family name containing “Thin”, while the selected PostScript instance and computed role identify the actual weight); Newsreader only for the 36/42-450 art caption. Auth title 28/36-600, page 24/32-600, object/task title 20/28-600, navigation/list 14/20-500, prose 15/24-400, metadata 12/18-400, trigger/menu 13/18, and actual Pierre shadow-DOM code 13/20. Google Sans opsz is 17 for small roles and 18 for titles, GRAD 0; weight remains a separate axis. Auth inputs/buttons measure 44 px, triggers 32 px, Display 320 px and complex settings 720 px.

The final `final-suites.json` records successful core storage/surface, audit, screenshot, menu/native-menu/login and responsive-reading runs on the current build. Earlier auth/security/identity/continuity suites retain their real intermediate build identities under `regression` and `regression-final`; later changes are scoped to role typography, panel minima and storage error visibility, not those authentication or protocol implementations. No old capture is relabelled as a new build.

Final login evidence includes a 2.1-second real frame trace of the ±9-unit reflection, a 6-unit input focus shift, and a real TEST password action held by a declared 3200 ms transport delay so the submitting light traverses its 70-unit path. The original action is then forwarded and its real invalid-password response appears. Reduced motion, local bundled art when external art requests are blocked, successful email login, and native minimize/restore pause pass. The delay is not a claim that external OAuth was configured or tested.

The current-build native suite verifies a real Windows window, native frame and editing shortcuts, menu removal, 125%/150% Electron zoom, native theme background and persisted appearance after relaunch. Native-menu tests separately cover 100%/125%/150%/200%. Windows display scale is 2; system DPI was recorded, not changed. The normal default-profile `npm start` entry was also opened successfully with a responding ColloSys native handle and matching source/runtime fingerprint. Ports 3407–3411 listen only on 127.0.0.1. No default-profile content was captured or deliberately edited.

### Paired production performance

Three fresh Chrome 156 processes per phase, 1440×900 CSS px / DPR 1, identical 65-message and 32-file fixtures. No build or other browser work overlapped measurement. Menu cold samples are n=3 each; warm samples are n=30 each. Full results and traces: `evidence/performance-comparison.json`, `evidence/{before,after}/production`. Numbers below are milliseconds.

| Observation | Before | After |
| --- | --- | --- |
| Active cold feedback, three rounds | 28.2 / 28.2 / 27.6 | 26.5 / 34.1 / 29.2 |
| Display cold feedback, three rounds | 29.1 / 22.9 / 28.3 | 22.0 / 20.4 / 29.4 |
| Active warm feedback P50 / P95 | 20.0 / 21.2 | 20.6 / 21.4 |
| Display warm feedback P50 / P95 | 20.3 / 21.5 | 20.6 / 21.6 |
| Grouping warm feedback P50 / P95 | 9.2 / 13.6 | 9.3 / 14.8 |
| Active / Display warm stable-content P95 | 203.9 / 204.0 | 204.2 / 204.7 |
| Heavy-flow EventTiming P95, three rounds | 96 / 104 / 96 | 96 / 104 / 104 |
| Project details cold EventTiming | 96 / 120 / 120 | 120 / 120 / 128 |
| Project details repeated EventTiming P95 | 56 / 48 / 56 | 40 / 32 / 40 |
| Long conversation return EventTiming P95 | 104 / 112 / 112 | 120 / 120 / 104 |
| First 32-file Diff EventTiming | 64 / 64 / 72 | 56 / 56 / 56 |
| Diff file selection EventTiming P95 | 24 / 24 / 32 | 32 / 24 / 32 |
| Actual keystrokes with login art running, EventTiming P95 | 24 / 16 / 24 | 16 / 16 / 16 |
| Heavy-flow long-task total | 1296 / 1454 / 1593 | 1331 / 1433 / 1302 |

Menu feedback and operability are sampled browser-frame opportunities, not hardware presentation. Stable content requires three matching geometry/text frames; therefore its approximately 204 ms includes the 160 ms opening transition and settling samples. Animation completion is recorded separately. The heavy-flow action called `dropdown first` is **Project details**, not Active or Display. EventTiming uses the maximum entry for each interactionId with a 16 ms reporting threshold; faster unreported input is not counted as zero. Whole action elapsed times include automation round trips and are not presented as input latency. Diff preparation and trigger feedback remain separately available in the raw samples.

Active/Display response is effectively unchanged at this sample size; first Diff improved, while cold Project details and some long-conversation returns still exceed the approximate 100 ms goal. These are unfinished performance requirements, not an overall speedup. Read-only round-3 trace inspection (`evidence/trace-review.json`) finds total renderer FunctionCall 4640.7→3983.2 ms, Layout 444.0→434.4 ms and Paint 1011.5→868.4 ms, with remaining long scripting callbacks. Categories are nested and cannot be added. This provides no evidence of a broad painting-cost increase from the new art, but does not causally isolate the individual 104–128 ms samples or certify native 60 fps. The exact cause of those residual misses remains unresolved; animations and fixture content were retained.

After-only real password-toggle feedback: n=30, P50 5.2 ms / P95 5.8 ms. Three actual failed password submissions show first feedback at 5.6 / 5.1 / 5.1 ms and backend-error frames at 39.0 / 38.6 / 32.0 ms. The latter include the authentication request and are not an interaction-feedback benchmark or a historical improvement claim. See `evidence/after/production/auth-performance.json`.

### Evidence index and open boundaries

`REVIEW.html` provides an interactive before/after comparison, optional brand-area masking, extra core-page captures, actual parameter tables and continuous operation recordings. `evidence/verification-index.json` links the final build, required checks, actual native entry, parameter assertions, real-flow suites and performance; each earlier suite retains its own build identity.

The handoff page was opened as a real local file: 33 local asset links and all 11 before/after pairs loaded, the brand-mask toggle worked, and no page-script errors occurred. `git diff --check` passed; no tracked immutable/generated-source changes were found. Evidence hygiene scanned text and all six compressed traces for JWT/key patterns and exact configured local/TEST secrets, with no findings. This does not certify arbitrary undisclosed secrets or image/video OCR. These checks are recorded in `evidence/review-artifact-check.json` and `evidence/evidence-hygiene.json`.

Real GitHub/Google clients remain unconfigured, so external provider round-trip login is not verified. No public deployment, invitation, paid call, installer or automatic application of teammate files is claimed. OS DPI changes, multiple physical displays and native hardware frame rate remain unverified. User aesthetic acceptance is separate from functional and parameter checks. This round remains local and uncommitted/unpushed.

### Corrections driven by verification

- Initial contrast parsing mistakenly treated CSS `color(srgb ...)` channels as 0–255. It now resolves CSS colors through an actual browser canvas and composites ancestor backgrounds and opacity. The initial `calibration` directory is diagnostic, not acceptance evidence.
- Actual rendered-role checks found a reset optical axis on auth inputs, a 600-weight selected navigation item and a reader slightly wider than 720 px; all were corrected. The long-task page revealed its own clipped unbroken title, small status/count/initial text and a low-contrast timestamp that a document-only overflow check had missed.
- The responsive component test initially used a zero-width divider and checked before panel layout settled. With a real 4 px divider and settled geometry, it exposed both percentage-minimum loss and hidden-pane scroll reset. The final test checks exact retained nodes, drafts and 333/555 px scroll positions across 1064/960/1280/800/1440 px widths.
- Storage field scrolling alone was insufficient: the subsequent availability reads could change content above the form. The focused error is now kept visible after those reads finish, while a newer focused action is left alone. Final evidence includes the actual error geometry and scroll calls; no passphrase is recorded.
- Some early harness starts preceded the web service, and a workspace switch was initially checked only against the shell. The harness now waits for service readiness and the requested real page content. An isolated test initially resolved two React copies; its bundler now deduplicates React explicitly. These harness corrections do not count as product fixes.

## Visual judgment and bounded differences

The new shell uses surface hierarchy and spacing, with a single selected treatment, rather than permanent shadows around every section. Project rows retain two readable text lines; project overview, formal task detail, captured conversations, real checkpoint Diff, handoffs, directory history, storage and grouped settings use the same typography and control palette. Long project names still have their existing full-name access path in compact headers; the task's primary title grows vertically. At 1440×900 the activity list begins at roughly 202 px, within the brief's approximate 200 px budget without hiding necessary controls.

The water scene has recognizable distant mountain, broad water, warm shore and dark bank layers, with negative space above. These four main layers never animate. Reflection shifts within ±9 SVG units over 8 seconds; the small clipped light reacts to enum states. Its Newsreader caption is confined to the artwork. The form uses Google Sans with local Noto Sans SC fallback. This is an implementation and visual assessment, not user aesthetic approval.

The authoritative color/type primitives are in the adopted JSON. Existing owned styles and component seams apply geometry directly; this is not a claim that every inherited utility class has been converted into a JSON variable. Existing valid accent choices are retained, including an old stored default indistinguishable from a deliberate selection. Only a fresh preference uses Forest. An existing sidebar width preference is retained and constrained to the authorized range. Wide projects keep the 24 px gutter; the brief's optional 32 px wide-screen gutter is not required.

The exact-width dialog uses internal header/body padding rather than double-padding the dialog root. The measured 720 px settings surface includes its sidebar and scrollable content. Source/integrity facts remain accessible in the compact Diff provenance disclosure; backup limitations and recovery confirmation remain visible in their actual flow. No restored teammate files, store replacement, new business summaries, paid models or provider credentials were introduced.
