---
name: ColloSys replacement workbench sample
description: Source-derived record of an isolated implemented sample awaiting visual evaluation
colors:
  reading-white: "#fff"
  index-cool: "#f5f6f8"
  evidence-subtle: "#f9fafb"
  divider: "#e4e7ec"
  ink: "#242931"
  muted: "#606975"
  hover: "#edf0f4"
  action-graphite: "#303c49"
  action-graphite-hover: "#455466"
  feedback-graphite: "#303b49"
  saved-green: "#347252"
  failure-red: "#a84343"
  focus-blue: "#567697"
typography:
  title:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0"
  body:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.8
  ui:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  user-message:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "Consolas, 'SFMono-Regular', monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.8
rounded:
  control: "5px"
  inset: "6px"
  activity: "7px"
  menu: "8px"
  dialog: "10px"
spacing:
  compact: "6px"
  control-gap: "8px"
  small: "12px"
  inset: "16px"
  panel: "20px"
  reading: "24px"
  message: "28px"
components:
  button-primary:
    backgroundColor: "{colors.action-graphite}"
    textColor: "{colors.reading-white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 11px"
  button-primary-hover:
    backgroundColor: "{colors.action-graphite-hover}"
  button-secondary:
    backgroundColor: "{colors.reading-white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 11px"
  input-search:
    backgroundColor: "{colors.reading-white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.inset}"
    padding: "0 9px"
    height: "34px"
  activity-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.activity}"
    padding: "12px 12px 13px"
  activity-row-selected:
    backgroundColor: "{colors.reading-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.activity}"
  detail-tabs:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    height: "40px"
    padding: "0 24px"
  filter-chip:
    backgroundColor: "#e7ebf0"
    textColor: "#394b5e"
    typography: "{typography.label}"
    rounded: "4px"
    padding: "4px 7px"
  user-message:
    backgroundColor: "#f4f6f8"
    textColor: "#333b46"
    typography: "{typography.user-message}"
    rounded: "{rounded.inset}"
    padding: "12px 16px"
  checkpoint-scope:
    backgroundColor: "{colors.evidence-subtle}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.inset}"
    padding: "16px 18px"
---

# Design System: ColloSys replacement workbench sample

## Overview

**Creative North Star: "Work and its evidence"**

This is the implemented replacement sample for a professional desktop collaboration workbench. It is isolated at /design-lab and awaits the user's visual evaluation. It is not an approved product-wide system, does not authorize migration of other surfaces, and does not refresh or validate the rejected design-sample/DESIGN.md.

A cool activity index supports a white reading surface, with graphite typography and the supplied copper peanut mark. The composition follows work into its conversation, file evidence and saved states. The user's professional-workbench brief overrides direction seed 30c8b911; the seed is provenance, not an active design constraint.

This record describes owned source, not an independently observed rendered result. PRODUCT.md supplies product boundaries. Typecheck, build, browser and native-window verification belong to the parent implementation review; no pass is asserted here. Synthetic messages, replay, checkpoint scope and restore rehearsal do not establish production capture, authorization, backup or recovery.

**Key Characteristics:**

- One project bar, an activity-only index and a dominant reader.
- The actual Codecast ConversationHeaderBar frame with owned title, metadata and actions.
- Contextual file and storage evidence; checkpoint history belongs to the selected work.
- Google Sans with Chinese system fallbacks, one Phosphor icon family and the supplied artwork.
- Flat structural surfaces, short purposeful disclosure and explicit ownership boundaries.

Source authority: [PRODUCT.md](../../../PRODUCT.md), [design-lab.css](../../../integrations/codecast/web/design-lab.css), [DesignLab.tsx](../../../integrations/codecast/web/DesignLab.tsx), [DesignIcons.tsx](../../../integrations/codecast/web/DesignIcons.tsx), [DesignScenario.ts](../../../integrations/codecast/web/DesignScenario.ts) and [DesignReference.tsx](../../../integrations/codecast/web/DesignReference.tsx). These are the owned inputs; generated fork files are not an editing authority.

Provenance remains in [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md). Codecast is MIT, pinned to commit 5dfb04f516122fe4f59a61137219b5a4e2e1f9f8; this sample composes its actual ConversationHeaderBar, FilePatchDiff and shouldFollowStreaming policy. The comparison route mounts the actual ConversationView with the same fixture and no composer. Radix, React Router and resizable panels retain their own attribution. Phosphor React 2.1.10 is MIT, copyright 2020 Phosphor Icons; sidecar SVG excerpts retain that attribution. Google Sans retains its SIL OFL and trademark notice. The supplied peanut image is viewport-cropped from the unchanged original image bytes, with no ownership claim or implied endorsement. The upstream mirror stays immutable.

## Colors

Cool neutrals organize the workbench; restrained functional colors communicate evidence and interaction.

### Primary

- **Action Graphite:** the confirmation action; its hover variant adds tonal feedback without changing geometry.
- **Copper artwork:** the supplied peanut mark provides identity. Its pixels are the source of color truth; no numeric brand swatch is inferred from them. The declared copper CSS variables are currently unused and are deliberately absent from the normative palette.

