import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPatch } from 'diff';
import { parsePatch } from '../packages/web/src/components/codecast/patchParser';

test('ported diff parser preserves real old/new line numbers and ignores patch transport headers', () => {
  const input =
    'Index: example.ts\n===================================================================\n--- a/example.ts\n+++ b/example.ts\n@@ -20,2 +20,3 @@\n keep\n-old\n+new\n+extra\n';
  const result = parsePatch(input);
  assert.equal(result.hunks.length, 1);
  assert.deepEqual(
    result.hunks[0].lines.map((l) => [l.type, l.oldLineNumber, l.newLineNumber]),
    [
      ['context', 20, 20],
      ['deletion', 21, undefined],
      ['addition', undefined, 21],
      ['addition', undefined, 22],
    ],
  );
  assert.equal(result.oldContent, 'keep\nold');
  assert.equal(result.newContent, 'keep\nnew\nextra');
});
test('actual saved-file patches retain blank source lines without adding a phantom final row', () => {
  const before = 'first\n\nold\nlast\n',
    after = 'first\n\nnew\nlast\n';
  const parsed = parsePatch(createPatch('test.ts', before, after));
  assert.equal(parsed.oldContent, before.trimEnd());
  assert.equal(parsed.newContent, after.trimEnd());
  assert.equal(parsed.hunks[0].lines.filter((l) => l.type === 'context').length, 3);
});
