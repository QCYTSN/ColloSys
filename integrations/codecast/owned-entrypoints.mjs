// Stable, reviewable seams. Complete product implementations live in owned
// modules; the materialized fork contains only these compatibility exports.
export const productEntrypoints = {
  'packages/web/app/forgot-password/page.tsx':
    'export { ProductForgotPassword as default } from "../../collo/ProductAuth";\n',
  'packages/web/app/reset-password/page.tsx':
    'export { ProductResetPassword as default } from "../../collo/ProductAuth";\n',
  'packages/web/components/ThemeProvider.tsx':
    'export { ProductAppearanceProvider as ThemeProvider, ThemeContext, useTheme, useThemeLock } from "../collo/ProductAppearance";\nexport type { Theme, VisualStyle } from "../collo/ProductAppearance";\n',
  'packages/web/lib/authRoot.tsx':
    'export { ProductAuthRoot, ProductAuthRoot as CodecastAuthRoot } from "../collo/ProductAuthRoot";\n',
  'packages/web/components/AuthGuard.tsx':
    'export { ProductAuthGuard as AuthGuard } from "../collo/ProductStartup";\n',
  'packages/web/hooks/useCodecastSignOut.ts':
    'export { useProductSignOut as useCodecastSignOut } from "../collo/ProductSignOut";\n',
  'packages/convex/convex/auth.ts':
    'export { auth, signIn, signOut, store, isAuthenticated, signInProviders, productAuthConfig } from "./colloIdentity";\n',
};
