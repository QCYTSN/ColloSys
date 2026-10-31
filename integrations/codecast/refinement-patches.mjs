import { readFileSync } from 'node:fs';
import path from 'node:path';
const base = 'packages/web/';
const read = (file) =>
  readFileSync(
    new URL(`../../third_party/codecast/upstream/${base}${file}`, import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
const patch = (file, before, after) => ({ file: base + file, before, after });
const settings = 'components/settings/SettingsModal.tsx';
const dashboard = 'components/DashboardLayout.tsx';
const detail = 'components/DetailSplitLayout.tsx';
const oldSettings = read(settings);
const oldNav = oldSettings.slice(
  oldSettings.indexOf('        <nav className='),
  oldSettings.indexOf('        <div className="flex-1 min-w-0 flex flex-col">'),
);
const extraIcons = [
  'components/SegmentedToggle.tsx',
  'components/initiatives/IntentHeader.tsx',
  'components/settings/ui.tsx',
  'components/GlobalSearch.tsx',
  'components/TabBar.tsx',
].flatMap((file) =>
  [...read(file).matchAll(/import\s*\{[^}]+\}\s*from\s*"lucide-react";/gs)].map((match) =>
    patch(
      file,
      match[0],
      match[0].replace(
        '"lucide-react"',
        JSON.stringify(path.posix.relative(path.posix.dirname(file), 'collo/ProductIcons')),
      ),
    ),
  ),
);
export const refinementPatches = [
  patch(
    'components/initiatives/IntentHeader.tsx',
    '<span className="inline-flex items-center gap-1.5 h-6" data-intent-target="editing"',
    '<span className="collo-intent-date-editor" data-intent-target="editing"',
  ),
  patch(
    'components/initiatives/IntentHeader.tsx',
    'className="text-[11.5px] bg-transparent outline-none tabular-nums border-b"',
    'className="collo-intent-date-input"',
  ),
  patch(
    'components/initiatives/IntentHeader.tsx',
    '<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); onClear(); }} className="text-[10.5px] transition-colors hover:text-sol-red" style={{ color: "var(--sol-text-dim)" }} data-intent-target-clear>\n          Clear\n        </button>',
    '<ListTrigger onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); onClear(); }} data-intent-target-clear>\n          Clear\n        </ListTrigger>',
  ),
  patch(
    'components/initiatives/IntentHeader.tsx',
    '"use client";',
    '"use client";\nimport { ListTrigger } from "../../collo/ProductControlTriggers";',
  ),
  patch(
    'components/initiatives/IntentHeader.tsx',
    '<button type="button" className="inline-flex items-center gap-1.5 -mx-1 px-1 h-6 rounded-md transition-colors hover:bg-sol-bg-highlight/70" {...data}>{children}</button>',
    '<ListTrigger className="collo-intent-property" {...data}>{children}</ListTrigger>',
  ),
  patch(
    'components/initiatives/IntentHeader.tsx',
    '      <button type="button" onClick={() => { open.current = true; setEditing(true); }} className="inline-flex items-center gap-1.5 -mx-1 px-1 h-6 rounded-md transition-colors hover:bg-sol-bg-highlight/70" title={label} data-intent-target={day ?? ""} {...data}>\n        <CalendarDays className="w-3.5 h-3.5" style={{ color: "var(--sol-text-dim)" }} />\n        {children ?? <span className="text-[11.5px]" style={{ color: "var(--sol-text-dim)" }}>{emptyLabel}</span>}\n      </button>',
    '      <ListTrigger type="button" onClick={() => { open.current = true; setEditing(true); }} className="collo-intent-property" title={label} data-intent-target={day ?? ""} {...data}>\n        <CalendarDays className="w-3.5 h-3.5" style={{ color: "var(--sol-text-dim)" }} />\n        {children ?? <span className="collo-intent-property-label" style={{ color: "var(--sol-text-dim)" }}>{emptyLabel}</span>}\n      </ListTrigger>',
  ),
  ...extraIcons,
  patch(
    'components/FileDiffLayout.tsx',
    'import { useState, useMemo, useRef } from "react";',
    'import { useState, useMemo, useRef, useEffect } from "react";',
  ),
  patch(
    detail,
    'const hasDetail = children != null && children !== false;',
    'const hasDetail = accessValid && children != null && children !== false;',
  ),
  patch(
    'components/FileDiffLayout.tsx',
    '  focusFile?: string | null;',
    '  focusFile?: string | null;\n  focusLine?: number;\n  onPositionChange?: (position: { file: string; line?: number }) => void;',
  ),
  patch(
    'components/FileDiffLayout.tsx',
    '  focusFile,\n',
    '  focusFile,\n  focusLine,\n  onPositionChange,\n',
  ),
  patch(
    'components/FileDiffLayout.tsx',
    '  const landRef = useRef<(() => void) | null>(null);',
    '  const landRef = useRef<(() => void) | null>(null);\n  const restoredPosition = useRef(false);\n  useEffect(() => {\n    if (!focusFile || restoredPosition.current || !paneRef.current) return;\n    const index = strippedFiles.findIndex(f => (f.originalFilename ?? f.filename) === focusFile);\n    if(index < 0) return;\n    restoredPosition.current = true;\n    landRef.current = landOnDiffRow(paneRef, viewMode === "unified" ? index : null, focusLine);\n  }, [focusFile, focusLine, strippedFiles, viewMode]);\n  useEffect(() => {\n    const root = paneRef.current;\n    if (!root || !onPositionChange) return;\n    const remember = () => {\n      const at = topDiffRow(root);\n      const file = viewMode === "unified" && at?.fileIndex !== undefined ? strippedFiles[at.fileIndex] : selectedFileData;\n      if (file) onPositionChange({file: file.originalFilename ?? file.filename, line: at?.line});\n    };\n    root.addEventListener("scroll", remember, {capture:true, passive:true});\n    return () => root.removeEventListener("scroll", remember, true);\n  }, [viewMode, strippedFiles, selectedFileData, onPositionChange]);',
  ),
  patch(
    'components/settings/ui.tsx',
    '"rounded-xl border border-sol-border/80 bg-sol-bg-alt/30"',
    '"collo-preference-fields"',
  ),
  patch(
    'components/settings/ui.tsx',
    'className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-sol-text-muted"',
    'className="collo-preference-title"',
  ),
  patch(
    'components/FileDiffLayout.tsx',
    '  focusFile?: string | null;',
    '  focusFile?: string | null;\n  onFileSelected?: (path: string) => void;',
  ),
  patch('components/FileDiffLayout.tsx', '  focusFile,\n', '  focusFile,\n  onFileSelected,\n'),
  patch(
    'components/FileDiffLayout.tsx',
    '      setCurrentFileIndex(index);\n    }\n  }, [selectedFile, strippedFiles]);',
    '      setCurrentFileIndex(index);\n      onFileSelected?.(strippedFiles[index].originalFilename ?? strippedFiles[index].filename);\n    }\n  }, [selectedFile, strippedFiles]);',
  ),
  patch(
    'src/main.tsx',
    'import "../collo/product-ui.css";',
    'import "../collo/product-ui.css";\nimport "../collo/product-shell.css";',
  ),
  patch(
    'components/ConversationView.tsx',
    '                  data-vkey={String(virtualItem.key)}',
    '                  data-vkey={String(virtualItem.key)}\n                  data-reading-message={item.type === "message" ? (item.data as Message)._id : undefined}',
  ),
  patch(
    dashboard,
    '            <ErrorBoundary name="TeamSwitcher" level="inline">\n              <TeamSwitcher />\n            </ErrorBoundary>',
    '',
  ),
  patch(
    'app/projects/page.tsx',
    'import { CompanyDocument } from "../../components/company/CompanyDocument";',
    'import { ProductProjects } from "../../collo/ProductProjects";',
  ),
  patch('app/projects/page.tsx', '<CompanyDocument filter="projects" />', '<ProductProjects />'),
  patch(
    'components/initiatives/IntentHeader.tsx',
    'function IntentTitle(',
    'export function IntentTitle(',
  ),
  patch('app/projects/[id]/page.tsx', '      <IntentHeader\n', '      <ProductProjectHeader\n'),
  patch(
    'app/projects/[id]/page.tsx',
    '"use client";',
    '"use client";\nimport { ProductProjectHeader } from "../../../collo/ProductProjectHeader";',
  ),
  patch(
    'app/projects/[id]/page.tsx',
    '{ key: "workspaces", label: "Workspaces", icon: Activity }',
    '{ key: "workspaces", label: "Activity", icon: Activity }',
  ),
  patch(
    dashboard,
    '<div data-cc-shell className={`bg-sol-bg h-dvh',
    '<div data-cc-shell className={`collo-shell bg-sol-bg h-dvh',
  ),
  patch(
    dashboard,
    '<header data-cc-topbar ref={headerRef} className={`',
    '<header data-cc-topbar ref={headerRef} className={`collo-shell-header ',
  ),
  patch(
    dashboard,
    '      {tabStripShown && (\n        <ErrorBoundary name="TabBar" level="inline">\n          <TabBar />\n        </ErrorBoundary>\n      )}',
    '',
  ),
  patch(
    dashboard,
    '<Panel id="main" minSize={400}>{rightArea}</Panel>',
    '<Panel id="main" minSize={400}><div className="collo-work-stage">{tabStripShown && <ErrorBoundary name="TabBar" level="inline"><TabBar /></ErrorBoundary>}<div className="collo-stage-body">{rightArea}</div></div></Panel>',
  ),
  patch(
    dashboard,
    '<div className="h-full bg-sol-bg-alt overflow-auto" data-cc-sidebar-slot>',
    '<div className="collo-sidebar-slot h-full overflow-auto" data-cc-sidebar-slot>',
  ),
  patch(
    'components/Sidebar.tsx',
    '      data-sv-nav\n',
    '      data-sv-nav\n      data-product-nav=""\n',
  ),
  patch(
    'components/TabBar.tsx',
    'className={`flex-shrink-0 border-b flex items-center h-[32px]',
    'className={`collo-work-tabs flex-shrink-0 border-b flex items-center h-[32px]',
  ),
  patch(
    'store/inboxStore.ts',
    '  projects: Record<string, ProjectItem>;',
    '  projects: Record<string, ProjectItem>;\n  colloViewState: Record<string, unknown>;',
  ),
  patch('store/inboxStore.ts', '  projects: {},', '  projects: {},\n  colloViewState: {},'),
  patch(
    detail,
    'import { ReactNode } from "react";',
    'import { ReactNode, useLayoutEffect, useRef } from "react";\nimport { useProductPresence } from "../collo/useProductPresence";',
  ),
  patch(detail, '  children,\n}: {', '  children,\n  accessValid = true,\n}: {'),
  patch(detail, '  children?: ReactNode;', '  children?: ReactNode;\n  accessValid?: boolean;'),
  patch(
    detail,
    '  const active = hasDetail && isTabActive;',
    '  const active = hasDetail && isTabActive;\n  const presence = useProductPresence(hasDetail ? children : null, accessValid);\n  const detailRef = useRef<HTMLDivElement>(null);\n  const origin = useRef<HTMLElement | null>(null);\n  useLayoutEffect(() => {\n    if (!active) return;\n    origin.current = document.activeElement as HTMLElement;\n    detailRef.current?.focus({ preventScroll: true });\n    return () => { if (origin.current?.isConnected) origin.current.focus({ preventScroll: true }); };\n  }, [active]);',
  ),
  patch(
    detail,
    '    <div className="relative h-full overflow-hidden">',
    '    <div className="collo-detail-stage relative h-full overflow-hidden">',
  ),
  patch(
    detail,
    '      {hasDetail && (\n        <div className="absolute inset-0 z-30 bg-sol-bg flex flex-col">\n          <div className="flex-1 min-h-0">{children}</div>',
    '      {presence.value != null && (\n        <div ref={detailRef} tabIndex={-1} inert={!hasDetail} className="collo-detail-surface absolute inset-0 z-30 bg-sol-bg flex flex-col" data-phase={presence.phase}>\n          <div className="flex-1 min-h-0">{presence.value}</div>',
  ),
  patch(
    settings,
    'import { useCallback, useMemo, useRef, useState } from "react";',
    'import { useCallback, useMemo, useRef, useState } from "react";\nimport { useProductPresence } from "../../collo/useProductPresence";',
  ),
  patch(
    settings,
    '  const section = s.settingsModalSection;',
    '  const section = s.settingsModalSection;\n  const presence = useProductPresence(section ?? null);',
  ),
  patch(
    settings,
    '  if (!section) return null;',
    '  if (!presence.value) return null;\n  const shownSection = presence.value;',
  ),
  patch(
    settings,
    'const shown = hosted && section === "sync" ? "privacy" : !hosted && section === "privacy" ? "sync" : section;',
    'const shown = hosted && shownSection === "sync" ? "privacy" : !hosted && shownSection === "privacy" ? "sync" : shownSection;',
  ),
  patch(
    settings,
    'className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-[2px]"',
    'className="collo-settings-backdrop"\n      data-phase={presence.phase}\n      inert={!section}',
  ),
  patch(
    settings,
    'className="w-full max-w-[1080px] h-[min(880px,94dvh)] bg-sol-bg border border-sol-border rounded-xl shadow-2xl flex overflow-hidden animate-fadeSlideIn outline-none"',
    'className="collo-settings-surface"\n        data-phase={presence.phase}',
  ),
  patch(
    settings,
    oldNav,
    `        <div className="collo-settings-top"><div><span className="collo-eyebrow">COLLOSYS</span><h1>Preferences</h1></div><label className="collo-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape' && query){e.stopPropagation();setQuery('');} else if(e.key==='Enter' && firstMatch){go(firstMatch);setQuery('');}}} placeholder="Find a setting…" aria-label="Search settings sections"/></label><button className="collo-icon-button" onClick={close} aria-label="Close settings"><X size={18}/></button></div>
        <nav className="collo-settings-nav" aria-label="Settings sections">{visibleGroups.map(group=><div className="collo-settings-group" key={group.label}><span>{group.label}</span><div>{group.sections.map(d=>{const Icon=d.icon;return <button key={d.id??d.href} onClick={()=>go(d)} aria-label={d.label} aria-current={d.id===active.id?'page':undefined}><Icon size={16}/>{d.label}</button>;})}</div></div>)}{q && !visibleGroups.length && <p>No settings match “{query}”.</p>}</nav>

`,
  ),
  patch(
    settings,
    '<div className="flex-1 min-w-0 flex flex-col">',
    '<div className="collo-settings-content">',
  ),
  patch(
    settings,
    '<header className="flex items-center justify-between gap-4 pl-6 pr-3 py-3 border-b border-sol-border">',
    '<header className="collo-settings-section-heading">',
  ),
  patch(
    settings,
    oldSettings.slice(
      oldSettings.indexOf('            <button\n              onClick={close}'),
      oldSettings.indexOf(
        '          </header>',
        oldSettings.indexOf('            <button\n              onClick={close}'),
      ),
    ),
    '',
  ),
  patch(
    settings,
    '<div key={active.id} className="scrollbar-auto flex-1 overflow-y-auto px-4 sm:px-6 py-5">',
    '<div key={active.id} className="collo-settings-body scrollbar-auto">',
  ),
  patch(
    'components/ui/dialog.tsx',
    '"fixed inset-0 z-[200] bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"',
    '"collo-dialog-backdrop"',
  ),
  patch(
    'components/ui/dialog.tsx',
    read('components/ui/dialog.tsx').match(/"fixed left-\[50%\].*sm:rounded-lg"/)[0],
    '"collo-dialog-surface"',
  ),
  patch(
    'components/ui/dropdown-menu.tsx',
    '"z-[250] max-h-[var(--radix-dropdown-menu-content-available-height)]',
    '"collo-menu-surface z-[250] max-h-[var(--radix-dropdown-menu-content-available-height)]',
  ),
];
