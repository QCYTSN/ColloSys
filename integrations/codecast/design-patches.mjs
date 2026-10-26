// The design sample is a separate route inside the complete product build.
// It never replaces the production workbench or writes real workspace files.
export const designPatches = [
  {
    file: 'packages/web/src/App.tsx',
    before: 'const Login = lazy(() => import("@/app/login/page"));',
    after:
      'const DesignLab = lazy(() => import("../collo/DesignLab"));\nconst ContextWorkbench = lazy(() => import("../collo/ContextWorkbench"));\nconst Login = lazy(() => import("@/app/login/page"));',
  },
  {
    file: 'packages/web/src/App.tsx',
    before: '            {/* The product opens directly into its workbench. */}',
    after:
      '            <Route path="design-lab" element={<E name="DesignLab"><DesignLab /></E>} />\n            <Route path="workbench-preview" element={<E name="ContextWorkbench"><ContextWorkbench /></E>} />\n            {/* The product opens directly into its workbench. */}',
  },
];
