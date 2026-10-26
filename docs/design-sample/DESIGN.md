---
name: "ColloSys workbench — PROVISIONAL SAMPLE"
description: "Historical record of a visually rejected sample; do not use as an approved design system or migration baseline."
colors:
  chalk: "#fcfcfa"
  shell: "#f3f3ef"
  subtle: "#f7f7f3"
  divider: "#e4e5df"
  ink: "#272c29"
  muted: "#626b5d"
  walnut: "#865534"
  walnut-wash: "#f0e9df"
  white: "#fff"
typography:
  headline:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "23px"
    fontWeight: 550
    lineHeight: 1.55
    letterSpacing: "-0.5px"
  title:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.4px"
  body:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.95
  body-compact:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.95
  label:
    fontFamily: "'Collo Google Sans', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "'JetBrains Mono', Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.8
rounded:
  small: "4px"
  control: "6px"
  row: "7px"
  activity: "8px"
  panel: "9px"
spacing:
  tight: "4px"
  control-gap: "8px"
  reading-gap: "12px"
  section: "20px"
  inset: "24px"
components:
  button-primary:
    backgroundColor: "#84603f"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-primary-hover:
    backgroundColor: "#6f4d30"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "#4e5945"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-secondary-hover:
    backgroundColor: "#f0f2e8"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "7px 0"
  button-text-hover:
    textColor: "{colors.walnut}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    height: "28px"
    width: "28px"
    padding: "0"
  button-icon-selected:
    backgroundColor: "{colors.walnut-wash}"
    textColor: "{colors.walnut}"
  search:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "8px 9px"
  navigation:
    backgroundColor: "transparent"
    textColor: "#60685f"
    rounded: "{rounded.row}"
    padding: "10px 12px"
  navigation-selected:
    backgroundColor: "#e6e8e0"
    textColor: "#2c392c"
  filter-chip:
    backgroundColor: "{colors.walnut-wash}"
    textColor: "{colors.walnut}"
    rounded: "{rounded.small}"
    padding: "4px 7px"
  activity:
    backgroundColor: "transparent"
    rounded: "{rounded.activity}"
    padding: "15px 13px 14px"
  activity-selected:
    backgroundColor: "#eeeee6"
  user-message:
    backgroundColor: "#f3f4ee"
    textColor: "#4e5748"
    padding: "14px 18px"
  evidence-footer:
    backgroundColor: "#fafaf5"
    height: "67px"
    padding: "0 30px"
---

# Design System: ColloSys workbench — provisional sample

## Overview

**Creative North Star: "A durable small-team reading desk"**

PROVISIONAL SAMPLE RECORD — pending user selection. This document describes only the single original workbench sample at /design-lab. Its tokens are authoritative for reproducing this sample, not approved global ColloSys rules. Google Sans, the supplied peanut artwork and a unified icon family are user choices; the current implementation selects Phosphor. Whole-product adoption remains undecided.

The sample presents a small team's shared work as a durable reading desk: chalk surfaces, compact navigation, a resizable activity index and a wider reader. Quiet walnut accents identify focused actions; restrained olive neutrals separate surfaces. The implemented selected activity is a neutral tint, not a walnut-filled card. Members lead to work, captured context, file differences and checkpoint evidence.

This is a source-grounded record of the current owned integration files, including their final CSS overrides. It does not certify final visual quality, contrast compliance or production integration. Earlier screenshots precede legibility and navigation fixes; final screenshot review is recorded separately. The scene is synthetic, and restore rehearsal never writes files. Sidecar tonal ramps are generated preview aids, not implemented palette steps.

Evidence: [owned stylesheet](../../integrations/codecast/web/design-lab.css), [workbench component](../../integrations/codecast/web/DesignLab.tsx), [icon and artwork mapping](../../integrations/codecast/web/DesignIcons.tsx), [synthetic scenario](../../integrations/codecast/web/DesignScenario.ts), [product commitments](../../PRODUCT.md) and [sample scope](README.md). No root design specification is changed.

**Key Characteristics:**

- Google Sans for interface and reading, system Chinese sans-serif fallback, monospace only for code and file paths.
- Warm flat surfaces with bounded row selection and thin structural dividers.
- Member-first scanning, generous message reading and persistent checkpoint provenance.
- Phosphor regular icons, with the current-project folder using Phosphor duotone.
- Short state transitions that respect both system and sample reduced-motion settings.

## Colors

Warm chalk and olive-leaning neutrals form the working surfaces. Walnut comes from the supplied artwork's material character and marks focus, filters and explicit actions. There is no second decorative accent system.

### Primary

- **Walnut** provides keyboard focus, selected icon actions and active filters.
- **Walnut wash** provides the pale selected-action background. The primary confirmation button uses its own observed walnut variant; it does not redefine the shared accent.
- Status hues are functional: completion is green, running is ochre, pending is muted blue, offline is neutral and failure is red-brown. Text and a Phosphor icon accompany each status.

### Neutral

