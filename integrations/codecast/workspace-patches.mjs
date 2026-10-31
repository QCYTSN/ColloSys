// Owned adaptations of the prepared pinned UI. Each anchor must match once.
const patch = (file, before, after) => ({ file: `packages/web/${file}`, before, after });
const detail = 'components/DetailSplitLayout.tsx';
export const workspacePatches = [
  patch('app/projects/[id]/page.tsx',
    'const tab: ProjectTab = asked === "line" && !lineShown ? "tasks" : asked;',
    'const tab: ProjectTab = taskRef ? "tasks" : asked === "line" && !lineShown ? "tasks" : asked;'),
  patch('app/tasks/[id]/page.tsx',
    'export function TaskDetailContent({ taskId, variant = "page", onClose, onOpen }: { taskId?: string; variant?: "page" | "inline"; onClose?: () => void; onOpen?: () => void } = {}) {',
    'export function TaskDetailContent({ taskId, variant = "page", onClose, onOpen, returnHref = "/tasks" }: { taskId?: string; variant?: "page" | "inline"; onClose?: () => void; onOpen?: () => void; returnHref?: string } = {}) {'),
  patch('app/tasks/[id]/page.tsx',
    '      } else if (matchesAction(e, "task.back")) {\n        stop();\n        router.push("/tasks");',
    '      } else if (matchesAction(e, "task.back")) {\n        stop();\n        router.push(returnHref);'),
  patch('app/tasks/[id]/page.tsx',
    '      } else if (e.key === "Escape" && !e.metaKey && !e.ctrlKey) {\n        stop();\n        router.push("/tasks");',
    '      } else if (e.key === "Escape" && !e.metaKey && !e.ctrlKey) {\n        stop();\n        router.push(returnHref);'),
  patch('app/tasks/[id]/page.tsx',
    '[paneActive, paletteOpen, shortcutsPanelOpen, data, openCmd, startEditTitle, router]);',
    '[paneActive, paletteOpen, shortcutsPanelOpen, data, openCmd, startEditTitle, router, returnHref]);'),
  patch('app/tasks/[id]/page.tsx',
    '<Link href="/tasks" className="text-xs text-sol-cyan hover:underline">← Back to tasks</Link>',
    '<Link href={returnHref} className="text-xs text-sol-cyan hover:underline">← Back to tasks</Link>'),
  patch('app/tasks/[id]/page.tsx',
    'onClick={() => { if (isInline && onClose) onClose(); else router.push("/tasks"); }}',
    'onClick={() => { if (isInline && onClose) onClose(); else router.push(returnHref); }}'),
  patch('app/projects/[id]/page.tsx',
    'closeHref={`/projects/${projectId}`}',
    'closeHref={`/projects/${projectId}?tab=tasks`}'),
  patch('app/projects/[id]/page.tsx',
    '<TaskDetailContent taskId={taskId} variant="page" />',
    '<TaskDetailContent taskId={taskId} variant="page" returnHref={`/projects/${projectId}?tab=tasks`} />'),
  patch('app/tasks/page.tsx',
    'onCardClick={(t) => router.push(`/tasks/${t._id}`)}',
    'onCardClick={(t) => router.push(projectId ? `/projects/${projectId}/${t._id}` : `/tasks/${t._id}`)}'),
  patch('components/DashboardLayout.tsx',
    'collo-shell bg-sol-bg h-dvh flex flex-col overflow-hidden',
    'collo-shell bg-sol-bg h-dvh flex flex-col overflow-clip'),
  patch('components/tasks/TaskCommentStream.tsx',
    'import { Badge } from "../ui/badge";',
    'import { Badge } from "../ui/badge";\nimport { Button } from "../ui/button";\nimport { useTaskCommentDraft } from "../../collo/useTaskCommentDraft";'),
  patch('components/tasks/TaskCommentStream.tsx',
    '  const [comment, setComment] = useState("");',
    '  const { text: comment, setText: setComment, allowed: draftAllowed } = useTaskCommentDraft(shortId);'),
  patch('components/tasks/TaskCommentStream.tsx',
    '  if (!commentOpen) {',
    '  if (!draftAllowed) return null;\n  if (!commentOpen && !comment) {'),
  patch('components/tasks/TaskCommentStream.tsx',
    '        <button\n          type="button"\n          onClick={() => {\n            setCommentOpen(true);',
    '        <Button\n          type="button"\n          variant="outline"\n          onClick={() => {\n            setCommentOpen(true);'),
  patch('components/tasks/TaskCommentStream.tsx',
    '          className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-sol-border text-sol-text-muted bg-sol-bg-alt/50 hover:text-sol-text hover:bg-sol-bg-alt transition-colors"',
    '          className="gap-2"'),
  patch('components/tasks/TaskCommentStream.tsx',
    '          Add comment\n        </button>',
    '          Add comment\n        </Button>'),
  patch('components/tasks/TaskCommentStream.tsx',
    '            <button\n              onClick={handleAddComment}\n              disabled={!canSend}\n              className={`w-7 h-7 rounded-full transition-colors flex items-center justify-center border ${!canSend ? "border-sol-border/30 text-sol-text-dim/25 cursor-not-allowed" : "border-sol-blue/50 bg-sol-blue/20 text-sol-blue hover:bg-sol-blue/30 hover:border-sol-blue"}`}\n            >\n              <ArrowUp className="w-3.5 h-3.5" />\n            </button>',
    '            <Button\n              type="button" variant="outline"\n              onClick={handleAddComment}\n              disabled={!canSend || commentImages.some(i => i.uploading)}\n              aria-label="Post comment"\n              title={!canSend ? "Write a comment or attach an image" : commentImages.some(i => i.uploading) ? "Wait for the image upload" : "Post comment"}\n            >\n              <ArrowUp className="w-4 h-4" /> Post comment\n            </Button>'),
  patch('components/ConversationView.tsx',
    'const EMPTY_MESSAGES: any[] = [];',
    'const EMPTY_MESSAGES: any[] = [];\nconst EMPTY_COMMITS: Commit[] = [];\nconst EMPTY_PULL_REQUESTS: PullRequest[] = [];'),
  patch('components/ConversationView.tsx',
    'conversation, commits = [], pullRequests = [],',
    'conversation, commits = EMPTY_COMMITS, pullRequests = EMPTY_PULL_REQUESTS,'),
  patch('components/diff/PierreDiff.tsx',
    'preloadHighlighter({ themes: [DIFF_THEME], langs: ["text", lang] })',
    'preloadHighlighter({ themes: [DIFF_THEME], langs: ["text", lang], preferredHighlighter: "shiki-wasm" })'),
  patch(detail,
    'import { ReactNode, useLayoutEffect, useRef } from "react";',
    'import { ReactNode, useLayoutEffect, useRef, useCallback } from "react";'),
  patch(detail, '  accessValid = true,', '  accessValid = true,\n  detailOpen = true,\n  retainDetail = false,'),
  patch(detail, '  accessValid?: boolean;', '  accessValid?: boolean;\n  detailOpen?: boolean;\n  retainDetail?: boolean;'),
  patch(detail,
    '  const hasDetail = accessValid && children != null && children !== false;',
    '  const hasDetail = accessValid && detailOpen && children != null && children !== false;'),
  patch(detail,
    '  const detailRef = useRef<HTMLDivElement>(null);',
    `  const detailRef = useRef<HTMLDivElement>(null);
  const retained = useRef<ReactNode>(null);
  if (!retainDetail || !presence.allowed) retained.current = null;
  else if (children != null && children !== false) retained.current = children;
  const detailValue = retainDetail && presence.allowed ? retained.current : presence.value;
  const detailPhase = presence.value == null ? "hidden" : presence.phase;
  const setDetailRef = useCallback((node: HTMLDivElement | null) => {
    detailRef.current = node;
    presence.ref(node);
  }, [presence.ref]);`),
  patch(detail,
    '    detailRef.current?.focus({ preventScroll: true });\n    return () => { if (origin.current?.isConnected) origin.current.focus({ preventScroll: true }); };',
    `    // Read/focus once after the child layout commits, not between inserting
    // the surface and registering its panels. A newer interaction owns focus.
    const frame = requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (focused === origin.current || focused === document.body)
        detailRef.current?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (origin.current?.isConnected) origin.current.focus({ preventScroll: true });
    };`),
  patch(detail, '      {presence.value != null && (', '      {detailValue != null && ('),
  patch(detail,
    'ref={node => { detailRef.current = node; presence.ref(node); }} tabIndex={-1}',
    'ref={setDetailRef} tabIndex={-1} aria-hidden={!hasDetail}'),
  patch(detail, 'data-phase={presence.phase}', 'data-phase={detailPhase}'),
  patch(detail, '{presence.value}</div>', '{detailValue}</div>'),
  patch('hooks/usePagePresence.ts',
    'import { useSyncExternalStore } from "react";',
    'import { useSyncExternalStore } from "react";\nimport { useProductViewVisible } from "../collo/ProductViewVisibility";'),
  patch('hooks/usePagePresence.ts',
    '  return tab ? tab.isActive : true;',
    '  const visible = useProductViewVisible();\n  return visible && (tab ? tab.isActive : true);'),
  patch('hooks/usePagePresence.ts',
    '  return tab ? (tab.isVisible ?? tab.isActive) : true;',
    '  const visible = useProductViewVisible();\n  return visible && (tab ? (tab.isVisible ?? tab.isActive) : true);'),
  patch('components/diff/pierre.ts',
    'export type DiffRenderer =',
    'export function preloadDiffRenderer(name: string, language?: string) { load(name, language); }\n\nexport type DiffRenderer ='),
  patch('components/FileDiffLayout.tsx',
    '  files: DiffFile[];\n  /** Marks for one file',
    '  files: DiffFile[];\n  initialPaneWidth?: number;\n  /** Marks for one file'),
  patch('components/FileDiffLayout.tsx',
    'export function FileDiffLayout({\n  files,',
    'export function FileDiffLayout({\n  files,\n  initialPaneWidth = 0,'),
  patch('components/FileDiffLayout.tsx',
    '  const [selectedFile, setSelectedFile] = useState<string | null>(null);',
    '  const [selectedFile, setSelectedFile] = useState<string | null>(() => strippedFiles.find(f => (f.originalFilename ?? f.filename) === focusFile)?.filename ?? strippedFiles[0]?.filename ?? null);'),
  patch('components/FileDiffLayout.tsx',
    '  const [currentFileIndex, setCurrentFileIndex] = useState(0);\n  const [isMobile, setIsMobile] = useState(false);',
    '  const [currentFileIndex, setCurrentFileIndex] = useState(() => Math.max(0, strippedFiles.findIndex(f => f.filename === selectedFile)));\n  const [isMobile, setIsMobile] = useState(() => initialPaneWidth > 0 && initialPaneWidth < 804);'),
  patch('components/FileDiffLayout.tsx',
    '  const [paneWidth, setPaneWidth] = useState(0);',
    '  const [paneWidth, setPaneWidth] = useState(initialPaneWidth);'),
  patch('components/FileDiffLayout.tsx',
    '  const [sidebarOpen, setSidebarOpen] = useState(true);',
    '  const wideSidebarOpen = useRef(true);\n  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile);\n  if (!isMobile) wideSidebarOpen.current = sidebarOpen;'),
  patch('components/FileDiffLayout.tsx',
    '        if (compact) setSidebarOpen(false);',
    '        setSidebarOpen(compact ? false : wideSidebarOpen.current);'),
  patch('components/FileDiffLayout.tsx',
    '  const handleSelectFile = (filename: string) => {\n    setSelectedFile(filename);',
    '  const handleSelectFile = (filename: string) => {\n    setCurrentFileIndex(Math.max(0, strippedFiles.findIndex(f => f.filename === filename)));\n    setSelectedFile(filename);'),
  patch('components/FileDiffLayout.tsx',
    '  focusLine?: number;',
    '  focusLine?: number;\n  filePositions?: Record<string, { line?: number }>;'),
  patch('components/FileDiffLayout.tsx', '  focusLine,\n', '  focusLine,\n  filePositions,\n'),
  patch('components/FileDiffLayout.tsx',
    '  const toggleViewMode = () => {\n    s.updateClientUI',
    `  const positions = useRef<Record<string, { line?: number }>>({ ...filePositions });
  const toggleViewMode = () => {
    const at = paneRef.current && topDiffRow(paneRef.current);
    const file = viewMode === "unified" && at?.fileIndex !== undefined ? strippedFiles[at.fileIndex] : strippedFiles[currentFileIndex];
    if (file) {
      const original = file.originalFilename ?? file.filename;
      positions.current[original] = { line: at?.line };
      onPositionChange?.({ file: original, line: at?.line });
      setSelectedFile(file.filename);
      setCurrentFileIndex(strippedFiles.indexOf(file));
    }
    s.updateClientUI`),
  patch('components/FileDiffLayout.tsx',
    '    document.getElementById(`file-${index}`)?.scrollIntoView({ block: "start" });',
    '    paneRef.current?.querySelector(`[id="file-${index}"]`)?.scrollIntoView({ block: "start" });'),
  patch('components/FileDiffLayout.tsx',
    `  const restoredPosition = useRef(false);
  useEffect(() => {
    if (!focusFile || restoredPosition.current || !paneRef.current) return;
    const index = strippedFiles.findIndex(f => (f.originalFilename ?? f.filename) === focusFile);
    if(index < 0) return;
    restoredPosition.current = true;
    landRef.current = landOnDiffRow(paneRef, viewMode === "unified" ? index : null, focusLine);
  }, [focusFile, focusLine, strippedFiles, viewMode]);`,
    `  useEffect(() => {
    if (!selectedFileData || !paneRef.current || flow) return;
    const original = selectedFileData.originalFilename ?? selectedFileData.filename;
    const index = strippedFiles.indexOf(selectedFileData);
    const line = positions.current[original]?.line ?? (original === focusFile ? focusLine : undefined);
    landRef.current?.();
    if (viewMode === "split" && line === undefined) {
      const scroller = paneRef.current.querySelector<HTMLElement>("[data-follow-diff-scroll]");
      if (scroller) scroller.scrollTop = 0;
      return;
    }
    landRef.current = landOnDiffRow(paneRef, viewMode === "unified" ? index : null, line);
    return () => landRef.current?.();
  }, [selectedFileData, focusFile, focusLine, strippedFiles, viewMode, flow]);`),
  patch('components/FileDiffLayout.tsx',
    '    const remember = () => {\n      const at = topDiffRow(root);',
    '    const remember = (event: Event) => {\n      const scroller = root.querySelector("[data-follow-diff-scroll]");\n      if (event.target !== scroller) return;\n      const at = topDiffRow(root);'),
  patch('components/FileDiffLayout.tsx',
    '      if (file) onPositionChange({file: file.originalFilename ?? file.filename, line: at?.line});',
    '      if (file) {\n        const original = file.originalFilename ?? file.filename;\n        positions.current[original] = { line: at?.line };\n        onPositionChange({file: original, line: at?.line});\n      }'),
  patch('components/FileDiffSidebar.tsx',
    '      data-diff-file={node.file ? node.file.originalFilename ?? node.file.filename : undefined}',
    '      data-diff-file={node.file ? node.file.originalFilename ?? node.file.filename : undefined}\n      aria-current={isSelected ? "true" : undefined}\n      title={node.file?.originalFilename ?? node.path}'),
  patch('components/FileDiffSidebar.tsx',
    '"w-full flex items-center gap-2 py-1.5 px-2 text-sm transition-colors",',
    '"collo-file-row w-full flex items-center gap-2 py-1.5 px-2 transition-colors",'),
  patch('components/FileDiffSidebar.tsx',
    '"bg-sol-violet/20 text-sol-text border-l-2 border-sol-violet"',
    '"bg-sol-violet/20 text-sol-text"'),
  patch('components/FileDiffLayout.tsx',
    'import { Button } from "./ui/button";',
    'import { Button } from "./ui/button";\nimport { ListTrigger } from "../collo/ProductControlTriggers";'),
  patch('components/FileDiffLayout.tsx',
    `    <button
      onClick={handleCopy}
      className={cn(
        "p-1 rounded hover:bg-sol-bg-alt/50 transition-colors",
        className
      )}
      title={copied ? "Copied!" : "Copy to clipboard"}`, 
    `    <ListTrigger
      onClick={handleCopy}
      className={cn("collo-diff-copy", className)}
      aria-label={copied ? "Path copied" : "Copy file path"}
      title={copied ? "Copied!" : "Copy file path"}`),
  patch('components/FileDiffLayout.tsx',
    '        <Copy className="w-3 h-3 text-sol-text-dim" />\n      )}\n    </button>',
    '        <Copy className="w-4 h-4 text-sol-text-dim" />\n      )}\n    </ListTrigger>'),
];
