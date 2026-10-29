// Private fixture metadata stays under .local. All mutations target TEST teams.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { account, completionFixture } from './product-ui-completion-data.mjs';
export { account };
export async function reviewFixture() {
  const storage = await completionFixture(),
    { a, b } = storage;
  const me = async (token) =>
    (
      await fetch('http://127.0.0.1:3409/api/me', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json())
    ).user.id;
  a.id = await me(a.token);
  b.id = await me(b.token);
  let saved;
  try {
    saved = JSON.parse(await fs.readFile('.local/review-fixes-fixture.json', 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (!saved) {
    const teamId = await a.client.mutation('teams:createTeam', {
      name: 'TEST targeted repairs ' + randomUUID().slice(0, 8),
    });
    const team = await a.client.query('teams:getTeam', { team_id: teamId });
    await b.client.mutation('teams:joinTeam', { invite_code: team.invite_code }); // Local enrollment; no message/invitation sent.
    const title = 'TEST 0ffc13a targeted repairs ' + randomUUID().slice(0, 8);
    const project = await a.client.mutation('projects:webCreate', {
      title,
      workspace: 'team',
      team_id: teamId,
    });
    const other = await a.client.mutation('projects:webCreate', {
      title: title + ' other project',
      workspace: 'team',
      team_id: teamId,
    });
    const send = (sender, recipient, title, projectId = project.id) =>
      sender.client.mutation('colloHandoffs:send', {
        projectId,
        recipient,
        title,
        context: 'TEST isolated handoff scope',
        nextSteps: 'Review TEST context',
        requestId: randomUUID(),
      });
    const oldPending = await send(a, b.id, 'TEST oldest pending A to B');
    const oldOtherRecipient = await send(b, a.id, 'TEST oldest pending B to A');
    for (let i = 0; i < 105; i++) {
      const item = await send(a, b.id, `TEST handled item ${i + 1}`);
      await b.client.mutation('colloHandoffs:respond', {
        id: item.id,
        revision: 1,
        status: i % 2 ? 'declined' : 'accepted',
      });
    }
    const foreign = await send(a, b.id, 'TEST other project pending', other.id);
    const latest = await a.client.query('colloHandoffs:list', {
      projectId: project.id,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    assert.equal(latest.page.length, 10);
    assert.ok(latest.page.every((h) => h.status !== 'pending'));
    saved = {
      teamId,
      projectId: project.id,
      projectShort: project.short_id,
      title,
      otherProjectId: other.id,
      oldPendingId: oldPending.id,
      otherRecipientId: oldOtherRecipient.id,
      foreignId: foreign.id,
      handled: 105,
    };
    await fs.writeFile('.local/review-fixes-fixture.json', JSON.stringify(saved, null, 2));
  }
  return { ...saved, a, b, storage };
}
export async function legacyCheckpoint(f, label = 'TEST legacy verification', conflict = false) {
  const workspaceId = 'workspace-' + randomUUID(),
    checkpointId = randomUUID(),
    at = Date.now();
  const base = `http://127.0.0.1:3409/api/projects/${f.projectId}`;
  const wire = async (route, token, body) => {
    const r = await fetch(base + route, {
      method: 'POST',
      headers: {
        ...(route === '/devices'
          ? { Authorization: `Bearer ${token}` }
          : { 'X-ColloSys-Device': token }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    assert.ok(r.ok, JSON.stringify(j));
    return j;
  };
  const device = await wire('/devices', f.a.token, { workspaceId });
  await wire('/workspaces', device.token, { id: workspaceId, label: 'TEST legacy source' });
  const rows = Array.from({ length: 6 }, (_, i) => {
    const event = {
      version: 1,
      id: randomUUID(),
      workspaceId,
      occurredAt: at,
      kind: 'checkpoint',
      payload: {
        checkpointId,
        parentId: null,
        label,
        files: [
          {
            path: `test-${conflict ? 0 : i}.txt`,
            status: 'added',
            binary: false,
            beforeHash: null,
            afterHash: 'a'.repeat(64),
            size: 4,
            patch: '+TEST',
            truncated: false,
          },
        ],
        totalFiles: 6,
        part: i + 1,
        parts: 6,
        source: 'local',
        backup: 'local-only',
      },
    };
    return {
      projectId: f.projectId,
      eventId: event.id,
      workspaceId,
      userId: f.a.id,
      seq: at + i,
      receivedAt: at,
      fingerprint: createHash('sha256').update(JSON.stringify(event)).digest('hex'),
      event,
    };
  });
  const importRows = async (table, rows) => {
    const file = path.resolve('.local', `TEST-review-import-${table}-${randomUUID()}.jsonl`);
    await fs.writeFile(file, rows.map(JSON.stringify).join('\n'));
    await promisify(execFile)(
      process.execPath,
      [
        path.resolve(
          'third_party/codecast/upstream/packages/convex/node_modules/convex/bin/main.js',
        ),
        'import',
        file,
        '--table',
        table,
        '--append',
        '--yes',
        '--env-file',
        path.resolve('.local/codecast-app/local.env'),
      ],
      {
        cwd: path.resolve('.local/codecast-app/source/packages/convex'),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
  };
  await importRows('collo_events', rows);
  await importRows('collo_checkpoints', [
    {
      projectId: f.projectId,
      workspaceId,
      checkpointId,
      parentId: null,
      label,
      occurredAt: at,
      totalParts: 6,
      totalFiles: 6,
      receivedParts: 6,
      receivedFiles: 6,
      verifiedFromStart: true,
    },
  ]);
  const receipt = await f.a.client.query('collo:checkpointParts', {
    projectId: f.projectId,
    workspaceId,
    checkpointId,
  });
  assert.equal(receipt.integrity, 'legacy-unverified');
  assert.equal(receipt.verificationAvailable, true);
  return { workspaceId, checkpointId };
}
