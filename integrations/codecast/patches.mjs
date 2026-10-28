// Each replacement must occur exactly once in the pinned upstream source.
// The original tree is never edited; prepare materializes a complete fork.
import productPatches from './product-patches.json' with { type: 'json' };
import { backendPatches } from './backend-patches.mjs';
import { nativeBackendPatches } from './native-backend-patches.mjs';
import frontendPatches from './frontend-patches.mjs';
import { designPatches } from './design-patches.mjs';
import { productUiPatches } from './product-ui-patches.mjs';
import { refinementPatches } from './refinement-patches.mjs';
import { completionPatches } from './completion-patches.mjs';
import { authStoragePatches } from './auth-storage-patches.mjs';
export const patches = [
  ...productPatches,
  ...backendPatches,
  ...nativeBackendPatches,
  ...frontendPatches,
  ...designPatches,
  {
    file: 'packages/web/components/AuthProviderButtons.tsx',
    before:
      '    desktop: openExternal\n      ? { openExternal, deviceName: "Codecast Desktop", origin: window.location.origin }\n      : null,',
    after: '    desktop: null, // Local password sign-in stays inside the product window.',
  },
  {
    file: 'packages/web/tailwind.config.ts',
    before: '    "./src/**/*.{js,ts,jsx,tsx}",',
    after: '    "./src/**/*.{js,ts,jsx,tsx}",\n    "./collo/**/*.{js,ts,jsx,tsx}",',
  },
  {
    file: 'packages/convex/convex/schema.ts',
    before: 'export default defineSchema({',
    after:
      'import { colloTables } from "./colloSchema";\nexport default defineSchema({\n  ...colloTables,',
  },
  {
    file: 'packages/convex/convex/http.ts',
    before: 'const http = httpRouter();',
    after:
      'import { serve as colloServe } from "./colloHttp";\nconst http = httpRouter();\nhttp.route({ pathPrefix: "/api/", method: "GET", handler: colloServe });\nhttp.route({ pathPrefix: "/api/", method: "POST", handler: colloServe });\nhttp.route({ pathPrefix: "/api/", method: "PUT", handler: colloServe });\nhttp.route({ pathPrefix: "/api/", method: "DELETE", handler: colloServe });',
  },
  {
    file: 'packages/web/app/projects/[id]/page.tsx',
    before: 'const PROJECT_TABS = ["tasks", "timeline", "about", "line", "expectations"] as const;',
    after:
      'import { LocalWorkspaces } from "../../../collo/LocalWorkspaces";\nconst PROJECT_TABS = ["tasks", "workspaces", "timeline", "about", "line", "expectations"] as const;',
  },
  {
    file: 'packages/web/app/projects/[id]/page.tsx',
    before: '  { key: "timeline", label: "Timeline", icon: History },',
    after:
      '  { key: "workspaces", label: "Workspaces", icon: History },\n  { key: "timeline", label: "Timeline", icon: History },',
  },
  {
    file: 'packages/web/app/projects/[id]/page.tsx',
    before:
      '  const { data: serverProject } = useQueryNoThrow(api.projects.webGet, isConvexId(projectId) ? { id: projectId } : "skip");',
    after:
      '  const { data: serverProject, error: projectError } = useQueryNoThrow(api.collo.projectByRef, { reference: projectId });',
  },
  {
    file: 'packages/web/app/projects/[id]/page.tsx',
    before: '<div className="text-sm text-sol-text-dim">Loading project…</div>',
    after:
      '<div className="text-sm text-sol-text-dim">{projectError ? "Could not load this project. Sign in again or retry." : serverProject === null ? "Project not found or access removed." : "Loading project…"}</div>',
  },
  {
    file: 'packages/web/app/login/page.tsx',
    before:
      '                <Link\n                  href="/forgot-password"\n                  tabIndex={-1}\n                  className="text-sm text-amber-400 hover:text-amber-300 transition-colors"\n                >\n                  Forgot password?\n                </Link>',
    after: '                {/* Email reset is unavailable in the local-only distribution. */}',
  },
  {
    file: 'packages/web/app/login/page.tsx',
    before: 'or sign in with email',
    after: 'Sign in with email',
  },
  {
    file: 'packages/web/app/signup/page.tsx',
    before: 'or sign up with email',
    after: 'Create a local account',
  },
  {
    file: 'packages/web/app/projects/[id]/page.tsx',
    before: '      ) : tab === "timeline" ? (',
    after:
      '      ) : tab === "workspaces" ? (\n        <LocalWorkspaces key={project._id} projectId={project._id} />\n      ) : tab === "timeline" ? (',
  },
  {
    file: 'packages/web/components/AuthProviderButtons.tsx',
    before:
      '    providers: offered?.google ? ["google", ...DEFAULT_OAUTH_PROVIDERS] : DEFAULT_OAUTH_PROVIDERS,',
    after: '    providers: [], // No OAuth providers are configured in the local distribution.',
  },
  {
    file: 'packages/web/components/EmptyState.tsx',
    before:
      'export function EmptyState({ title, description, action, variant, hasOtherSessions }: EmptyStateProps) {',
    after:
      'import { LocalWelcome } from "../collo/LocalWelcome";\nexport function EmptyState({ title, description, action, variant, hasOtherSessions }: EmptyStateProps) {',
  },
  {
    file: 'packages/web/components/EmptyState.tsx',
    before:
      '    return installCli ? <OnboardingEmptyState hasOtherSessions={hasOtherSessions} /> : <HostedEmptyState />;',
    after: '    return <LocalWelcome />;',
  },
  {
    file: 'packages/web/src/App.tsx',
    before: 'const ProjectDetail = lazy(() => import("@/app/projects/[id]/page"));',
    after:
      'import { rememberPairing } from "../collo/local";\nrememberPairing();\nconst ProjectDetail = lazy(() => import("@/app/projects/[id]/page"));',
  },
  {
    file: 'packages/web/components/Logo.tsx',
    before: '          codecast\n',
    after: '          ColloSys\n',
  },
  {
    file: 'packages/web/app/login/page.tsx',
    before: '  const redirectTo = returnTo || "/inbox";',
    after:
      '  const redirectTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/projects";',
  },
  {
    file: 'packages/web/app/signup/page.tsx',
    before: '  const redirectTo = returnTo ? decodeURIComponent(returnTo) : "/inbox";',
    after:
      '  const redirectTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/projects";',
  },
  ...productUiPatches,
  ...refinementPatches,
  ...completionPatches,
  ...authStoragePatches,
];
