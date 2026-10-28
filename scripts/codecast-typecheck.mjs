// Type-check the owned integration against the real, materialized upstream
// types. Do not label this a full upstream check: its unrelated applications
// and tests have their own tooling and dependencies.
import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildFingerprint } from './codecast-build-inputs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, '.local/codecast-app/source');
const manifest = JSON.parse(
  await fs.readFile(path.join(root, '.local/codecast-app/fork-manifest.json'), 'utf8'),
);
if (manifest.inputFingerprint !== (await buildFingerprint()))
  throw new Error(
    'Integration sources changed. Stop the app and run npm run codecast:prepare before checking types.',
  );
const formatHost = {
  getCurrentDirectory: () => root,
  getCanonicalFileName: (file) => file,
  getNewLine: () => '\n',
};
let count = 0;
const diagnostics = [];
for (const [folder, owned] of [
  ['packages/web', 'collo'],
  ['packages/convex/convex', '.'],
]) {
  const base = path.join(source, folder);
  const configPath = path.join(base, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    diagnostics.push(config.error);
    continue;
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, base);
  const files = (await fs.readdir(path.join(base, owned)))
    .filter((file) => /\.tsx?$/.test(file) && (owned === 'collo' || /^collo/.test(file)))
    .map((file) => path.join(base, owned, file));
  if (owned === 'collo')
    files.push(path.join(source, 'platform/packages/auth/src/web/durableAuthStorage.ts'));
  if (!files.length) throw new Error(`No owned integration files found under ${base}`);
  const program = ts.createProgram(files, {
    ...parsed.options,
    ...(owned === 'collo'
      ? {
          paths: {
            ...parsed.options.paths,
            '@platform/auth/web': [path.join(source, 'platform/packages/auth/src/web/index.ts')],
          },
        }
      : {}),
    noEmit: true,
    incremental: false,
    allowImportingTsExtensions: true,
  });
  diagnostics.push(...program.getOptionsDiagnostics());
  for (const file of files) {
    const input = program.getSourceFile(file);
    if (!input) throw new Error(`Missing integration source: ${file}`);
    diagnostics.push(
      ...program.getSyntacticDiagnostics(input),
      ...program.getSemanticDiagnostics(input),
    );
    count++;
  }
}
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
  process.exitCode = 1;
} else
  console.log(
    `Codecast integration typecheck passed (${count} owned files; actual upstream types).`,
  );
