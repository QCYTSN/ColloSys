import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleCheckpoint,
  bridgeHead,
  cacheEvents,
  cacheId,
  pageRange,
  permissionFailure,
  readRange,
  samePrincipal,
  type StoredEvent,
  type FeedPage,
  type PartsPage,
} from '../integrations/codecast/web/collaborationModel';

function checkpoint(part: number, parts = 2): StoredEvent {
  return {
    version: 1,
    id: `event-${part}`,
    workspaceId: 'workspace-a',
    occurredAt: 1,
    receivedAt: 2,
    seq: part,
    actor: { id: 'alice', name: 'Alice' },
    kind: 'checkpoint',
    payload: {
      checkpointId: 'checkpoint-a',
      parentId: null,
      label: 'Save',
      totalFiles: parts,
      part,
      parts,
      source: 'local',
      backup: 'local-only',
      files: [
        {
          path: `file-${part}.txt`,
          status: 'added',
          binary: false,
          beforeHash: null,
          afterHash: 'hash',
          size: 1,
          patch: '+a',
          truncated: false,
        },
      ],
    },
  };
}
const summary: PartsPage = {
  events: [],
  cursor: 2,
  hasMore: false,
  receivedParts: 2,
  totalParts: 2,
  complete: true,
  integrity: 'verified',
};
function page(start: number, end: number, isDone = false): FeedPage {
  return {
    page: Array.from({ length: start - end + 1 }, (_, n) => ({
      ...checkpoint(1),
      id: `e-${start - n}`,
      seq: start - n,
    })),
    continueCursor: String(end - 1),
    isDone,
  };
}

test('the live head bridges all pages in a 45-event burst before advancing its watermark', async () => {
  const requests: string[] = [];
  const rows = await bridgeHead(
    page(145, 126),
    100,
    async (cursor) => {
      requests.push(cursor);
      return cursor === '125' ? page(125, 106) : page(105, 86);
    },
    () => true,
  );
  assert.deepEqual(requests, ['125', '105']);
  assert.equal(new Set(rows!.map((row) => row.seq)).size, 60);
  for (let seq = 101; seq <= 145; seq++) assert.ok(rows!.some((row) => row.seq === seq));
});

test('an account epoch change cancels a pending gap read including A -> B -> A', async () => {
  const before = { principalId: 'alice', epoch: 1 };
  let current = before;
  const rows = await bridgeHead(
    page(50, 31),
    1,
    async () => {
      current = { principalId: 'alice', epoch: 3 };
      return page(30, 1, true);
    },
    () => samePrincipal(before, current),
  );
  assert.equal(rows, null);
  assert.equal(samePrincipal(before, { principalId: 'bob', epoch: 1 }), false);
});

test('a repeated cursor fails instead of claiming a complete catch-up', async () => {
  await assert.rejects(
    bridgeHead(
      page(90, 71),
      1,
      async () => page(90, 71),
      () => true,
    ),
    /did not advance/,
  );
});

test('a durable feed range is distinct from a detail cached outside the loaded history', () => {
  const range = pageRange(page(100, 81));
  assert.deepEqual(readRange(JSON.stringify(range)), range);
  assert.equal(readRange('{"head":2,"oldest":9}'), null);
  const rows = cacheEvents('project-a', 'team:alpha', [checkpoint(1)]);
  assert.equal(rows[0]._id, cacheId('project-a', 'event-1'));
  assert.equal(rows[0].projectId, 'project-a');
  assert.equal(rows[0].workspace, 'team:alpha');
  assert.notEqual(cacheId('project-a', 'event-1'), cacheId('project-b', 'event-1'));
});

test('multipart details deduplicate identical parts and order files by part', () => {
  const one = checkpoint(1),
    two = checkpoint(2);
  const result = assembleCheckpoint([two, one, one], one, summary);
  assert.deepEqual(
    result.files.map((file) => file.path),
    ['file-1.txt', 'file-2.txt'],
  );
  assert.equal(result.complete, true);
  assert.equal(result.integrity, 'verified');
});

test('missing, legacy, conflicting, and duplicate-file checkpoints cannot claim completeness', () => {
  const one = checkpoint(1),
    two = checkpoint(2);
  assert.equal(assembleCheckpoint([one], one, summary).complete, false);
  assert.equal(assembleCheckpoint([one, two], one).complete, false);
  const legacy = { ...summary, integrity: 'legacy-unverified' as const, complete: null };
  assert.equal(assembleCheckpoint([one, two], one, legacy).complete, false);
  const conflicting = structuredClone(one);
  if (conflicting.kind === 'checkpoint') conflicting.payload.files[0].patch = '+changed';
  assert.equal(assembleCheckpoint([one, two, conflicting], one, summary).integrity, 'invalid');
  const duplicateFile = structuredClone(two);
  if (duplicateFile.kind === 'checkpoint') duplicateFile.payload.files[0].path = 'file-1.txt';
  assert.equal(assembleCheckpoint([one, duplicateFile], one, summary).complete, false);
  assert.equal(
    assembleCheckpoint([one, two], one, { ...summary, totalParts: 3 }).integrity,
    'invalid',
  );
  assert.equal(
    assembleCheckpoint([one, two], one, { ...summary, receivedParts: 3 }).complete,
    false,
  );
});

test('only confirmed authorization failures purge cache; connection failures do not', () => {
  assert.equal(
    permissionFailure({ data: { status: 403, message: 'Project access denied' } }),
    true,
  );
  assert.equal(permissionFailure({ data: JSON.stringify({ status: 401 }) }), true);
  assert.equal(permissionFailure(new Error('Network request failed')), false);
  assert.equal(permissionFailure({ data: { status: 503 } }), false);
});
