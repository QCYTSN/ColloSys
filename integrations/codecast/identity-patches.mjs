// Routing and imported SDK adapter only; product behavior is in owned files.
export const identityPatches = [
  {
    file: 'packages/web/components/BreadcrumbBar.tsx',
    before: 'import { projectDotClass } from "../lib/projectColors";',
    after: 'import { ProductProjectGlyph } from "../collo/ProjectIdentity";',
  },
  {
    file: 'packages/web/components/BreadcrumbBar.tsx',
    before:
      '<span className={`w-2 h-2 rotate-45 rounded-[2px] flex-shrink-0 ${projectDotClass({ color: projectColor, title: projectTitle })}`} />',
    after: '<ProductProjectGlyph projectId={projectId} project={{ color: projectColor }} />',
  },
  {
    file: 'packages/web/components/org/lines/lineAtoms.tsx',
    before:
      'export const ProjectGlyph = ({ project, ghost }: { project: Pick<LineProject, "color" | "title">; ghost?: boolean }) => (\n  <span className={cn("h-2 w-2 rotate-45 rounded-[2px]", ghost ? "" : projectDotClass(project))} style={ghost ? { background: "var(--sol-violet)" } : undefined} data-project-glyph />\n);',
    after: 'export { ProductProjectGlyph as ProjectGlyph } from "../../../collo/ProjectIdentity";',
  },
  {
    file: 'packages/web/components/ConversationView.tsx',
    before: '    setNavScrollProgress(progress);\n  }, []);',
    after:
      '    // The captured reader hides this header. Its progress bar is already\n    // updated directly above; do not rerender the transcript for an absent\n    // navigation control on every virtualizer scroll notification.\n    if (!hideHeader) setNavScrollProgress(progress);\n  }, [hideHeader]);',
  },
  {
    file: 'packages/web/components/DesktopProvider.tsx',
    before: 'window.addEventListener("codecast-navigate", handleNavigate);',
    after: 'window.addEventListener("collosys:navigate:v1", handleNavigate);',
  },
  {
    file: 'packages/web/components/DesktopProvider.tsx',
    before: '    onUpdateStatus((s) => setIpc(s));',
    after:
      '    onUpdateStatus((s) => setIpc(s));\n    return () => window.removeEventListener("collosys:navigate:v1", handleNavigate);',
  },
  {
    file: 'packages/web/hooks/useAppWindowRegistry.ts',
    before: 'new CustomEvent("codecast-navigate",',
    after: 'new CustomEvent("collosys:navigate:v1",',
  },
  {
    file: 'packages/web/components/DashboardLayout.tsx',
    before: '(window as any).__CODECAST_NEW_SESSION = open;',
    after: '(window as any).__COLLOSYS_NEW_SESSION_V1 = open;',
  },
  {
    file: 'packages/web/components/DashboardLayout.tsx',
    before: 'delete (window as any).__CODECAST_NEW_SESSION;',
    after: 'delete (window as any).__COLLOSYS_NEW_SESSION_V1;',
  },
  ...[
    ['popover', 'PopoverTrigger', 'PopoverPrimitive.Trigger', 'ProductPopoverTrigger'],
    [
      'dropdown-menu',
      'DropdownMenuTrigger',
      'DropdownMenuPrimitive.Trigger',
      'ProductDropdownTrigger',
    ],
    ['dialog', 'DialogTrigger', 'DialogPrimitive.Trigger', 'ProductDialogTrigger'],
    ['sheet', 'SheetTrigger', 'SheetPrimitive.Trigger', 'ProductSheetTrigger'],
  ].map(([file, name, primitive, owned]) => ({
    file: `packages/web/components/ui/${file}.tsx`,
    before: `const ${name} = ${primitive}`,
    after: `import { ${owned} } from "../../collo/ProductControlTriggers";\nconst ${name} = ${owned}`,
  })),
  {
    file: 'packages/convex/convex/schema.ts',
    before: '  projects: defineTable({\n    user_id:',
    after:
      '  projects: defineTable({\n    identity: v.optional(v.object({ version: v.literal(1), icon: v.string(), tone: v.string() })),\n    identityRevision: v.optional(v.number()),\n    identityLegacy: v.optional(v.object({ icon: v.optional(v.string()), color: v.optional(v.string()) })),\n    user_id:',
  },
  {
    file: 'packages/convex/convex/projects.ts',
    before: 'import { v } from "convex/values";',
    after:
      'import { v } from "convex/values";\nimport { projectIdentityValidator, prepareProjectIdentity } from "./colloProjectIdentity";',
  },
  {
    file: 'packages/convex/convex/projects.ts',
    before: 'export const webCreate = mutation({\n  args: {\n    title: v.string(),',
    after:
      'export const webCreate = mutation({\n  args: {\n    identity: v.optional(projectIdentityValidator),\n    title: v.string(),',
  },
  {
    file: 'packages/convex/convex/projects.ts',
    before: '      color: args.color,\n      icon: args.icon,',
    after:
      '      ...prepareProjectIdentity(args.identity, { color: args.color, icon: args.icon }),',
  },
  {
    file: 'packages/convex/convex/projects.ts',
    before:
      '    for (const [k, val] of Object.entries(fields)) {\n      if (val !== undefined) updates[k] = val === null ? undefined : val;\n    }\n\n    await ctx.db.patch(args.id, updates);',
    after:
      '    for (const [k, val] of Object.entries(fields)) {\n      if (val !== undefined) updates[k] = val === null ? undefined : val;\n    }\n    if (args.icon !== undefined || args.color !== undefined) {\n      const identity = prepareProjectIdentity(undefined, { icon: args.icon ?? project.icon, color: args.color ?? project.color });\n      Object.assign(updates, identity, { identityRevision: (project.identityRevision ?? 0) + 1 });\n    }\n    await ctx.db.patch(args.id, updates);',
  },
  {
    file: 'packages/web/store/inboxStore.ts',
    before: 'export type ProjectItem = {\n  _id: string;',
    after:
      'export type ProjectItem = {\n  identity?: import("../collo/productContracts").ProjectIdentity;\n  identityRevision?: number;\n  identityLegacy?: { icon?: string; color?: string };\n  _id: string;',
  },
  {
    file: 'packages/web/store/inboxStore.ts',
    before: '  createProject: (opts: { title: string; description?: string;',
    after:
      '  createProject: (opts: { title: string; identity?: import("../collo/productContracts").ProjectIdentity; description?: string;',
  },
  {
    file: 'packages/web/app/projects/[id]/page.tsx',
    before: '      <ProductProjectHeader\n        accent=',
    after: '      <ProductProjectHeader\n        project={project}\n        accent=',
  },
  {
    file: 'packages/web/app/settings/profile/page.tsx',
    before: 'import { ThemePicker } from "../../../components/theme/ThemePicker";',
    after:
      'import { ThemePicker } from "../../../components/theme/ThemePicker";\nimport { ProductAppearanceSettings } from "../../../collo/ProductAppearance";',
  },
  {
    file: 'packages/web/app/settings/profile/page.tsx',
    before: '      <AppearanceSection />',
    after: '      <ProductAppearanceSettings />',
  },
  {
    file: 'packages/web/src/App.tsx',
    before: 'import { Routes, Route, Navigate } from "react-router";',
    after:
      'import { Routes, Route, Navigate } from "react-router";\nimport { ProductEntry } from "../collo/ProductStartup";\nimport { ProductOAuthComplete, ProductDesktopAuthorize } from "../collo/ProductOAuth";',
  },
  {
    file: 'packages/web/src/App.tsx',
    before: '<Route index element={<Navigate to="/projects" replace />} />',
    after:
      '<Route index element={<ProductEntry />} />\n            <Route path="auth/complete" element={<ProductOAuthComplete />} />\n            <Route path="auth/desktop" element={<ProductDesktopAuthorize />} />',
  },
];
