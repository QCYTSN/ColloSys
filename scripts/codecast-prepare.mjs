import { readFile, writeFile, mkdir, copyFile, lstat, symlink, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { patches } from '../integrations/codecast/patches.mjs';
import { assertNotRunning } from './codecast-runtime-lock.mjs';
import { buildFingerprint } from './codecast-build-inputs.mjs';
import { prepareDesktop } from './codecast-desktop-prepare.mjs';
import { prepareBrand } from './codecast-brand.mjs';
await assertNotRunning();
const inputFingerprint = await buildFingerprint();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'third_party/codecast/upstream');
const destination = path.join(root, '.local/codecast-app/source');
const manifest = JSON.parse(
  await readFile(path.join(root, 'third_party/codecast/source-manifest.json'), 'utf8'),
);
const ordinary = manifest.filter((e) => e.mode !== '120000');
await mkdir(destination, { recursive: true });
// A copy of the entire tracked project, with explicit, reproducible patches.
// Dependency junctions are build inputs; connector scanning never follows them.
for (let i = 0; i < ordinary.length; i += 64)
  await Promise.all(
    ordinary.slice(i, i + 64).map(async ({ file }) => {
      const target = path.join(destination, file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(source, file), target);
    }),
  );
for (const { file } of ordinary.filter((e) => path.basename(e.file) === 'package.json')) {
  const relative = path.join(path.dirname(file), 'node_modules');
  try {
    if (!(await lstat(path.join(source, relative))).isDirectory()) continue;
    const target = path.join(destination, relative);
    try {
      await lstat(target);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      await symlink(path.join(source, relative), target, 'junction');
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
// The owned native-auth patch resolves the generated platform package directly.
// Its dependencies still come from the installed Convex workspace, not a second
// install and not a junction back to the immutable package's source code.
const nativeAuthDependencies = path.join(destination, 'platform/packages/auth/node_modules');
try {
  await lstat(nativeAuthDependencies);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await symlink(
    path.join(source, 'packages/convex/node_modules'),
    nativeAuthDependencies,
    'junction',
  );
}
for (const patch of patches) {
  const target = path.join(destination, patch.file);
  const content = (await readFile(target, 'utf8')).replaceAll('\r\n', '\n');
  if (content.split(patch.before).length !== 2)
    throw new Error(`Patch anchor changed: ${patch.file}`);
  await writeFile(target, content.replace(patch.before, patch.after));
}
const additions = [
  ...[
    'collo.ts',
    'colloSchema.ts',
    'colloHttp.ts',
    'colloGuards.ts',
    'colloAccess.ts',
    'colloBackups.ts',
    'colloBackupHttp.ts',
    'colloSessions.ts',
    'colloHandoffs.ts',
    'colloCheckpoints.ts',
    'colloNativeAccess.ts',
    'colloCrons.ts',
  ].map((file) => [`convex/${file}`, `packages/convex/convex/${file}`]),
  ...[
    'LocalWorkspaces.tsx',
    'ProductLogo.tsx',
    'AgentIdentity.ts',
    'AgentBadge.tsx',
    'ProductHeader.tsx',
    'ProductProjects.tsx',
    'ProductProjectHeader.tsx',
    'productViewState.ts',
    'useProductPresence.ts',
    'ProductNav.tsx',
    'ProductSettings.tsx',
    'CapturedSessions.tsx',
    'ProjectHandoffs.tsx',
    'ProjectCreate.tsx',
    'ProductIcons.tsx',
    'ProductInbox.tsx',
    'MemberFace.tsx',
    'TaskContextLinks.tsx',
    'colloApi.ts',
    'productTheme.ts',
    'product-ui.css',
    'product-shell.css',
    'LocalWelcome.tsx',
    'local.ts',
    'workspaceTypes.ts',
    'useCollaboration.ts',
    'collaborationModel.ts',
    'DesignLab.tsx',
    'DesignReference.tsx',
    'DesignIcons.tsx',
    'DesignScenario.ts',
    'design-lab.css',
    'ContextWorkbench.tsx',
    'ContextControls.tsx',
    'ContextScenario.ts',
    'ContextModel.ts',
    'ContextReader.tsx',
    'context-workbench.css',
  ].map((file) => [`web/${file}`, `packages/web/collo/${file}`]),
];
for (const [from, to] of additions) {
  await mkdir(path.dirname(path.join(destination, to)), { recursive: true });
  await copyFile(path.join(root, 'integrations/codecast', from), path.join(destination, to));
}
// Product assets only. The full source remains available for reference, but
// upstream marketing, install scripts and domain verification are not shipped.
const publicPrefix = 'packages/web/public/';
const publicDir = path.resolve(root, '.local/codecast-app/product-public');
if (publicDir !== path.join(root, '.local', 'codecast-app', 'product-public')) throw new Error('Unexpected asset output');
try { if ((await lstat(publicDir)).isSymbolicLink()) throw new Error('Linked asset output is not allowed'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
// This exact directory contains generated public assets only, never user data.
await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
const productAssets = new Set([
  'agents',
  'mod-host.html',
  'mod-host.js',
]);
await prepareBrand(root, publicDir, destination);
await writeFile(path.join(destination, 'packages/web/components/Logo.tsx'), 'export { Logo, LogoMark, LogoIcon } from "../collo/ProductLogo";\n');
for (const { file } of ordinary) {
  if (!file.startsWith(publicPrefix)) continue;
  const relative = file.slice(publicPrefix.length);
  if (!productAssets.has(relative.split('/')[0])) continue;
  const target = path.join(root, '.local/codecast-app/product-public', relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(source, file), target);
}
const designAssets = path.join(root, 'integrations/codecast/assets/design');
const publicDesign = path.join(root, '.local/codecast-app/product-public/collo-design');
await mkdir(publicDesign, { recursive: true });
for (const entry of await readdir(designAssets, { withFileTypes: true })) {
  if (!entry.isFile()) throw new Error('Design assets must be ordinary files');
  await copyFile(path.join(designAssets, entry.name), path.join(publicDesign, entry.name));
}
const protocol = path
  .relative(
    path.join(destination, 'packages/convex/convex'),
    path.join(root, 'packages/shared/src/protocol'),
  )
  .replaceAll('\\', '/');
await writeFile(
  path.join(destination, 'packages/convex/convex/colloProtocol.ts'),
  `export * from ${JSON.stringify(protocol)};\n`,
);
const webProtocol = path
  .relative(
    path.join(destination, 'packages/web/collo'),
    path.join(root, 'packages/shared/src/protocol'),
  )
  .replaceAll('\\', '/');
await writeFile(
  path.join(destination, 'packages/web/collo/protocol.ts'),
  `export type * from ${JSON.stringify(webProtocol)};\n`,
);
const touched = [
  ...new Set([
    ...patches.map((p) => p.file),
    ...additions.map((a) => a[1]),
    'packages/convex/convex/colloProtocol.ts',
    'packages/web/collo/protocol.ts',
    'packages/web/collo/productBrand.ts',
  ]),
];
const hashes = await Promise.all(
  touched.map(async (file) => ({
    file,
    sha256: createHash('sha256')
      .update(await readFile(path.join(destination, file)))
      .digest('hex'),
  })),
);
await prepareDesktop();
if ((await buildFingerprint()) !== inputFingerprint)
  throw new Error('Codecast inputs changed during preparation; run the command again.');
await writeFile(
  path.join(root, '.local/codecast-app/fork-manifest.json'),
  JSON.stringify(
    { upstream: '5dfb04f516122fe4f59a61137219b5a4e2e1f9f8', inputFingerprint, changes: hashes },
    null,
    2,
  ),
);
console.log(
  `Prepared complete Codecast fork: ${ordinary.length} upstream files, ${touched.length} explicit changes.`,
);