- **Chalk** is the main reading and dialog canvas.
- **Shell** distinguishes the project rail; **subtle** provides the local alternate surface binding used by reused content.
- **Divider** separates the rail, tabs, lists and evidence footer without heavy framing.
- **Ink** is the main text color; **muted** carries operational metadata.
- **White** is used on control surfaces and as the foreground of filled actions.
- Selected activity rows use a quiet olive-neutral wash with a thin boundary. This is the implemented result of the direction contract, even though its short OWN-WORLD line says “walnut selection.”

**The Evidence Rule.** Preserve the distinction between locally saved, source-device saved, shared and off-machine backed up. Status text and icons carry the meaning; color supports it.

The scoped stylesheet also supplies a light syntax palette and addition/deletion surface overrides to the reused diff renderer. These are code-reading semantics, not new brand accents. Their current values remain in source rather than becoming a second global palette here.

## Typography

**Interface and reading font:** self-hosted Google Sans, declared as “Collo Google Sans.” Chinese falls back to Microsoft YaHei UI or PingFang SC; the record does not claim Google Sans supplies Chinese glyphs.

**Code font:** JetBrains Mono, then Consolas and the platform monospace fallback.

The hierarchy is compact and task-oriented, with softer reading text and stronger titles. It is an observed set of roles, not a mathematical type scale. There is no marketing display role.

- **Headline:** the selected work title, reducing from its frontmatter desktop size to (21 px) at the first compact breakpoint and (20 px) at the narrow breakpoint.
- **Title:** the activity-index heading. The dialog heading has its own (21 px), (550) weight treatment.
- **Body:** assistant context, using the final stylesheet override. User context uses **body-compact**. Message headings, metadata and controls use the smaller label role.
- **Activity title and navigation:** (13 px), with activity titles at (550) weight and (1.7) line height. The compact rail deliberately hides visible text at narrow widths.
- **Code:** inline code, blocks, paths and counts stay monospace. Diff rendering is supplied by the existing file-patch component; its entire internal type system is not reconstructed here.

**The Reading Scale Rule.** Keep operational metadata at or above the implemented 11 px floor. Preserve the current 13 px user-message and 14 px assistant-message treatments when reproducing this sample; this is not a substitute for a final legibility audit.

The brand's compact secondary line and the settings font specimen are not generalized typography roles.

## Layout

This section records one screen composition, not an approved layout for future product pages.

The desktop sample has a fixed project rail (206 px), a resizable activity index and a reader. The index begins at (30%) of the remaining stage, has a (270 px) minimum and (45%) maximum; the reader has a (380 px) minimum. A thin divider has a wider pointer hit area (8 px). Saved panel layout is accepted only within the component's validation bounds.

The top bar is (59 px) high, with a (29 px) status bar below the stage. The reader has a fixed evidence footer, while the index and context scroll independently. Context is capped at (860 px), with desktop horizontal insets (37 px); these measurements describe the sample, not a universal content width. Repeated small spacing steps appear in the frontmatter, but the source also uses optical adjustments rather than enforcing one rigid grid.

Responsive behavior is explicit:

- At (1300 px) and below, the rail becomes (184 px), reader insets reduce and the search shortcut hint is hidden.
- At (1050 px) and below, the rail becomes (162 px), secondary rail decoration is removed and reader insets reduce again.
- At (800 px) and below, the rail becomes (58 px) and the top bar becomes (49 px). Index and detail switch as separate views; selecting an activity opens the reader, and its list control returns to the index. They do not remain squeezed into two unusable columns.
- Long titles wrap; a selected full file path wraps in the reader. List-file labels may truncate, with their full path retained in the source title attribute.

Selection, the active view and selected file are represented in the sample URL. Reading position and file selection are retained per activity during navigation. The sample does not establish persistence across application restarts for all these states.

## Elevation & Depth

The primary structure is flat: background tones, fine lines and spacing distinguish the rail, list and reader. Temporary layers carry soft shadows. There are no hard offset shadows in the implementation.

### Shadow Vocabulary

- **Menu:** `0 9px 30px #2d372219`, separating a transient menu from the work surface.
- **Dialog:** `0 18px 65px #1a261f30`, paired with a translucent overlay.
- **Unread control:** `0 5px 16px #33402c26`, floating above an unchanged reading position.
- **Toast:** `0 5px 18px #28372125`, for temporary outcome feedback.
- **Search focus:** `0 0 0 2px #86553414`, a focus halo, not structural elevation.

**The Surface Rule.** Keep navigation, activity rows and the reading canvas flat. Reserve elevation for temporary menus, dialogs and floating feedback already present in the sample.

Button color changes use (140 ms); detail arrival (180 ms); menus (140 ms); overlays (160 ms); dialogs (200 ms). Motion uses the shared easing in the sidecar. Both the system reduced-motion preference and the sample setting remove transitions and animation. The status spinner is functional ongoing feedback, not ornamental animation.

## Shapes

