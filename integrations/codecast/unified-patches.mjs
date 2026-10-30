import { readFileSync } from 'node:fs';
const prefix = 'packages/web/';
const read = (file) =>
  readFileSync(
    new URL('../../third_party/codecast/upstream/' + prefix + file, import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
const patch = (file, before, after) => ({ file: prefix + file, before, after });
// Adapt shared primitives and visible row roles at their existing seams.
// Business callbacks, drag behavior and virtualized rendering stay upstream.
const rowFiles = ['components/ListRowShell.tsx', 'components/tasks/TaskRow.tsx'];

function readableMetadata(file) {
  const source = read(file);
  return [...new Set(source.split('\n').filter((line) => /text-\[(?:10|11|10\.5)px\]/.test(line)))]
    .filter((line) => source.split(line).length === 2)
    .map((line) =>
      patch(
        file,
        line,
        line
          .replaceAll('text-[10px]', 'collo-meta')
          .replaceAll('text-[11px]', 'collo-meta')
          .replaceAll('text-[10.5px]', 'collo-meta'),
      ),
    );
}
export const unifiedPatches = [
  patch(
    'app/settings/keyboard/page.tsx',
    '<span className="truncate text-sm text-sol-text">{label}</span>',
    '<span className="text-sm text-sol-text whitespace-normal [overflow-wrap:anywhere]">{label}</span>',
  ),
  ...[
    'components/GlobalSessionPanel.tsx',
    'components/InboxViewTabs.tsx',
    'components/tasks/TaskCommentStream.tsx',
    'components/tasks/StationStrip.tsx',
    'components/FileDiffLayout.tsx',
    'app/tasks/[id]/page.tsx',
  ].flatMap(readableMetadata),
  patch('app/globals.css', '  --diffs-line-height: 22px;', '  --diffs-line-height: 20px;'),
  patch(
    'components/tasks/TaskCommentStream.tsx',
    'const textSize = size === "md" ? "collo-meta" : "text-[8px]";',
    'const textSize = "collo-meta";',
  ),
  patch(
    'components/tasks/TaskCommentStream.tsx',
    'className="collo-meta text-gray-400"',
    'className="collo-meta text-sol-text-dim"',
  ),
  patch(
    'components/SegmentedToggle.tsx',
    'text-[10px] tabular-nums text-sol-cyan',
    'collo-meta tabular-nums text-sol-cyan',
  ),
  patch(
    'components/timeline/Rail.tsx',
    'text-[11px] font-medium text-sol-text-dim uppercase tracking-wider px-1 pb-2',
    'collo-meta text-sol-text-dim px-1 pb-2',
  ),
  patch('components/InboxViewTabs.tsx', 'from "lucide-react"', 'from "../collo/ProductIcons"'),
  patch(
    'components/InboxViewTabs.tsx',
    'h-[22px] rounded-[5px] collo-meta',
    'collo-inbox-tab rounded-[5px] collo-meta',
  ),
  patch(
    'components/InboxViewTabs.tsx',
    'className="flex items-center gap-1 px-1.5 collo-meta font-medium whitespace-nowrap"',
    'className="collo-inbox-tab flex items-center gap-1 px-1.5 collo-meta font-medium whitespace-nowrap"',
  ),
  patch(
    'components/tasks/TaskCommentStream.tsx',
    'className="flex flex-col border px-3 py-2 rounded-xl bg-sol-bg-alt border-sol-border/50"',
    'className="collo-comment-composer flex flex-col border bg-sol-bg-alt border-sol-border/50"',
  ),
  patch(
    'app/tasks/[id]/page.tsx',
    '"flex-1 max-w-4xl mx-auto px-6 py-6 w-full"',
    '"collo-task-reading flex-1 mx-auto px-6 py-6 w-full"',
  ),
  patch(
    'components/FileDiffLayout.tsx',
    'import { useState, useMemo, useRef, useEffect } from "react";',
    'import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";',
  ),
  patch(
    'components/FileDiffLayout.tsx',
    '  useMountEffect(() => {\n    const mobile = window.innerWidth < MOBILE_BREAKPOINT;\n    setIsMobile(mobile);\n    if (mobile) setSidebarOpen(false);\n  });\n\n  useEventListener("resize", () => {\n    const mobile = window.innerWidth < MOBILE_BREAKPOINT;\n    setIsMobile(mobile);\n    if (mobile) setSidebarOpen(false);\n  });',
    '  // The actual pane, rather than the viewport, determines the file-tree mode.',
  ),
  patch(
    'components/FileDiffLayout.tsx',
    '  const paneRef = useRef<HTMLDivElement | null>(null);',
    '  const paneRef = useRef<HTMLDivElement | null>(null);\n  const [paneWidth, setPaneWidth] = useState(0);\n  const resizePosition = useRef<{line?:number;fileIndex?:number}|null>(null);\n  useLayoutEffect(() => {\n    const saved = resizePosition.current;\n    if (saved) {\n      resizePosition.current = null;\n      landRef.current?.();\n      landRef.current = landOnDiffRow(paneRef, viewMode === "unified" ? saved.fileIndex ?? null : null, saved.line);\n    }\n    const root = paneRef.current;\n    if (!root || flow) return;\n    const measure = () => {\n      const width = root.clientWidth;\n      if (!width) return;\n      setPaneWidth(width);\n      const compact = width < 804; // 200 tree + 600 code + 4 divider.\n      if (compact !== isMobile) {\n        resizePosition.current = topDiffRow(root);\n        setIsMobile(compact);\n        if (compact) setSidebarOpen(false);\n      }\n    };\n    measure(); const observer = new ResizeObserver(measure); observer.observe(root);\n    return () => observer.disconnect();\n  }, [isMobile, viewMode, flow, files.length === 0]);',
  ),
  patch(
    'components/FileDiffLayout.tsx',
    '<Panel id="file-tree" minSize={10}>',
    '<Panel id="file-tree" minSize={paneWidth >= 804 ? "200px" : "0%"} maxSize={paneWidth >= 804 ? `${paneWidth-604}px` : "100%"}>',
  ),
  patch(
    'components/FileDiffLayout.tsx',
    '<Panel id="diff-content" minSize={30}>',
    '<Panel id="diff-content" minSize={paneWidth >= 804 ? "600px" : "0%"}>',
  ),
  patch(
    'components/ConversationDiffLayout.tsx',
    'import { ConversationView } from "./ConversationView";',
    'import { ConversationView } from "./ConversationView";\nimport { ProductReadingSplit } from "../collo/ProductReadingSplit";',
  ),
  patch(
    'components/ConversationDiffLayout.tsx',
    '  // Mobile: tabs layout\n  if (isMobile && !hideDiff) {\n    return (\n      <div className={`${heightClass} w-full`}>\n        <Tabs defaultValue="conversation" className="h-full flex flex-col">\n          <TabsList className="grid w-full grid-cols-2 shrink-0 h-9 sm:h-11">\n            <TabsTrigger value="conversation" className="py-1.5 sm:py-2 text-xs sm:text-sm">Conversation</TabsTrigger>\n            <TabsTrigger value="diff" className="py-1.5 sm:py-2 text-xs sm:text-sm">\n              Diff {changes.length > 0 && `(${changes.length})`}\n            </TabsTrigger>\n          </TabsList>\n          <TabsContent value="conversation" className="flex-1 overflow-auto m-0">\n\n            <ConversationView {...conversationViewProps} />\n          </TabsContent>\n          <TabsContent value="diff" className="flex-1 overflow-auto m-0">\n            <DiffPane conversation={conversation} />\n          </TabsContent>\n        </Tabs>\n      </div>\n    );\n  }\n\n  // Desktop: diff panel closed - simple layout\n  if (!diffPanelOpen || hideDiff) {\n    return (\n      <div className={`${heightClass} w-full overflow-y-auto relative`}>\n        <ConversationView {...conversationViewProps} />\n      </div>\n    );\n  }\n\n  // Desktop: diff panel open - resizable panels\n  return (\n    <div className={`${heightClass} w-full relative`}>\n      <Group\n        orientation="horizontal"\n        onLayoutChange={handleLayoutChange}\n        elementRef={groupElRef}\n        defaultLayout={layout}\n        className="h-full"\n      >\n        {/* Conversation Panel */}\n        <Panel id="content-panel" minSize="15%">\n          <div className="h-full relative overflow-y-auto">\n\n            <ConversationView {...conversationViewProps} />\n          </div>\n        </Panel>\n\n        {/* Resize handle - on LEFT of timeline */}\n        <Separator className="cc-split" />\n\n        {/* Timeline + Diff Panel */}\n        <Panel id="diff-panel" minSize="20%">\n          <div className="h-full flex">\n            {/* Timeline Strip */}\n            <div className="w-10 h-full border-r border-sol-border bg-sol-bg-alt/30 relative flex-shrink-0">\n              <TimelineStrip conversationRef={conversationRef} />\n            </div>\n            {/* Diff Content */}\n            <div className="flex-1 h-full min-w-0">\n              <DiffPane conversation={conversation} />\n            </div>\n          </div>\n        </Panel>\n      </Group>\n\n    </div>\n  );',
    '  return <ProductReadingSplit open={!hideDiff && diffPanelOpen} layout={layout} onLayoutChange={handleLayoutChange} groupRef={groupElRef}\n    reading={<ConversationView {...conversationViewProps} />}\n    code={<div className="h-full flex"><div className="w-10 h-full border-r border-sol-border relative flex-shrink-0"><TimelineStrip conversationRef={conversationRef} /></div><div className="flex-1 h-full min-w-0"><DiffPane conversation={conversation} /></div></div>}\n  />;',
  ),
  patch(
    'components/ui/button.tsx',
    'import "./button.css"',
    'import "./button.css"\nimport { usePressSurface } from "../../collo/ProductControlTriggers"',
  ),
  patch(
    'components/ui/button.tsx',
    '  ({ className, variant, size, asChild = false, ...props }, ref) => {',
    '  ({ className, variant, size, asChild = false, children, onPointerDown, onKeyDown, ...props }, ref) => {\n    const { face, press } = usePressSurface(props.disabled)\n    const content = (inner: React.ReactNode) => <span ref={face} className="collo-button-face">{inner}</span>\n    const child = asChild && React.isValidElement<{children?: React.ReactNode}>(children) ? React.cloneElement(children, {children: content(children.props.children)}) : content(children)',
  ),
  patch(
    'components/ui/button.tsx',
    '        {...props}\n      />',
    '        {...props}\n        data-collo-button\n        onPointerDown={event => { if(event.button === 0) press(); onPointerDown?.(event) }}\n        onKeyDown={event => { if(!event.repeat && (event.key === "Enter" || event.key === " ")) press(); onKeyDown?.(event) }}\n      >{child}</Comp>',
  ),
  patch(
    'components/faces/faceRow.css',
    '  opacity: var(--drain-opacity, 1);',
    '  opacity: 1; /* Presence retains its moon/dot; identity text remains readable. */',
  ),
  patch(
    'app/globals.css',
    '.simple-view [data-sv-feed] .text-xs { font-size: 10.5px; }',
    '.simple-view [data-sv-feed] .text-xs { font:var(--collo-type-meta); font-variation-settings:"opsz" 17,"GRAD" 0; color:var(--collo-secondary); }',
  ),
  patch(
    'app/globals.css',
    '.simple-view [data-sv-sticky] .text-xs { font-size: 10.5px; }',
    '.simple-view [data-sv-sticky] .text-xs { font:var(--collo-type-meta); font-variation-settings:"opsz" 17,"GRAD" 0; color:var(--collo-secondary); }',
  ),
  ...rowFiles.map((file) => {
    const before = read(file);
    let after = before.replace(
      'from "lucide-react"',
      'from "' + (file.includes('/tasks/') ? '../../' : '../') + 'collo/ProductIcons"',
    );
    after = after.replaceAll('text-[10px]', 'text-xs').replaceAll('text-[11px]', 'text-xs');
    if (file.endsWith('ListRowShell.tsx'))
      after = after.replace(
        'className={`relative w-full flex items-center',
        'className={`collo-data-row relative w-full flex items-center',
      );
    if (file.endsWith('TaskRow.tsx'))
      after = after.replace(
        '<span className="flex-1 text-sm text-sol-text truncate">{internals ? task.title : sentenceCase(task.title)}</span>',
        '<span className="collo-task-title flex-1 text-sol-text">{internals ? task.title : sentenceCase(task.title)}</span>',
      );
    return patch(file, before, after);
  }),
  patch(
    'components/SegmentedToggle.tsx',
    'className={`flex items-center ${sm ? "h-6" : "h-7"}',
    'className={`collo-segmented flex items-center ${sm ? "h-6" : "h-7"}',
  ),
  patch(
    'components/ui/input.tsx',
    '"flex h-9 w-full rounded-md border border-input',
    '"collo-input flex h-9 w-full rounded-md border border-input',
  ),
  patch(
    'components/ui/tabs.tsx',
    '"inline-flex h-9 items-center justify-center',
    '"collo-tabs-list inline-flex h-9 items-center justify-center',
  ),
  patch(
    'components/ui/tabs.tsx',
    '"inline-flex items-center justify-center whitespace-nowrap',
    '"collo-tab-trigger inline-flex items-center justify-center whitespace-nowrap',
  ),
];