### Neutral

- **Reading White:** the reader, selected activity and raised controls.
- **Index Cool:** the activity index, separating navigation from reading.
- **Evidence Subtle:** contextual evidence, scope disclosure and restore metadata.
- **Ink / Muted:** primary content versus supporting labels and facts.
- **Divider:** fine structural separation.
- **Hover:** quiet feedback for icon controls, files and menu items.
- **Feedback Graphite:** floating unread and toast surfaces.

Saved Green and Failure Red belong to file/storage semantics. Focus Blue identifies keyboard focus. Progress also uses distinct source colors for complete, running and pending states; these are not an expanded brand-accent system. The diff renderer has explicit light addition/deletion surfaces so the original app theme does not erase contrast.

**The Separate Facts Rule.** Work progress, delivery health, source-device capture and off-machine backup remain distinct labels. Color supplements their text and icon; a saved file is not a synchronization or backup claim.

The sidecar's eight-step tonal strips are generated display aids only. They are not source-defined production tokens or an approved expanded palette.

## Typography

**UI and body font:** self-hosted Google Sans under the local family name Collo Google Sans; Microsoft YaHei UI and PingFang SC supply Chinese glyphs, followed by sans-serif.

**Code font:** Consolas, SFMono-Regular, monospace.

**Character:** one understated sans-serif family carries interface and reading roles. Weight, spacing and line height establish hierarchy. Chinese uses its declared system fallback; it is not described as Google Sans glyph coverage.

### Hierarchy

- **Title:** the selected-work title and checkpoint heading. Context titles wrap rather than truncate.
- **Body:** assistant prose, with an open reading line height.
- **User message:** a slightly smaller role inside a pale inset.
- **UI:** the base workbench and activity title size. Activity titles use medium weight and a taller line height; selected titles use semibold.
- **Label:** controls, state labels and evidence. Timestamps and subordinate paths may use a smaller source size; that supporting treatment is not a universal minimum-size rule.
- **Code:** paths, checkpoint identifiers and code blocks. Timestamps use tabular numerals.
- **Modal heading:** a larger local heading for confirmation context. There is no marketing display style.

Google Sans declares variable weights (400–700), optical sizing and disabled synthetic styles. Source values, not an inferred geometric scale ratio, define this modest hierarchy.

**The Reading Before Display Rule.** The hierarchy is compact and role-based. Preserve readable Chinese and English body text and wrapping titles; there is no promotional display tier.

## Layout

The sample fills the available app viewport. Its single project bar is (52px) high. Beneath it, a resizable activity index starts at (23%) and the reader at (77%); desktop index bounds are a minimum (280px) and maximum (45%), while the reader has a (380px) minimum. The split persists locally in the sample. These values describe this surface, not a required global app layout.

The native ConversationHeaderBar frame holds the selection title, metadata and compact actions. Its scoped header has a (72px) minimum height and can grow for wrapping. Detail tabs are immediately beneath it. The transcript has a (780px) maximum width with (24px 28px 48px) padding and a (28px) gap between messages. The contextual evidence dock is (256px) wide. Files, identifiers, capture facts and history remain related to the selected work.

The file-change view has its own (235px) file index and flexible diff reader. Checkpoint history uses a centered content region with a (1000px) maximum width. These selected-work views do not add another global sidebar.

**The Context Follows Work Rule.** Files, delivery facts and checkpoint history describe the selected activity. They do not become a second global navigation hierarchy.

### Responsive behavior

- At a reader-container width of (850px) or below, the evidence dock becomes (224px), transcript padding reduces, and the file index becomes (205px).
- At a reader-container width of (760px) or below, the side evidence dock gives way to the compact “资料与状态” disclosure. Its expanded region is bounded to (55%) of available height. The file index moves above the diff and becomes horizontally scrollable.
- At a viewport width of (800px) or below, list and detail become separate views. Selecting an activity opens its detail; the header control returns to the list.
- At a viewport width of (520px) or below, project context is removed from the top bar and transcript/dialog padding contracts.
- Titles and detailed paths wrap. Compact file rows use ellipsis with full-path context retained elsewhere. Do not treat one desktop screenshot as narrow-window validation.

Spacing is dense around controls and open around prose. The recurring scale in the frontmatter records reused steps; one-off offsets and dimensions stay component details.

## Elevation & Depth

Structural surfaces are flat. Cool tonal layers and fine dividers distinguish the activity index, reader and evidence. Soft shadows are reserved for elements that sit above that structure.

### Shadow Vocabulary

