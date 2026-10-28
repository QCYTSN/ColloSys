import { readFileSync } from 'node:fs';
import path from 'node:path';
// All ranges are anchored in the pinned, immutable reference. The normal
// preparation loop still verifies each exact replacement occurs only once.
const web = 'packages/web/';
const read = (file) =>
  readFileSync(
    new URL(`../../third_party/codecast/upstream/${web}${file}`, import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
const patch = (file, before, after) => ({ file: web + file, before, after });
function range(file, start, end, after) {
  const source = read(file),
    a = source.indexOf(start),
    b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Missing product UI anchor: ${file}`);
  return patch(file, source.slice(a, b), after);
}
const iconFiles = [
  'components/ConversationView.tsx',
  'components/tasks/TaskTimeline.tsx',
  'app/tasks/page.tsx',
  'app/tasks/[id]/page.tsx',
  'components/tasks/TaskCommentStream.tsx',
  'components/tasks/TaskStatusPicker.tsx',
  'components/company/CompanyDocument.tsx',
  'components/DashboardLayout.tsx',
  'components/UserMenu.tsx',
  'components/TeamSwitcher.tsx',
  'components/NotificationBell.tsx',
  'components/settings/SettingsModal.tsx',
  'components/FileDiffLayout.tsx',
  'components/FileDiffSidebar.tsx',
  'components/timeline/Rail.tsx',
  'app/projects/[id]/page.tsx',
  'app/settings/profile/page.tsx',
  'components/ui/dialog.tsx',
  'components/ui/dropdown-menu.tsx',
];
const iconPatches = iconFiles.flatMap((file) =>
  [...read(file).matchAll(/import\s*\{[^}]+\}\s*from\s*"lucide-react";?/gs)].map((match) =>
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
export const productUiPatches = [
  ...iconPatches,
  patch(
    'components/ThemeProvider.tsx',
    '  const colorThemeKey = useInboxStore((s) => resolveColorThemeKey(s.clientState.ui?.color_theme));',
    '  const colorThemeKey = DEFAULT_COLOR_THEME; // Product appearance is unified; the legacy preference remains stored.',
  ),
  patch(
    'components/ThemeProvider.tsx',
    '  const shownStyle: VisualStyle = lock ? "classic" : resolveVisualStyle({ visual_style: visualStyle, lane });',
    '  const shownStyle: VisualStyle = resolveVisualStyle({ visual_style: "classic", lane: "full" });',
  ),
  patch(
    'components/ThemeProvider.tsx',
    '  const hostedLook = hosted && !lock;',
    '  const hostedLook = false; // Keep hosted business mode independent from the ColloSys visual shell.',
  ),
  patch(
    'components/ThemeProvider.tsx',
    '    applyThemeVars(!lock && !hosted ? colorVars[shownTheme] : {});',
    '    applyThemeVars(colorVars[shownTheme]);',
  ),
  range(
    'index.html',
    '        var visualStyle = localStorage.getItem',
    '      })();',
    `        // Use the same ColloSys palette before and after hydration. Stored legacy
        // appearance choices remain intact; light/dark remains a user preference.
        try {
          var themeVars = (window.__ccDefaultColorTheme || {})[theme] || {};
          var names = Object.keys(themeVars);
          for (var i = 0; i < names.length; i++) document.documentElement.style.setProperty(names[i], themeVars[names[i]]);
          if (names.length) document.documentElement.setAttribute('data-theme-vars', names.join(' '));
        } catch (e) {}
`,
  ),
  patch(
    'lib/chunkReloadGuard.ts',
    'export function tryReloadForStaleChunk(): boolean {\n  try {',
    'export function tryReloadForStaleChunk(): boolean {\n  // An offline lazy fetch is not evidence of a stale deployment. Preserve the open workspace.\n  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;\n  try {',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '        <ThemeIntroAnywhere />',
    '        {/* ColloSys uses one product theme; retain existing preferences without a migration promotion. */}',
  ),
  range(
    'app/settings/notifications/page.tsx',
    '      <SettingsSection\n        title="Delivery"',
    '      {enabled && (\n        <>',
    '      <SettingsSection title="Delivery" icon={Bell} description="Your in-app notification inbox is available from the bell in the top bar.">\n        <p className="text-sm text-sol-text-muted">Phone push, email delivery and system-wide presence detection are not configured in this local version.</p>\n      </SettingsSection>\n\n',
  ),
  patch(
    'components/simple/laneBoot.ts',
    'export const LANE_BOOT_TITLE = "Codecast";',
    'export const LANE_BOOT_TITLE = "ColloSys";',
  ),
  // The upstream browser-to-desktop handoff is disabled by our local launcher.
  // Remove its dead, branded overlay; keep protocol/storage compatibility code.
  range('index.html', '    <div id="cc-handoff">', '    <script type="module"', ''),
  patch(
    'app/tasks/[id]/page.tsx',
    'import { ContextChatInput } from "../../../components/ContextChatInput";',
    'import { TaskContextLinks } from "../../../collo/TaskContextLinks";',
  ),
  patch(
    'app/tasks/[id]/page.tsx',
    '<TaskSessionEmpty onStart={() => openCmd("agent_run")} />',
    '<TaskContextLinks projectId={data.project_id} taskId={data._id} />',
  ),
  range(
    'app/tasks/[id]/page.tsx',
    '        {!isInline && (\n          <ContextChatInput',
    '        </div>\n        </div>',
    '',
  ),
  range(
    'components/DashboardLayout.tsx',
    '            {!isMobile && terminalShown && (',
    '            {/* Detached tab window only:',
    '',
  ),
  patch(
    'app/inbox/page.tsx',
    'import { QueuePageClient } from "./QueuePageClient";',
    'import { ProductInbox } from "../../collo/ProductInbox";',
  ),
  patch('app/inbox/page.tsx', '<QueuePageClient />', '<ProductInbox />'),
  patch(
    'components/DashboardLayout.tsx',
    '        <NotificationNudgeBanner />',
    '        {/* Notification availability is shown in Settings; no repeated banner on every page. */}',
  ),
  patch(
    'components/AgentTypeIcon.tsx',
    '  return agentDisplayName(agentType);',
    '  const name = agentDisplayName(agentType);\n  return name === agentType && !["codex", "cursor", "gemini", "opencode", "pi", "grok", "muse"].includes(agentType) ? `Unknown agent (${agentType})` : name;',
  ),
  patch(
    'app/settings/accounts/page.tsx',
    'description="GitHub powers code features; email is how you sign in and how we reach you."',
    'description="Your sign-in identity for ColloSys."',
  ),
  patch(
    'app/settings/accounts/page.tsx',
    '<Button size="sm" onClick={handleConnectGitHub} className="bg-[#24292e] hover:bg-[#1a1e22] text-white">\n              Connect\n            </Button>',
    '<span className="text-xs text-sol-text-muted">Unavailable in local mode</span>',
  ),
  range(
    'app/settings/accounts/page.tsx',
    '      <SettingsSection\n        title="GitHub features"',
    '      <SettingsSection title={<span className="text-sol-red">Danger zone',
    '',
  ),
  patch('index.html', '<body class="font-mono">', '<body class="font-sans">'),
  patch(
    'components/company/CompanyDocument.tsx',
    'const SERIF = { fontFamily: "var(--font-serif)" } as const;',
    'import { ProjectCreate } from "../../collo/ProjectCreate";\nconst SERIF = { fontFamily: "var(--font-ui)" } as const;',
  ),
  patch(
    'components/company/CompanyDocument.tsx',
    '          <StateLine clauses={stateClauses(told)} />',
    '          <StateLine clauses={stateClauses(told)} />\n          {filter === "projects" && <div className="collo-project-create"><ProjectCreate /></div>}',
  ),
  patch(
    'app/projects/[id]/page.tsx',
    'const PROJECT_TABS = ["tasks", "workspaces", "timeline", "about", "line", "expectations"] as const;',
    'import { Activity, MessageSquare, ArrowLeftRight } from "../../../collo/ProductIcons";\nimport { CapturedSessions } from "../../../collo/CapturedSessions";\nimport { ProjectHandoffs } from "../../../collo/ProjectHandoffs";\nconst PROJECT_TABS = ["workspaces", "tasks", "sessions", "handoffs", "timeline", "about", "line", "expectations"] as const;',
  ),
  patch(
    'app/projects/[id]/page.tsx',
    '  { key: "workspaces", label: "Workspaces", icon: History },',
    '  { key: "workspaces", label: "Workspaces", icon: Activity },\n  { key: "sessions", label: "Conversations", icon: MessageSquare },\n  { key: "handoffs", label: "Handoffs", icon: ArrowLeftRight },',
  ),
  patch(
    'app/projects/[id]/page.tsx',
    '      ) : tab === "workspaces" ? (',
    '      ) : tab === "sessions" ? (\n        <CapturedSessions projectId={project._id} />\n      ) : tab === "handoffs" ? (\n        <ProjectHandoffs projectId={project._id} />\n      ) : tab === "workspaces" ? (',
  ),
  patch(
    'app/projects/[id]/page.tsx',
    '  const tabs = lineShown ? TABS : TABS.filter((t) => t.key !== "line");',
    '  const tabs = TABS.filter((t) => t.key !== "line" && t.key !== "expectations");',
  ),
  patch(
    'app/settings/profile/page.tsx',
    'Choose the visual language for every Codecast surface.',
    'Make ColloSys comfortable to work in.',
  ),
  range(
    'app/settings/profile/page.tsx',
    '      {!hosted && (\n        <SettingsField label="Interface style">',
    '      {/* Hosted mode sets your words',
    '',
  ),
  patch(
    'src/main.tsx',
    'import "../app/globals.css";',
    'import "../app/globals.css";\nimport "../collo/product-ui.css";\ndocument.documentElement.dataset.product = "collosys";',
  ),
  patch(
    'lib/theme/builtinThemes.ts',
    'export const BUILTIN_THEMES: readonly ModTheme[] = [',
    'import { productTheme } from "../../collo/productTheme";\nexport const BUILTIN_THEMES: readonly ModTheme[] = [\n  productTheme,',
  ),
  patch(
    'components/DashboardLayout.tsx',
    'const DEFAULT_LAYOUT = { sidebar: 25, main: 75 };',
    'import { ProductHeader } from "../collo/ProductHeader";\nconst DEFAULT_LAYOUT = { sidebar: 17, main: 83 };',
  ),
  patch(
    'components/DashboardLayout.tsx',
    '  const barless = useBarlessShell();',
    '  const barless = false; // One ColloSys shell in both native and browser windows.',
  ),
  patch('components/DashboardLayout.tsx', '        <TopbarRow\n', '        <ProductHeader\n'),
  range(
    'components/DashboardLayout.tsx',
    '          search={\n',
    '          panels={<>',
    `          search={<ErrorBoundary name="GlobalSearch" level="inline"><GlobalSearch /></ErrorBoundary>}
          status={<ErrorBoundary name="SyncStatusChip" level="inline"><SyncStatusChip /></ErrorBoundary>}
          actions={<><NotificationBell /><UserMenu /></>}
`,
  ),
  patch(
    'components/sidebar/SidebarNav.tsx',
    'export function SidebarNavView({',
    'export { ProductNav as SidebarNavView } from "../../collo/ProductNav";\nexport function UpstreamSidebarNavView({',
  ),
  range(
    'components/Sidebar.tsx',
    "      {/* Hosted mode's quiet usage meter:",
    '      <Suspense fallback={null}>',
    '',
  ),
  range(
    'components/Sidebar.tsx',
    '        <Surface name="actions.fleet">',
    '        {!isNarrow && computedDirectories',
    '',
  ),
  patch(
    'components/AgentTypeIcon.tsx',
    'import { LogoMark } from "./Logo";',
    'import { normalizeAgentType } from "../collo/AgentIdentity";\nimport { Question } from "@phosphor-icons/react";\nimport { CODECAST_MARK_ARROW_PATH, CODECAST_MARK_C_PATH, CODECAST_MARK_VIEWBOX } from "@codecast/shared/render/codecastMark";',
  ),
  patch(
    'components/AgentTypeIcon.tsx',
    '  if (agentType === "claude_code") {',
    '  agentType = normalizeAgentType(agentType);\n  if (agentType === "claude_code") {',
  ),
  patch(
    'components/AgentTypeIcon.tsx',
    '<LogoMark monochrome className="h-[64%] w-[64%]" />',
    '<svg className="h-[64%] w-[64%]" viewBox={CODECAST_MARK_VIEWBOX} fill="currentColor"><path d={CODECAST_MARK_C_PATH} /><path d={CODECAST_MARK_ARROW_PATH} /></svg>',
  ),
  patch(
    'components/AgentTypeIcon.tsx',
    '  return null;\n',
    '  return <Question className={className} aria-label="Unknown agent" />;\n',
  ),
  patch(
    'components/AgentTypeIcon.tsx',
    '  if (!agentType) return "Unknown";',
    '  agentType = normalizeAgentType(agentType);\n  if (!agentType) return "Unknown agent";',
  ),
  patch('components/HostedWordmark.tsx', '<span>Codecast</span>', '<span>ColloSys</span>'),
  patch('components/HostedWordmark.tsx', 'var(--pd-font-read, Georgia, serif)', 'var(--font-ui)'),
  range(
    'components/UserMenu.tsx',
    '            {hosted && (\n              <MenuItem icon={Gauge}',
    '          <div className="border-t border-sol-border py-1">\n            <MenuItem icon={LogOut}',
    `            <MenuItem icon={MonitorSmartphone} label="About ColloSys" onClick={() => { setOpen(false); useInboxStore.getState().openSettingsModal("desktop"); }} />
          </div>

`,
  ),
  patch(
    'app/login/page.tsx',
    '<main className="min-h-screen',
    '<main className="collo-auth min-h-screen',
  ),
  patch(
    'app/signup/page.tsx',
    '<main className="min-h-screen',
    '<main className="collo-auth min-h-screen',
  ),
  patch(
    'app/login/page.tsx',
    'Sign in to access your conversations',
    'Welcome back. Pick up where your team left off.',
  ),
  patch(
    'app/login/page.tsx',
    'Sign in with the Codecast account that started this Slack connection.',
    'Sign in to your ColloSys account.',
  ),
  patch(
    'app/login/page.tsx',
    'Sign in with the Codecast account that started connecting your mail and calendar.',
    'Sign in to your ColloSys account.',
  ),
  range(
    'index.html',
    '        <svg class="mark"',
    '        <div class="bar">',
    '        <img class="mark" src="/collo-brand/mark-64.png" width="44" height="44" alt="" />\n',
  ),
  patch(
    'components/settings/SettingsModal.tsx',
    'import ProfilePanel from',
    'import { ProductAbout, ProductConnections } from "../../collo/ProductSettings";\nimport ProfilePanel from',
  ),
  patch(
    'components/settings/SettingsModal.tsx',
    '  "integrations": IntegrationsPanel,',
    '  "integrations": ProductConnections,',
  ),
  patch(
    'components/settings/SettingsModal.tsx',
    '  "desktop": DesktopPanel,',
    '  "desktop": ProductAbout,',
  ),
  range(
    'components/settings/SettingsModal.tsx',
    'const GROUPS:',
    'const ALL_SECTIONS',
    `const GROUPS: { label: string; surface?: DevSurface; sections: NavDef[] }[] = [
  { label: "Your account", sections: [
    { id: "general", label: "Profile & appearance", icon: User, desc: "Your identity and how ColloSys looks", keywords: "name avatar theme" },
    { id: "accounts", label: "Account", icon: KeyRound, desc: "Your sign-in and account", keywords: "email login" },
    { id: "keyboard", label: "Keyboard", icon: Keyboard, desc: "Shortcuts that fit your workflow", keywords: "keys shortcuts" },
    { id: "notifications", label: "Notifications", icon: Bell, desc: "Choose what needs your attention", keywords: "alerts" },
    { id: "sounds", label: "Sounds", icon: Volume2, desc: "Sounds on this device", keywords: "audio volume" },
  ] },
  { label: "Workspace", sections: [
    { id: "team", label: "Team", icon: Users, desc: "People and access", keywords: "members roles" },
    { id: "integrations", label: "Connections", icon: Plug, desc: "Your directories and captured sessions", keywords: "codex sources agent directory" },
    { id: "desktop", label: "About ColloSys", icon: Monitor, desc: "Version, storage and credits", keywords: "version desktop privacy backup" },
  ] },
];

`,
  ),
];
