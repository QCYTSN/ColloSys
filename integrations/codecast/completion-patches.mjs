import { readFileSync } from 'node:fs';
const base = 'packages/web/';
const read = (file) =>
  readFileSync(
    new URL(`../../third_party/codecast/upstream/${base}${file}`, import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
const patch = (file, before, after) => ({ file: base + file, before, after });
export const completionPatches = [
  patch(
    'components/DashboardLayout.tsx',
    '              maxSize="50%"',
    '              maxSize={`${Math.min(50, 280 / productPanelWidths.nav * 100)}%`}',
  ),
  // '/' is now the workbench, not the old public homepage. Once the mature
  // durable sign-out has purged credentials, start a fresh login document so
  // a lagging server-auth render cannot return to the protected shell.
  patch(
    'components/UserMenu.tsx',
    '    await signOut();\n    router.push("/");',
    '    await signOut();\n    window.location.replace("/login");',
  ),
  patch(
    'app/settings/accounts/page.tsx',
    '        await signOut();\n        router.push("/");',
    '        await signOut();\n        window.location.replace("/login");',
  ),
  // The few persistent shell controls keep a stable trigger DOM node on first
  // pointer/focus entry. Lazy tooltip arming otherwise remounts it mid-click.
  ...['sidebar.toggleLeft', 'sidebar.toggleRight'].map((action) =>
    patch('components/DashboardLayout.tsx', `action="${action}"`, `eager action="${action}"`),
  ),
  // Reserve usable space for both the work surface and the 200px session rail.
  // The existing panel group clamps a sidebar drag, without overwriting the
  // saved sidebar preference when the rail is opened or the window shrinks.
  patch(
    'components/DashboardLayout.tsx',
    '<Panel id="main" minSize={400}>',
    '<Panel id="main" minSize={`${Math.min(100, (showSessionList ? 640 : 400) / productPanelWidths.nav * 100)}%`}>',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '              minSize={180}',
    '              minSize={`${Math.min(50, 208 / productPanelWidths.nav * 100)}%`}',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '<Panel id="right-content" minSize={400}>',
    '<Panel id="right-content" minSize={`${Math.min(100, 400 / productPanelWidths.rail * 100)}%`}>',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '            minSize={200}',
    '            minSize={`${Math.min(50, 200 / productPanelWidths.rail * 100)}%`}',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '  const railGroupElRef = useRef<HTMLDivElement | null>(null);',
    `  const railGroupElRef = useRef<HTMLDivElement | null>(null);
  const [productPanelWidths, setProductPanelWidths] = useState({nav:window.innerWidth,rail:Math.max(1,window.innerWidth-264)});
  useWatchEffect(() => {
    const nav = navGroupElRef.current, rail = railGroupElRef.current;
    if (!nav || !rail) return;
    // Explicit percentages avoid the pinned panel version retaining a pixel
    // minimum's old percentage after a window resize. This is geometry only.
    const observer = new ResizeObserver(() => {
      const next = {nav:Math.max(1,nav.clientWidth),rail:Math.max(1,rail.clientWidth)};
      setProductPanelWidths(prev => prev.nav===next.nav && prev.rail===next.rail ? prev : next);
    });
    observer.observe(nav); observer.observe(rail);
    return () => observer.disconnect();
  }, [isGuest, s.clientStateInitialized]);`,
  ),
  patch(
    'components/DashboardLayout.tsx',
    '  const handleRightLayoutChange = useDragGatedLayoutPersist((newLayout) => {',
    `  useWatchEffect(() => {
    // Updated constraints do not retroactively clamp an already laid-out
    // group in the pinned library. Correct only the physically invalid width.
    const available = productPanelWidths.nav - (showSessionList ? 640 : 400);
    const sidebar = sidebarElRef.current;
    if (sidebar && available >= 208 && sidebar.clientWidth > available + 1) {
      sidebarPanelRef.current?.resize(\`\${available}px\`);
    }
  }, [productPanelWidths.nav, productPanelWidths.rail, showSessionList]);
  const handleRightLayoutChange = useDragGatedLayoutPersist((newLayout) => {`,
  ),
  patch(
    'components/DashboardLayout.tsx',
    '  }, [showSessionList, railSize]);',
    `  }, [showSessionList, railSize]);
  useWatchEffect(() => {
    const group = railGroupElRef.current;
    if (!group || !showSessionList) return;
    // A parent resize can temporarily collapse the nested panel before its new
    // minimum is applied. Restore only that involuntary collapse; normal user
    // resizing and the persisted rail percentage stay with the existing store.
    const frame = requestAnimationFrame(() => {
      const panel = sessionListPanelRef.current;
      if (selectSessionRailOpen(useInboxStore.getState()) && panel?.isCollapsed() && group.clientWidth >= 604) {
        panel.resize(\`\${Math.max(200, group.clientWidth * railSize / 100)}px\`);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [showSessionList, railSize, productPanelWidths.rail]);`,
  ),
  patch(
    'components/DashboardLayout.tsx',
    '                <div className="w-full h-full border-l border-sol-border/30">',
    '                <div inert={!showSessionList} aria-hidden={!showSessionList} className="w-full h-full border-l border-sol-border/30">',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '<div className="collo-sidebar-slot h-full overflow-auto" data-cc-sidebar-slot>',
    '<div inert={sidebarHidden} aria-hidden={sidebarHidden} className="collo-sidebar-slot h-full overflow-auto" data-cc-sidebar-slot>',
  ),
  patch('lib/surfaceRules.ts', 'search: "Search sessions",', 'search: "Search app sessions",'),
  patch(
    'lib/surfaceRules.ts',
    `searchPagePlaceholder: 'Search sessions... "phrases", file: pr: commit:',`,
    `searchPagePlaceholder: 'Search app sessions... "phrases", file: pr: commit:',`,
  ),
  patch(
    'components/GlobalSearch.tsx',
    '            {groupedResults.length === 0 && !searchData ? (',
    '            <div className="collo-search-scope px-4 py-3">Searches sessions created in the app. <a href="/inbox" onClick={closePanel}>Browse conversations captured from project directories →</a></div>\n            {groupedResults.length === 0 && !searchData ? (',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '        <SlowBootNote />',
    '        {/* The shared loader owns its slow-start recovery controls. */}',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '  const handleLayoutChange = useDragGatedLayoutPersist((newLayout) => {',
    '  useWatchEffect(() => {\n    if (!s.clientStateInitialized) return;\n    try { localStorage.setItem("collo.boot.nav", JSON.stringify({size:layout.sidebar,hidden:navHidden})); } catch {}\n  }, [layout.sidebar, navHidden, s.clientStateInitialized]);\n  const handleLayoutChange = useDragGatedLayoutPersist((newLayout) => {',
  ),
  ...['src/App.tsx', 'src/routes.manifest.ts'].flatMap((file) => [
    patch(
      file,
      'const Login = lazy(() => import("@/app/login/page"));',
      'const Login = lazy(() => import("../collo/ProductAuth").then(m => ({default:m.ProductLogin})));',
    ),
    patch(
      file,
      'const Signup = lazy(() => import("@/app/signup/page"));',
      'const Signup = lazy(() => import("../collo/ProductAuth").then(m => ({default:m.ProductSignup})));',
    ),
  ]),
  patch(
    'components/AppLoader.tsx',
    read('components/AppLoader.tsx'),
    'export { AppLoader, SlowBootNote } from "../collo/ProductLoader";\n',
  ),
  patch(
    'components/BootFallback.tsx',
    read('components/BootFallback.tsx'),
    'import { AppLoader } from "./AppLoader";\nexport function BootFallback(){return <AppLoader label="Initializing ColloSys"/>;}\n',
  ),
  patch(
    'src/main.tsx',
    'import "../collo/product-shell.css";',
    'import "../collo/product-shell.css";\nimport "../collo/product-completion.css";',
  ),
  patch(
    'components/ThemeProvider.tsx',
    'return localStorage.getItem("codecast-theme") === "dark" ? "dark" : "light";',
    'const saved = localStorage.getItem("codecast-theme");\n  return saved === "dark" || saved === "light" ? saved : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";',
  ),
  patch(
    'components/ui/popover.tsx',
    '      sideOffset={sideOffset}',
    '      sideOffset={sideOffset}\n      collisionPadding={12}\n      hideWhenDetached\n      data-collo-floating="popover"',
  ),
];
