---
name: ColloSys A/B Workbench Preview
description: Provisional visual record of the isolated 2026-10-26 candidates; not an approved production design.
colors:
  canvas: "#f6f7f9"
  surface: "#fff"
  surface-subtle: "#f8f9fb"
  surface-hover: "#edf0f5"
  ink: "#202630"
  muted: "#596575"
  line: "#dce1e8"
  line-strong: "#a3adbb"
  selected: "#315bd6"
  selected-soft: "#eef3ff"
  positive: "#24643f"
  positive-soft: "#edf7f0"
  danger: "#a3323a"
  danger-soft: "#fff0f0"
  attention: "#85540d"
  attention-soft: "#fff6e8"
typography:
  headline:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "26px"
    fontWeight: 650
    lineHeight: "34px"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "22px"
  body:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "12px"
    fontWeight: 550
    lineHeight: "20px"
  code:
    fontFamily: "Consolas, 'SFMono-Regular', monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "21px"
rounded:
  sm: "4px"
  md: "7px"
  lg: "12px"
spacing:
  compact: "4px"
  control-gap: "8px"
  item-gap: "12px"
  inset: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 11px"
  navigation:
    textColor: "{colors.muted}"
    backgroundColor: "{colors.surface}"
  status-attention:
    textColor: "{colors.attention}"
  work-selected:
    backgroundColor: "{colors.selected-soft}"
    textColor: "{colors.ink}"
    padding: "8px 16px 11px"
  context-container:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "15px"
---

# Design System: ColloSys A/B Workbench Preview

## Overview

**Creative North Star: "Work and its evidence"**

This is a descriptive record of the finished isolated A/B browser fixture in `design-explorations/workbench-20261026`, awaiting the user's visual selection. The phrase above summarizes the implemented contract; it is not a user-approved brand metaphor. These tokens govern this preview only. Neither candidate is an approved global style or a production migration.

Neutral work surfaces, dark action controls and blue selection organize tasks and their supporting records. A exposes the complete filtered queue above the selected reader and diff. B puts a horizontal work chooser above a reader and evidence panel that fill the remaining height. They deliberately share visual primitives so the comparison concerns how work is organized.

Google Sans, the supplied peanut graphic and one consistent icon family remain confirmed commitments. The preview uses Phosphor. Its synthetic data, comments, drafts and state simulations are not evidence of native-window behavior, backend integration or real restoration. The independent desktop product requirement remains intact.

**Key Characteristics:**
- Shared typography and state language across two different spatial candidates.
- Reading surfaces and contextual evidence with restrained boundaries.
- Visible selection, labeled statuses and explicit preview-only actions.

## Colors

The palette combines cool neutral surfaces with selection blue and semantic state colors. Frontmatter values are extracted from the preview stylesheet.

### Primary
- **Selection blue** (`selected`, `selected-soft`): focus outlines, links, selected queue surfaces and the selected work-strip underline.
- **Action ink** (`ink`): primary actions and primary text; emphasis does not make every control blue.

### Secondary
- **Positive green** (`positive`, `positive-soft`): completion, viewed state and additions in file differences.
- **Attention amber** (`attention`, `attention-soft`): review and waiting states, with a label explaining the reason.
- **Problem red** (`danger`, `danger-soft`): offline status and removed lines, distinguished by labels or diff symbols.

### Neutral
- **Canvas and paper** (`canvas`, `surface`, `surface-subtle`): application ground, reading area and evidence/supporting surfaces.
- **Hover surface** (`surface-hover`): transient control feedback.
- **Secondary ink** (`muted`): supporting descriptions and metadata.
- **Dividers** (`line`, `line-strong`): region boundaries and input/control edges.

**The Labeled State Rule.** A state color accompanies an icon, label or diff symbol; color alone does not establish task progress, delivery or backup status.

## Typography

**UI Font:** locally bundled Google Sans, exposed as `Collo Google Sans`, with Chinese system fallbacks. **Code Font:** Consolas, then SFMono-Regular and monospace. The supplied graphic stays the logo; text initials identify fixture members, not interface actions.

The hierarchy is compact and functional: page headlines, task titles, readable messages, then control labels. There is no separate display face. A's base page headline uses the frontmatter headline role; B uses a smaller headline (24px/32px). Dialog titles use 20px/28px and weight 650. Messages retain a maximum line length (72ch), with relaxed leading in A (1.8) and B (24px). File differences use monospace; timestamps use tabular numerals.

**The Reading Priority Rule.** Preserve the message and title hierarchy when adapting density. The preview's tiny ancillary labels are not a target body-text size.

