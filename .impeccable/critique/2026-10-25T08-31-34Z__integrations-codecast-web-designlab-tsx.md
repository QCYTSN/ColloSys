---
target: integrations/codecast/web/DesignLab.tsx
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-10-25T08-31-34Z
slug: integrations-codecast-web-designlab-tsx
---
# Rejected sample: composition and hierarchy review

Method: dual-agent (A: /root/hierarchy_design_review; B: /root/hierarchy_evidence_review). User rejection is authoritative. This is a diagnosis, not an approved replacement design.

## Why source access did not deliver reference quality

The new sample imported the original `FilePatchDiff` and `shouldFollowStreaming`, but independently rebuilt the application shell, list and message composition. Retaining a mature renderer and interaction helper did not transfer the original composition's information priorities. The earlier baseline script opened our owned Workspaces integration, not the complete native conversation workbench, and used different, much sparser data. It could establish that local collaboration worked; it could not establish visual parity with the reference.

The prior finish review checked a list of implementation defects and missed the overall structure. Functional passes and a clean pattern-detector result remain valid within their scope; neither supports a conclusion that the user's visual brief was satisfied. The historical `ship for review` disposition is superseded.

## Source and measured evidence

Fresh browser measurements, 1440×900 / 1280×800:

| Region | 1440×900 | 1280×800 |
| --- | ---: | ---: |
| Global top bar | 59 px | 59 px |
| Detail toolbar | 49 px | 49 px |
| Detail title and facts block | 136.14 px | 128.05 px |
| Detail tab strip | 43 px | 43 px |
| Conversation viewport begins | y=287.14 | y=279.05 |
| First message text begins | y=404.64 | y=396.55 |
| Conversation viewport height | 516.86 px | 424.95 px |
| Persistent checkpoint footer | 67 px | 67 px |

The main title is 23 px at the larger width, activity title 13 px, and most provenance/status text 11 px. This imbalance is not solved by blanket enlargement: repeated framing must yield before useful information does.

1. **P1 — Framing precedes evidence.** `design-lab.css:377`, `687`, `708`, `758` stack scope, toolbar, headline/facts and tabs. The transcript adds another start marker and author row. Original `app/globals.css:127–181` explicitly protects transcript space and differentiates title, facts, live status and actions; `ConversationHeaderBar.tsx:88–108` implements that organization in one frame. Retain the reasoning, rather than copying the font size mechanically.
2. **P1 — Global and object-local scope are conflated.** Sidebar checkpoints changes the selected activity's detail tab (`DesignLab.tsx:414`), while the detail tab lists history and the footer opens one preview (`657–674`). Similar labels imply different scope. Original `DetailSplitLayout.tsx:10–17` makes list/detail transitions explicit and retains location. Re-establish project, work item, evidence and action ownership before redesigning navigation.
3. **P2 — Density is spent on repeated context.** Team/project names repeat across rail and breadcrumb; activity facts repeat in the reader; list entries use four stacked rows. The important operational text is small while margins and headers dominate. Typography must distinguish subject, actionable exception, provenance and excerpt, with Google Sans and Chinese fallback tuned together.
4. **P2 — Emphasis does not follow the current task.** The filled checkpoint action dominates while reading a teammate's conversation. Code and changed-file evidence should be directly available in that context; restore-specific emphasis belongs inside a chosen checkpoint's flow. Keep provenance/backup facts available without giving them the same persistent visual weight as the current task.
5. **P2 — Demonstration chrome leaks into product composition.** Permanent font/icon credits, repeated display-settings entry points and explanatory footer copy make the surface read as an implementation specimen. Keep an honest test-data indicator, but put implementation choices in development documentation. The supplied peanut mark does not require an additional visible sub-brand or a uniformly warm reading-room aesthetic.

The activity fixture also puts completion, pending review, device connectivity and share failure into one `DesignStatus` union. These describe different axes. A revised presentation should distinguish work progress, synchronization health and backup evidence; a single status icon should not imply they are equivalent.

## What can remain

Keep the confirmed Google Sans choice, supplied peanut mark, one Phosphor icon family, desktop framework, existing data/backend contracts and the verified useful interaction behavior. Preserve reading position, file selection, keyboard focus, source-device ownership and stale-preview rules. Their preservation does not require retaining the rejected composition or palette.

## Correction order

1. Establish one explicit scope hierarchy: project → selected work → conversation / changed files / checkpoint history → contextual operation. Define what each navigation item opens and remove conflicting labels.
2. Build a matched-content baseline from Codecast's actual native workbench components, at the same viewport and state. Document which source decisions protect content and which features do not fit ColloSys. Do not use the owned sparse Workspaces page as a substitute for the product reference.
3. Recompose the core workspace around actual review tasks: quiet project scope, scannable activity, a compact contextual header, substantial evidence space, and actions tied to the currently selected evidence. Avoid simply making every region smaller.
4. Apply an original visual language using the confirmed assets after that hierarchy works. Compare Chinese/Latin/code rhythm, surface differentiation, aligned rows and meaningful transitions in actual operation.
5. Keep engineering acceptance and visual comparison separate. Do not globalize tokens from a rejected sample. The user has already identified hierarchy as the priority; no further color or component-library questionnaire is needed for this diagnosis.

## Independent heuristic assessment

These are Assessment A's subjective diagnostic scores, not a measured design-quality certificate.

| Heuristic | Score / 4 |
| --- | ---: |
| System status | 3 |
| Real-world match | 3 |
| User control | 3 |
| Consistency | 2 |
| Error prevention | 3 |
| Recognition | 2 |
| Efficiency | 2 |
| Aesthetic/minimalist design | 1 |
| Error recovery | 3 |
| Help/documentation | 2 |
| Total | 24 / 40 |

The main cognitive burden is interpreting competing scopes and repeated facts. A frequent reviewer loses evidence space; a new teammate may infer that checkpoint preview is the intended next action because it receives the strongest emphasis. This review does not establish production integration or full accessibility compliance.

## Run notes

- Stable target: `integrations/codecast/web/DesignLab.tsx`; slug `integrations-codecast-web-designlab-tsx`. No ignore file was present.
- A inspected a new Chrome context at 1440×960 and source without seeing the detector or prior verdict. A completed before B's findings were read by the parent.
- B measured fresh 1440×900 and 1280×800 pages and retained clean screenshots in `.local/codecast-app/hierarchy-review/`; full measurements are `b.json`. A's independent image is `.local/codecast-app/hierarchy-review-a.png`.
- The deterministic source detector ran once and returned `[]`. That narrow result demonstrably does not detect the hierarchy issues above.
- Browser mutation preflight passed. External overlay-script injection was blocked by the application's existing Content Security Policy; no human-visible detector overlay ran. CSP was not weakened. Clean screenshots and DOM measurements provide the fallback evidence.
- B closed its browser and stopped only its temporary overlay server; process termination was checked. Root-owned product services were stopped after inspection. Evidence helpers are retained for reproducibility; no temporary report-body file is required by the snapshot writer used here.
- This turn changes documentation/status only. No frontend replacement, global theme migration, backend change or new full-suite acceptance claim is made.
