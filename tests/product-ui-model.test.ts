import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentType } from '../integrations/codecast/web/AgentIdentity';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const { productUiPatches } = (await import(
  new URL('../integrations/codecast/product-ui-patches.mjs', import.meta.url).href
)) as {
  productUiPatches: Array<{ file: string; before: string; after: string }>;
};
test('Agent aliases keep executor identity without inventing a capture capability', () => {
  for (const id of ['codex', 'codex_cli', 'codex-cli', ' OpenAI_Codex '])
    assert.equal(normalizeAgentType(id), 'codex');
  for (const id of ['claude', 'claude_code', 'claude-code'])
    assert.equal(normalizeAgentType(id), 'claude_code');
  assert.equal(normalizeAgentType('future-executor'), 'future-executor');
  assert.equal(normalizeAgentType(undefined), '');
  assert.equal(
    normalizeAgentType('gpt-6'),
    'gpt-6',
    'A model name is never relabeled as an executor',
  );
  assert.equal(normalizeAgentType('manual'), 'manual', 'Manual activity never becomes Codex');
});
test('Offline lazy-load failure retains the workspace and does not spend the stale-build reload budget', () => {
  const patch = productUiPatches.find((p) => p.file.endsWith('/lib/chunkReloadGuard.ts'))!;
  const source = fs
    .readFileSync(
      new URL('../third_party/codecast/upstream/' + patch.file, import.meta.url),
      'utf8',
    )
    .replaceAll('\r\n', '\n')
    .replace(patch.before, patch.after);
  const storage = new Map<string, string>();
  let reloads = 0;
  const context = {
    exports: {} as { tryReloadForStaleChunk: () => boolean },
    navigator: { onLine: false },
    sessionStorage: {
      getItem: (k: string) => storage.get(k),
      setItem: (k: string, v: string) => storage.set(k, v),
    },
    window: { location: { reload: () => reloads++ } },
  };
  vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    context,
  );
  assert.equal(context.exports.tryReloadForStaleChunk(), false);
  assert.equal(reloads, 0);
  assert.equal(storage.size, 0);
  context.navigator.onLine = true;
  assert.equal(context.exports.tryReloadForStaleChunk(), true);
  assert.equal(context.exports.tryReloadForStaleChunk(), false);
  assert.equal(reloads, 1);
});