## Layout

Both candidates have a preview control bar above a shared project bar. The application uses viewport height with independently scrollable reading and diff regions where needed. The preview has a minimum width (360px); smaller screens are outside its current contract.

- **A — queue first:** the complete filtered queue precedes the selected detail, rather than inserting detail between rows. The page is centered with a maximum width (1544px) and fluid side padding (`clamp(24px, 4vw, 64px)`). Desktop rows have task, member, reason and update columns. The detail uses reader/evidence columns (`minmax(440px, 1.18fr) minmax(360px, 1fr)`) and a bounded internal reading height.
- **B — current work first:** a horizontally scrolling chooser uses fixed-width work options (270px at desktop, 250px below 800px). The selected work fills the remaining vertical space. Reader/evidence columns use `minmax(480px, 1.55fr) minmax(360px, 1fr)`; hiding evidence expands the reader. No full activity sidebar is present.
- **Responsive:** at 1200px density and column widths tighten; at 1050px and below, explicit Record/Changes controls replace simultaneous reader/evidence panels. At 800px the queue omits update times. At 600px it collapses to task/reason columns and the project bar reduces navigation. At 1700px and above A gains vertical breathing room and B gives proportionally more space to reading.

The recurring spacing steps are recorded in frontmatter. Component-specific measurements are evidence of these candidates, not a commitment to standardize every future page around their composition.

## Elevation & Depth

Main work surfaces are flat, divided by lines and tonal changes. Selected queue rows use an inset edge, not a floating card. Menus, toasts and the new-record prompt share a restrained floating shadow; dialogs use the deeper shadow and a translucent scrim. Exact shadow, layer and motion values live in the sidecar.

**The Contextual Depth Rule.** Elevation identifies transient layers; it does not separate every task or message into a raised card.

## Shapes

Small corners belong to icon controls and file choices; medium corners belong to buttons, fields and context blocks; large corners belong to dialogs. Queue and reading regions retain straight structural edges. The new-record prompt is the observed compact pill exception, not a general instruction to round all containers.

## Components

**Buttons.** Primary actions use action ink on paper, secondary controls use a thin boundary, and subtle actions remove the surrounding box. Standard buttons have a minimum height (34px). Hover changes surface or border; disabled controls mute both text and surface. Keyboard focus uses a blue outline (2px) with an offset (3px). Icon-only controls have accessible names and tooltips; Phosphor supplies the action symbols.

**Fields and composer.** Inputs have a strong neutral boundary and medium corners. The composer has a distinct focus-within boundary and outline; its disabled send control does not resemble an available action. Textareas permit vertical resizing. Search and form fields retain visible labels or accessible names.

**Navigation and selection.** Project navigation and reader tabs use an underline for the active section. File choices use a subtle selected surface. A's selected row has a blue-tinted background and defined edge; B's selected option has a paper surface and blue underline. Selection remains distinguishable from hover.

**Status and context.** Statuses use text and Phosphor icons without pill backgrounds by default. Supporting context blocks use a subtle surface and no shadow. Request, response, execution disclosures and source facts remain separate reading units. File differences preserve line numbers, signs and distinct addition/removal surfaces.

**Transient layers and states.** Radix menus, dialogs, tabs and tooltips provide the preview's interaction structures. Opening and closing use short opacity/position changes; panel appearance is bounded and functional. Reduced-motion preference disables animation and transition. Empty, loading, error and denied states are explicit fixture scenarios. New-record simulation offers a prompt instead of forcing a reading-position jump. Comments, created tasks and handoff drafts remain in preview memory and reset on refresh.

## Do's and Don'ts

### Do:
- **Do** keep Google Sans, the supplied peanut graphic and Phosphor consistent within this preview.
- **Do** compare A and B using the same synthetic information and action meanings.
- **Do** show selection, keyboard focus and state through more than a color change.
- **Do** keep task progress, attribution, delivery and storage facts distinguishable in visual hierarchy.
- **Do** treat this document as provisional until the user selects a visual direction.

### Don't:
- **Don't** promote these tokens or layouts into production routes before the selection gate.
- **Don't** use the previously rejected warm reading-desk sample as an approved visual foundation.
- **Don't** present a browser fixture as native desktop, connected collaboration or real recovery verification.
- **Don't** infer Agent attribution or backup completion from proximity, color or a completed task.

Not canonized: the preview's 9–10px ancillary metadata and truncated work-strip titles are implementation limitations to reassess, not reusable legibility standards. The preview-only A/B switch styling is also excluded from the product component vocabulary.