- **Menu:** (0 8px 28px #25314018), for popover menus.
- **Dialog:** (0 16px 64px #19253b30), above a translucent backdrop.
- **Unread feedback:** (0 4px 12px #25314022), a small floating return-to-latest action.
- **Toast feedback:** (0 4px 20px #25314022), a temporary status message.

These values are component-owned in CSS and recorded as extensions in the sidecar; they are not frontmatter primitives.

**The Flat Structure Rule.** The index, transcript and evidence dock separate through surface tone and fine dividers. Floating feedback, menus and confirmation dialogs may use soft shadows.

## Shapes

Controls use modest corners; inset messages and evidence use slightly softer corners. Activity rows, menus and confirmation dialogs increase rounding by role. A selected activity is a white inset with a fine border, not an elevated dashboard tile. Dividers generally remain (1px). Small circular checkpoint markers provide continuity through the history list.

Phosphor regular icons are the sole interface family, normally (14–18px) with larger local empty/dialog symbols. Decorative icons are hidden from assistive technology; icon buttons have names and titles. Member initials are identity text, not invented substitute icons.

The supplied peanut artwork is shown through its existing SVG viewport crop. Its source image, product name and attribution remain intact.

## Components

### Buttons

Restrained controls with clear action ownership. The secondary button uses a fine border, compact padding, a (32px) minimum height and subtle background hover. The primary variant appears on explicit own-workspace confirmation. Disabled controls lower opacity and show the unavailable cursor. Standard color transitions last (150ms) with the source easing curve.

Keyboard focus uses a (2px) Focus Blue outline with (2px) offset. Icon buttons are compact square controls (29px), with hover, pressed and open-state backgrounds. Text actions stay visually lighter than confirmation.

### Search and filters

The search field is a compact white inset with a (34px) height. A focus-within border and outline mark its active state. Ctrl/Command+K returns to and focuses it in the sample. Active member filtering is a removable text chip. Activity scope uses understated text navigation; the active scope gains a thin underline and stronger text.

### Activity selection

Rows expose person, attribution, time, work title, progress, transport trouble when present and file count. Selection uses a white surface and fine border; hover stays neutral. The optional compact density reduces vertical padding without introducing a second visual language. Loading, empty and failed-source states are explicit fixture states.

### Reader and evidence

Conversation messages retain role, speaker and time. User text uses the inset treatment; assistant Markdown reads on white with code blocks and readable line height. The sample stores scroll offset and follow state per activity in memory and preserves selected file state during sample navigation. New fixture replies show an unread affordance when the reader is away from the bottom. This implementation is not a claim of durable production session anchors.

Evidence lists actual fixture paths and separates work details, source-device save state, shared delivery and lack of off-machine backup. File changes use the actual upstream diff renderer; plaintext fixture messages are not executable Agent sessions. Manual-edit fixtures show a truthful empty conversation state while retaining files and checkpoints.

### Checkpoint scope and restore

**The Ownership Before Action Rule.** A teammate checkpoint reveals read-only file scope inline. An own-workspace restore opens a preview and explicit confirmation dialog. Viewing a teammate's history never supplies a restore action for the viewer's directory.

A teammate scope toggle sets expanded/control semantics and reveals a panel beneath the same checkpoint. The panel names the source device, checkpoint, file count and file paths. Its successor moves with the expansion. Hidden scope is inert and hidden from accessibility traversal. The grid disclosure transitions from (0fr) to (1fr) in (180ms); opacity transitions in (140ms), and the chevron rotates in (180ms), using the same easing curve.

Own-workspace recovery remains a Radix dialog. It shows checkpoint, capture time, source, target directory, storage facts and affected files, then requires explicit acknowledgement. The sample can simulate a stale preview, which disables confirmation until preview is renewed. Its confirmation only completes a rehearsal and writes no files. Actual backup-before-restore and stale-preview rejection remain product requirements, not guarantees established by this fixture.

The OS reduced-motion preference and the sample setting disable animations, transitions and smooth scrolling on sample surfaces and their descendants, including portaled menus, overlay and dialog. The manual setting reaches portaled surfaces through the active sample route's reduced-motion state. The sidecar preserves the ordinary source motion values together with this override; its existence is not a runtime verification claim.

### Reference mode and sample boundary

The labeled comparison uses the actual upstream ConversationView with identical synthetic messages, a read-only guest mode and no composer. It preserves the upstream reader theme. Sample search, bookmarks, display settings, loading/error controls and reply replay are inspection facilities; they are not claims that equivalent production features or account persistence are complete. No Agent execution, remote writes or real recovery happens in these fixtures.

## Do's and Don'ts

### Do:

- **Do** keep this record local to the replacement sample until the user evaluates it.
- **Do** keep activity selection, selected file and reading position coherent while changing views.
- **Do** show progress and delivery as separate facts, and distinguish source-device capture from off-machine backup.
- **Do** use Google Sans for supported glyphs, the declared Chinese fallbacks and Phosphor regular icons.
- **Do** keep teammate file scope attached to its checkpoint and own restore behind preview and confirmation.
- **Do** expose keyboard focus, text equivalents for status, wrapping full paths and reduced-motion behavior.

### Don't:

- **Don't** treat this sample or its synthetic fixtures as an approved whole-product migration or a proven backend workflow.
- **Don't** restore another member's files into the viewer's independent workspace.
- **Don't** infer Agent attribution from proximity, or label manual saved edits as an Agent conversation.
- **Don't** turn checkpoint history into a global destination detached from the selected work.
- **Don't** recolor or redraw the supplied peanut artwork, replace the consistent icon family with text glyphs, or import marketing-page hierarchy.
- **Don't** promote unused copper CSS declarations, sample test controls or source-only verification assumptions into reusable product rules.