Controls use restrained rounded corners, with the repeated sizes extracted above. The activity row is softly bounded; the index and reader themselves remain rectangular regions. User messages have a squared upper-left corner with the remaining corners rounded (9 px), while assistant replies read directly on the canvas. This difference identifies speaker structure without enclosing every message in a card.

Avatars are rounded squares, with a smaller form in rows. Menus use gently rounded containers; the dialog's larger corner (13 px) belongs to that specific temporary surface. Fine borders, not thick outlines, organize resting content. Keyboard focus is a separate (2 px) walnut outline with (3 px) offset.

The supplied peanut image is retained as source bytes inside a cropped SVG viewport. The current mark is displayed at (37 × 31 px), uses viewport `470 440 245 160`, multiply blending and brightness adjustment. This is an implementation record of asset framing, not approval of a new logo or a reusable rule for processing other artwork. ColloSys remains the product name.

## Components

### Buttons

Quiet controls let the work carry visual weight.

- **Primary:** filled walnut confirmation, with the component-specific values in the frontmatter; darkens on hover.
- **Secondary:** white fill, a fine olive-neutral border, and pale hover fill.
- **Text:** a plain muted action, changing to walnut on hover.
- **Icon:** compact square control with accessible label and title; active toggles use walnut wash. Ordinary icons use Phosphor regular.
- **Focus and disabled:** shared visible focus outline. Disabled actions use reduced opacity (0.45) and an unavailable cursor. The primary restore rehearsal stays disabled until consent and becomes unavailable for a stale preview.

### Chips

The implemented chip is an active member-filter removal control. It uses walnut text on walnut wash, a small corner and an inline close icon. It is not a generic decorative tag system. No independent chip hover treatment exists in source; the shared focus treatment remains.

### Cards / Containers

The recurring activity row is a button, not a general content card. It groups person and source, work title, short description, time, status and file count. Hover changes its background; selected state adds a quiet fill and fine border. The “compact rows” setting reduces vertical padding to (10 px) and the footer gap.

Messages, file rows and checkpoint history have different structures. This distinction is recorded without declaring a global ban on cards.

### Inputs / Fields

The search field combines a Phosphor search icon, plain input and keyboard hint within a thin border. Focus shifts the border and adds the documented halo. The input has no second inner outline. Search matches member, activity, source and file text in the synthetic scenario. Checkbox controls use the walnut accent.

### Navigation

The rail uses a flat vertical button list with an icon, label and optional count. Active navigation has a restrained neutral fill and stronger text. The narrow view collapses visible labels but retains the icon structure.

Reader tabs use an understated bottom rule for the active view. Radix provides tab, menu and dialog interaction behavior. Resizable panels supply keyboard and pointer resizing. This visual record does not replace their behavior contracts.

### Context reader and file differences

The reader places compact speaker/time headings above message content. User context sits on a soft surface; assistant context uses continuous reading space. Markdown structure, code and the related-files action keep the captured work navigable. New content does not force someone reading history to the bottom; an explicit unread control restores following.

Actual fixture patches render through the existing file-diff component, with line numbers and calculated added/removed counts. The sample shows source-linked context; it does not establish real Agent capture integration.

### Checkpoint evidence and preview

The fixed reader footer keeps device ownership and “no off-machine backup” visible beside the checkpoint action. Checkpoint history uses a simple vertical line, title, time, identifier and separate saved/backup states.

Preview is a modal with source, directory, affected files and the boundary explanation. Teammate checkpoints are inspectable only. The current member's fixture exposes consent, a stale-preview rehearsal and explicit confirmation. This describes the sample's safety expression; it does not certify a production restore.

The sidecar contains ten source-derived, standalone visual snippets: the four button variants, search, navigation, filter chip, activity row, user message and evidence footer. React behavior is intentionally not simulated in these HTML/CSS previews. Inline icon paths come from the installed Phosphor package; font availability follows the host, with the recorded fallback stack.

## Do's and Don'ts

### Do:

- **Do** keep this record scoped to the single provisional sample until the user selects a direction.
- **Do** use the supplied artwork, Google Sans and the existing Phosphor mapping when extending this sample.
- **Do** preserve visible text for completion, pending, offline, failure and backup states.
- **Do** retain the explicit index/detail switch at narrow widths and the reader's per-activity position.
- **Do** show teammate checkpoint provenance and allow only source-member recovery rehearsal.
- **Do** preserve focus-visible treatment and both reduced-motion controls.

### Don't:

- **Don't** migrate the whole product or treat these sample measurements as globally approved.
- **Don't** infer Agent attribution from a manual edit or imply that shared differences are complete remote backups.
- **Don't** mix icon families or replace the supplied peanut image with a redrawn mark.
- **Don't** introduce marketing layouts or image-generated compositions into this workbench record.
- **Don't** treat synthetic interactions or pre-fix screenshots as proof of production integration or final visual quality.

**Not canonized:** one-off brand subtitle tracking, the settings font specimen, asset brightness correction, dense icon hit areas and unverified visual/accessibility outcomes are not promoted to global design rules. Final screenshot review and user selection remain separate requirements.

