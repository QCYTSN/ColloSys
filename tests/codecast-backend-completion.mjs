// TEST DATA ONLY. Real local accounts, connector HTTP, Convex database and file storage.
// No model invocation, external invitation or production deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpRequest } from 'node:http';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
const site = 'http://127.0.0.1:3409',
  manager = 'http://127.0.0.1:3411';
const afterMode = process.argv[2] === '--after-restart';
const directory = afterMode
  ? path.resolve(process.argv[3])
  : path.resolve(`.local/codecast-app/backend-completion-${Date.now()}`);
await fs.mkdir(directory, { recursive: true });
const pairing = await fs.readFile('.local/codecast-app/browser-pairing', 'utf8');
const checks = [],
  observations = {};
const mark = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Local admin import is used only to recreate persisted records from the prior
// version, never as an application authorization path or a shipped test endpoint.
async function importFixture(table, rows) {
  const file = path.join(directory, `TEST-import-${table}-${randomUUID()}.jsonl`);
  await fs.writeFile(file, rows.map(JSON.stringify).join('\n'));
  await promisify(execFile)(
    process.execPath,
    [
      path.resolve('third_party/codecast/upstream/packages/convex/node_modules/convex/bin/main.js'),
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
}
async function account(saved) {
  const client = new ConvexHttpClient('http://127.0.0.1:3408');
  const email = saved?.email ?? `test-backend-complete-${randomUUID()}@example.test`,
    password = saved?.password ?? `TEST-only-${randomUUID()}`;
  const response = await client.action('auth:signIn', {
    provider: 'password',
    params: { email, password, flow: saved ? 'signIn' : 'signUp' },
  });
  assert.ok(response.tokens?.token);
  client.setAuth(response.tokens.token);
  const me = await fetch(site + '/api/me', {
    headers: { Authorization: `Bearer ${response.tokens.token}` },
  }).then((r) => r.json());
  return { client, email, password, token: response.tokens.token, id: me.user.id };
}
async function local(user, route, body, endpoint = manager) {
  const response = await fetch(endpoint + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/json',
      'X-ColloSys-Pairing': pairing,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
  return data;
}
async function wire(route, credential, method = 'GET', body, user = false) {
  return fetch(site + route, {
    method,
    headers: {
      [user ? 'Authorization' : 'X-ColloSys-Device']: user ? `Bearer ${credential}` : credential,
      'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json',
    },
    ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
}
async function eventually(run) {
  let last;
  for (let i = 0; i < 120; i++) {
    try {
      return await run();
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw last;
}
async function connector(user, root, projectId, label) {
  return local(user, '/api/connectors/create', { root, projectId, label, confirmed: true });
}
function pausedUpload(route, credential, bytes) {
  let finish;
  const promise = new Promise((resolve, reject) => {
    const request = httpRequest(
      site + route,
      {
        method: 'PUT',
        headers: { 'X-ColloSys-Device': credential, 'Content-Length': bytes.length },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      },
    );
    request.on('error', reject);
    request.setTimeout(15000, () => request.destroy(new Error('Timed out')));
    request.write(bytes.subarray(0, 1));
    finish = () => request.end(bytes.subarray(1));
  });
  return { promise, finish: () => finish() };
}
try {
  if (afterMode) {
    const saved = JSON.parse(
      await fs.readFile(path.join(directory, 'restart-private.json'), 'utf8'),
    );
    const a = await account(saved.account);
    const downloaded = await wire(
      `/api/projects/${saved.projectId}/backups/${saved.backupId}`,
      a.token,
      'GET',
      undefined,
      true,
    );
    assert.equal(downloaded.status, 200);
    assert.equal(digest(Buffer.from(await downloaded.arrayBuffer())), saved.digest);
    assert.equal(
      (await a.client.query('colloHandoffs:get', { id: saved.handoffId })).status,
      'accepted',
    );
    const messages = await a.client.query('colloSessions:messages', {
      projectId: saved.projectId,
      workspaceId: saved.workspaceId,
      sessionId: saved.sessionId,
      after: 0,
    });
    assert.equal(messages.messages.length, 20);
    assert.equal(messages.hasMore, true);
    const objects = await a.client.query('colloBackups:list', { projectId: saved.projectId });
    assert.ok(objects.backups.some((b) => b.id === saved.backupId && b.status === 'complete'));
    mark(
      'Backend restart preserves encrypted bytes, completed receipt, session pagination and accepted handoff',
    );
  } else {
    const a = await account(),
      b = await account(),
      outsider = await account();
    const teamId = await a.client.mutation('teams:createTeam', {
      name: `TEST backend completion ${randomUUID().slice(0, 8)}`,
    });
    const team = await a.client.query('teams:getTeam', { team_id: teamId });
    await b.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
    const p = await a.client.mutation('projects:webCreate', {
      title: 'TEST backend completion',
      workspace: 'team',
      team_id: teamId,
    });
    const projectId = p.id,
      base = `/api/projects/${projectId}`;
    const rootA = path.join(directory, 'alice'),
      rootB = path.join(directory, 'bob');
    await fs.mkdir(rootA);
    await fs.mkdir(rootB);
    await fs.writeFile(path.join(rootA, 'original.txt'), 'TEST original backup content\r\n');
    await fs.writeFile(path.join(rootA, 'binary.bin'), Buffer.from([0, 255, 13, 10, 128]));
    await fs.writeFile(path.join(rootA, '.env'), 'SECRET_MUST_NOT_BACKUP=TEST');
    await fs.writeFile(path.join(rootB, 'peer.txt'), 'TEST peer independent');
    const ca = await connector(a, rootA, projectId, 'TEST completion A'),
      cb = await connector(b, rootB, projectId, 'TEST completion B');
    const confA = JSON.parse(
      await fs.readFile(
        path.join('.local/codecast-app/connectors', ca.workspaceId, 'config.json'),
        'utf8',
      ),
    );
    const confB = JSON.parse(
      await fs.readFile(
        path.join('.local/codecast-app/connectors', cb.workspaceId, 'config.json'),
        'utf8',
      ),
    );
    const cp = await local(a, '/api/capture', {}, ca.url);
    await eventually(async () =>
      assert.equal(
        (
          await a.client.query('collo:checkpointParts', {
            projectId,
            workspaceId: ca.workspaceId,
            checkpointId: cp.id,
          })
        ).complete,
        true,
      ),
    );
    const passphrase = 'TEST-only-real-local-backup-passphrase';
    const receipt = await local(
      a,
      '/api/backups/create',
      { checkpointId: cp.id, passphrase, confirmed: true },
      ca.url,
    );
    assert.equal(receipt.verified, true);
    assert.equal(receipt.location, 'local-convex-storage');
    assert.equal(receipt.remote, false);
    const download = await wire(base + '/backups/' + receipt.id, confA.token);
    const encrypted = Buffer.from(await download.arrayBuffer());
    assert.equal(download.status, 200);
    assert.equal(digest(encrypted), receipt.digest);
    assert.ok(!encrypted.includes(Buffer.from('TEST original backup content')));
    assert.equal((await wire(base + '/backups/' + receipt.id, confB.token)).status, 404);
    assert.equal(
      (await wire(base + '/backups', outsider.token, 'GET', undefined, true)).status,
      403,
    );
    assert.equal(
      (await wire(base + '/backups/' + receipt.id, confA.token, 'PUT', encrypted)).status,
      200,
    );
    mark(
      'Real connector encrypts a captured checkpoint, Convex persists verified bytes, retries deduplicate and teammate/outsider reads fail',
    );

    await fs.writeFile(path.join(rootA, 'original.txt'), 'TEST newer work must stay');
    await assert.rejects(
      local(
        a,
        '/api/backups/recover',
        { id: receipt.id, passphrase: 'TEST-wrong-long-passphrase', confirmed: true },
        ca.url,
      ),
    );
    const recovery = await local(
      a,
      '/api/backups/recover',
      { id: receipt.id, passphrase, confirmed: true },
      ca.url,
    );
    assert.equal(
      await fs.readFile(path.join(recovery.directory, 'original.txt'), 'utf8'),
      'TEST original backup content\r\n',
    );
    await assert.rejects(fs.access(path.join(recovery.directory, '.env')));
    const exported = path.join(directory, 'recovered-independent');
    await local(
      a,
      '/api/backups/export',
      { recoveryId: recovery.recoveryId, directory: exported, confirmed: true },
      ca.url,
    );
    const cr = await connector(a, exported, projectId, 'TEST exported recovered directory');
    await eventually(async () =>
      assert.ok((await local(a, '/api/checkpoints', undefined, cr.url)).checkpoints.length),
    );
    assert.equal(
      await fs.readFile(path.join(rootA, 'original.txt'), 'utf8'),
      'TEST newer work must stay',
    );
    assert.equal(await fs.readFile(path.join(rootB, 'peer.txt'), 'utf8'), 'TEST peer independent');
    await assert.rejects(
      local(
        a,
        '/api/backups/export',
        { recoveryId: recovery.recoveryId, directory: rootB, confirmed: true },
        ca.url,
      ),
    );
    mark(
      'Wrong key fails; encrypted recovery exports to a new registered directory while both original working directories remain unchanged',
    );

    const reserve = async (id) =>
      wire(base + '/backups', confA.token, 'POST', {
        id,
        checkpointId: cp.id,
        size: encrypted.length,
        digest: digest(encrypted),
      });
    await a.client.mutation('colloBackups:setQuota', {
      projectId,
      maxCount: 2,
      maxBytes: 24 * 1024 * 1024,
    });
    const quotaIds = [randomUUID(), randomUUID()];
    const reservations = await Promise.all(quotaIds.map(reserve));
    assert.deepEqual(reservations.map((r) => r.status).sort(), [200, 409]);
    const reserved = quotaIds[reservations.findIndex((r) => r.status === 200)];
    assert.equal((await reserve(reserved)).status, 200);
    const listing = await a.client.query('colloBackups:list', { projectId });
    assert.equal(listing.quota.usedCount, 2);
    const bad = Buffer.from(encrypted);
    bad[bad.length - 1] ^= 1;
    assert.equal((await wire(base + '/backups/' + reserved, confA.token, 'PUT', bad)).status, 400);
    assert.equal((await wire(base + '/backups/' + reserved, confA.token)).status, 409);
    await assert.rejects(
      b.client.mutation('colloBackups:setQuota', {
        projectId,
        maxCount: 100,
        maxBytes: 256 * 1024 * 1024,
      }),
      /Only the project owner/,
    );
    assert.equal((await wire(base + '/backups/' + reserved, confA.token, 'DELETE')).status, 200);
    await a.client.mutation('colloBackups:setQuota', {
      projectId,
      maxCount: 100,
      maxBytes: 256 * 1024 * 1024,
    });
    mark(
      'Concurrent quota reservations allow one final slot, same-ID retries do not charge twice, corrupted bytes never become complete',
    );

    // Opaque TEST transport fixture exercises the documented 24 MiB ceiling.
    // Real encryption/decryption is exercised separately by the connector above.
    const large = Buffer.concat([Buffer.from('COLLOSYS1'), randomBytes(24 * 1024 * 1024 - 9)]),
      largeId = randomUUID();
    assert.equal(
      (
        await wire(base + '/backups', confA.token, 'POST', {
          id: largeId,
          checkpointId: cp.id,
          size: large.length,
          digest: digest(large),
        })
      ).status,
      200,
    );
    const largeUploads = await Promise.all(
      [0, 1].map(() => wire(base + '/backups/' + largeId, confA.token, 'PUT', large)),
    );
    assert.ok(
      largeUploads.every((r) => r.status === 200),
      JSON.stringify(largeUploads.map((r) => r.status)),
    );
    const largeRead = await wire(base + '/backups/' + largeId, confA.token);
    assert.equal(largeRead.status, 200);
    assert.equal(digest(Buffer.from(await largeRead.arrayBuffer())), digest(large));
    assert.equal((await wire(base + '/backups/' + largeId, confA.token, 'DELETE')).status, 200);
    assert.equal((await wire(base + '/backups/' + largeId, confA.token)).status, 404);
    mark(
      'Two concurrent 24 MiB uploads produce one durable manifest; streamed download matches the full digest and deletion revokes access',
    );

    const raceId = randomUUID();
    assert.equal((await reserve(raceId)).status, 200);
    const upload = pausedUpload(base + '/backups/' + raceId, confA.token, encrypted);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await wire(base + '/backups/' + raceId, confA.token, 'DELETE')).status, 200);
    assert.equal((await reserve(raceId)).status, 200);
    upload.finish();
    assert.equal(await upload.promise, 409);
    assert.equal((await wire(base + '/backups/' + raceId, confA.token)).status, 409);
    await wire(base + '/backups/' + raceId, confA.token, 'DELETE');
    const extraWorkspace = 'workspace-' + randomUUID();
    const issued = await wire(
      base + '/devices',
      a.token,
      'POST',
      { workspaceId: extraWorkspace },
      true,
    ).then((r) => r.json());
    const revokeId = randomUUID();
    await reserve(revokeId);
    const revoked = pausedUpload(base + '/backups/' + revokeId, issued.token, encrypted);
    await new Promise((r) => setTimeout(r, 200));
    await a.client.mutation('collo:revoke', { workspaceId: extraWorkspace });
    revoked.finish();
    assert.equal(await revoked.promise, 401);
    await wire(base + '/backups/' + revokeId, confA.token, 'DELETE');
    mark(
      'Delete/recreate and device revocation during streamed upload cannot publish stale backup bytes',
    );

    const sessionId = 'TEST-captured-' + randomUUID(),
      log = path.join(directory, 'TEST-codex.jsonl');
    const messages = Array.from({ length: 25 }, (_, i) => ({
      type: 'response_item',
      payload: {
        type: 'message',
        role: i % 2 ? 'assistant' : 'user',
        content: [
          {
            type: i % 2 ? 'output_text' : 'input_text',
            text: `TEST fixture captured message ${i}`,
          },
        ],
      },
    }));
    await fs.writeFile(
      log,
      [{ type: 'session_meta', payload: { id: sessionId, cwd: rootA } }, ...messages]
        .map(JSON.stringify)
        .join('\n') + '\n',
    );
    await local(
      a,
      '/api/agent/connect',
      { path: log, importHistory: true, confirmed: true },
      ca.url,
    );
    const source = { workspaceId: ca.workspaceId, sessionId };
    await eventually(async () => {
      const found = await b.client.query('colloSessions:list', {
        projectId,
        paginationOpts: { numItems: 30, cursor: null },
      });
      assert.equal(found.page.find((s) => s.sessionId === sessionId)?.messageCount, 25);
    });
    const first = await b.client.query('colloSessions:messages', {
      projectId,
      ...source,
      after: 0,
    });
    const last = await b.client.query('colloSessions:messages', {
      projectId,
      ...source,
      after: first.cursor,
    });
    assert.equal(first.messages.length, 20);
    assert.equal(last.messages.length, 5);
    const task = await a.client.mutation('tasks:webCreate', {
      title: 'TEST native task linked to handoff',
      workspace: 'team',
      team_id: teamId,
      project_id: projectId,
    });
    const sendArgs = {
      projectId,
      requestId: randomUUID(),
      recipient: b.id,
      title: 'TEST context handoff',
      context: 'TEST completed capture and backup verification',
      nextSteps: 'TEST review the captured changes',
      source,
      checkpoint: { workspaceId: ca.workspaceId, checkpointId: cp.id },
      taskId: task.id,
    };
    const handoff = await a.client.mutation('colloHandoffs:send', sendArgs);
    const duplicates = await Promise.all(
      Array.from({ length: 4 }, () => a.client.mutation('colloHandoffs:send', sendArgs)),
    );
    assert.ok(duplicates.every((r) => r.id === handoff.id));
    await assert.rejects(
      a.client.mutation('colloHandoffs:send', { ...sendArgs, title: 'different' }),
      /different contents/,
    );
    await assert.rejects(
      a.client.mutation('colloHandoffs:send', {
        ...sendArgs,
        requestId: randomUUID(),
        recipient: outsider.id,
      }),
      /Project access denied/,
    );
    await assert.rejects(
      outsider.client.query('colloHandoffs:get', { id: handoff.id }),
      /Project access denied/,
    );
    const nativeTask = await b.client.query('tasks:webGet', { id: task.id });
    assert.ok(nativeTask.comments.some((c) => c.text.includes('TEST context handoff')));
    assert.equal(nativeTask.comments.filter((c) => c.text.includes('Context handoff:')).length, 1);
    const frozen = await b.client.query('colloHandoffs:get', { id: handoff.id });
    await fs.appendFile(
      log,
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'TEST after handoff must not enter frozen context' },
          ],
        },
      }) + '\n',
    );
    await eventually(async () =>
      assert.equal(
        (
          await b.client.query('colloSessions:list', {
            projectId,
            paginationOpts: { numItems: 30, cursor: null },
          })
        ).page.find((s) => s.sessionId === sessionId).messageCount,
        26,
      ),
    );
    const frozenTail = await b.client.query('colloSessions:messages', {
      projectId,
      ...source,
      after: first.cursor,
      throughSeq: frozen.source.throughSeq,
    });
    assert.equal(frozenTail.messages.length, 5);
    // Re-import after an older local database was restored: changed transport ID
    // and nearby checkpoint must not block the outbox or duplicate source text.
    const original = await a.client.query('collo:eventById', {
      projectId,
      eventId: first.messages[0].eventId,
    });
    const reimport = {
      version: 1,
      id: randomUUID(),
      workspaceId: ca.workspaceId,
      occurredAt: Date.now(),
      kind: 'agent.message',
      payload: { ...original.payload, checkpointId: null },
    };
    const alias = await wire(base + '/events', confA.token, 'POST', reimport).then(async (r) => ({
      status: r.status,
      data: await r.json(),
    }));
    assert.equal(alias.status, 200);
    assert.equal(alias.data.id, reimport.id);
    assert.equal(alias.data.seq, original.seq);
    assert.equal((await wire(base + '/events', confA.token, 'POST', reimport)).status, 200);
    assert.equal(
      (await a.client.query('collo:eventById', { projectId, eventId: reimport.id })).id,
      original.id,
    );
    assert.equal(
      (
        await wire(base + '/events', confA.token, 'POST', {
          ...reimport,
          id: randomUUID(),
          payload: { ...reimport.payload, text: 'conflicting TEST source' },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await b.client.query('colloSessions:list', {
          projectId,
          paginationOpts: { numItems: 30, cursor: null },
        })
      ).page.find((s) => s.sessionId === sessionId).messageCount,
      26,
    );
    const another = await local(a, '/api/capture', {}, ca.url);
    await eventually(async () =>
      assert.equal(
        (
          await a.client.query('collo:checkpointParts', {
            projectId,
            workspaceId: ca.workspaceId,
            checkpointId: another.id,
          })
        ).complete,
        true,
      ),
    );
    const responses = await Promise.allSettled(
      ['accepted', 'declined'].map((status) =>
        b.client.mutation('colloHandoffs:respond', { id: handoff.id, revision: 1, status }),
      ),
    );
    assert.equal(responses.filter((r) => r.status === 'fulfilled').length, 1);
    // Save a separate accepted handoff for deterministic restart validation.
    const accepted = await a.client.mutation('colloHandoffs:send', {
      ...sendArgs,
      requestId: randomUUID(),
      title: 'TEST persistent accepted handoff',
    });
    await b.client.mutation('colloHandoffs:respond', {
      id: accepted.id,
      revision: 1,
      status: 'accepted',
    });
    await b.client.mutation('colloHandoffs:respond', {
      id: accepted.id,
      revision: 1,
      status: 'accepted',
    });
    await assert.rejects(
      a.client.mutation('colloHandoffs:respond', {
        id: accepted.id,
        revision: 1,
        status: 'declined',
      }),
      /Only the recipient/,
    );
    mark(
      'Captured session pages, native task comments, frozen context, idempotent sending and concurrent handoff responses persist consistently',
    );

    const moved = await a.client.mutation('colloHandoffs:send', {
      ...sendArgs,
      requestId: randomUUID(),
      title: 'TEST moved task decline',
    });
    const otherProject = await a.client.mutation('projects:webCreate', {
      title: 'TEST task moved destination',
      workspace: 'team',
      team_id: teamId,
    });
    await a.client.mutation('tasks:webUpdate', {
      short_id: task.short_id,
      project_id: otherProject.id,
    });
    await assert.rejects(
      b.client.mutation('colloHandoffs:respond', { id: moved.id, revision: 1, status: 'accepted' }),
      /same project/,
    );
    await b.client.mutation('colloHandoffs:respond', {
      id: moved.id,
      revision: 1,
      status: 'declined',
    });
    mark(
      'A moved task prevents acceptance but does not trap the recipient in a permanently pending handoff',
    );

    const legacyCp = randomUUID(),
      legacyAt = Date.now();
    const legacyPart = {
      version: 1,
      id: randomUUID(),
      workspaceId: ca.workspaceId,
      occurredAt: legacyAt,
      kind: 'checkpoint',
      payload: {
        checkpointId: legacyCp,
        parentId: null,
        label: 'TEST pre-path-index checkpoint',
        files: [
          {
            path: 'same.txt',
            status: 'added',
            binary: false,
            beforeHash: null,
            afterHash: 'a'.repeat(64),
            size: 4,
            patch: '+TEST',
            truncated: false,
          },
        ],
        totalFiles: 2,
        part: 1,
        parts: 2,
        source: 'local',
        backup: 'local-only',
      },
    };
    // Use a dedicated project to preserve the normal project's event head.
    const migratedProject = await a.client.mutation('projects:webCreate', {
      title: 'TEST old receipt migration',
      workspace: 'personal',
    });
    const migBase = `/api/projects/${migratedProject.id}`,
      workspaceId = 'workspace-' + randomUUID();
    const migToken = await wire(migBase + '/devices', a.token, 'POST', { workspaceId }, true).then(
      (r) => r.json(),
    );
    await wire(migBase + '/workspaces', migToken.token, 'POST', {
      id: workspaceId,
      label: 'TEST migration fixture',
    });
    legacyPart.workspaceId = workspaceId;
    await importFixture('collo_events', [
      {
        projectId: migratedProject.id,
        eventId: legacyPart.id,
        workspaceId,
        userId: a.id,
        seq: 1,
        receivedAt: legacyAt,
        fingerprint: digest(JSON.stringify(legacyPart)),
        event: legacyPart,
      },
    ]);
    await importFixture('collo_heads', [{ projectId: migratedProject.id, seq: 42 }]);
    await importFixture('collo_checkpoints', [
      {
        projectId: migratedProject.id,
        workspaceId,
        checkpointId: legacyCp,
        parentId: null,
        label: legacyPart.payload.label,
        occurredAt: legacyAt,
        totalParts: 2,
        totalFiles: 2,
        receivedParts: 1,
        receivedFiles: 1,
        verifiedFromStart: true,
      },
    ]);
    const duplicated = {
      ...legacyPart,
      id: randomUUID(),
      payload: { ...legacyPart.payload, part: 2 },
    };
    assert.equal((await wire(migBase + '/events', migToken.token, 'POST', duplicated)).status, 409);
    const valid = {
      ...duplicated,
      id: randomUUID(),
      payload: {
        ...duplicated.payload,
        files: [{ ...duplicated.payload.files[0], path: 'other.txt' }],
      },
    };
    assert.equal((await wire(migBase + '/events', migToken.token, 'POST', valid)).status, 200);
    assert.equal(
      (
        await a.client.query('collo:checkpointParts', {
          projectId: migratedProject.id,
          workspaceId,
          checkpointId: legacyCp,
        })
      ).complete,
      true,
    );
    mark(
      'A pre-upgrade multipart receipt is migrated before accepting more parts; duplicate paths fail without corrupting its count',
    );
    const heavyHistory = Array.from({ length: 40 }, (_, i) => {
      const event = {
        ...legacyPart,
        id: randomUUID(),
        payload: {
          ...legacyPart.payload,
          checkpointId: randomUUID(),
          part: 1,
          parts: 1,
          totalFiles: 10,
          files: Array.from({ length: 10 }, (_, j) => ({
            ...legacyPart.payload.files[0],
            path: `TEST-heavy-${i}-${j}.txt`,
            patch: '+'.repeat(48000),
          })),
        },
      };
      return {
        projectId: migratedProject.id,
        eventId: event.id,
        workspaceId,
        userId: a.id,
        seq: i + 2,
        receivedAt: legacyAt,
        fingerprint: digest(JSON.stringify(event)),
        event,
      };
    });
    const oldMessage = {
      version: 1,
      id: randomUUID(),
      workspaceId,
      occurredAt: legacyAt,
      kind: 'agent.message',
      payload: {
        adapter: 'codex',
        sessionId: 'TEST-large-history',
        messageId: randomUUID(),
        role: 'assistant',
        text: 'TEST after 19 MiB of older checkpoint history',
        checkpointId: null,
        association: 'observed-nearby',
      },
    };
    heavyHistory.push({
      projectId: migratedProject.id,
      eventId: oldMessage.id,
      workspaceId,
      userId: a.id,
      seq: 42,
      receivedAt: legacyAt,
      fingerprint: digest(JSON.stringify(oldMessage)),
      event: oldMessage,
    });
    await importFixture('collo_events', heavyHistory);
    let migrationBatches = 0;
    for (;;) {
      const migration = await a.client.mutation('colloSessions:indexHistory', {
        projectId: migratedProject.id,
      });
      migrationBatches++;
      if (migration.done) break;
      assert.ok(migrationBatches < 10);
    }
    assert.ok(migrationBatches >= 3);
    const migratedSessions = await a.client.query('colloSessions:list', {
      projectId: migratedProject.id,
      paginationOpts: { cursor: null, numItems: 30 },
    });
    assert.equal(
      migratedSessions.page.find((s) => s.sessionId === 'TEST-large-history').messageCount,
      1,
    );
    await a.client.mutation('colloSessions:indexHistory', { projectId: migratedProject.id });
    assert.equal(
      (
        await a.client.query('colloSessions:list', {
          projectId: migratedProject.id,
          paginationOpts: { cursor: null, numItems: 30 },
        })
      ).page[0].messageCount,
      1,
    );
    mark(
      'Old session migration advances across 19 MiB of checkpoint history in bounded transactions without duplicate projection',
    );
    await a.client.mutation('teams:removeMember', { team_id: teamId, member_user_id: b.id });
    await assert.rejects(
      b.client.query('colloSessions:messages', { projectId, ...source, after: 0 }),
      /Project access denied/,
    );
    await assert.rejects(
      b.client.query('colloHandoffs:get', { id: accepted.id }),
      /Project access denied/,
    );
    assert.equal((await wire(base + '/backups', confB.token)).status, 403);
    mark(
      'Removing a member immediately revokes captured session, handoff and device backup access',
    );
    await fs.writeFile(
      path.join(directory, 'restart-private.json'),
      JSON.stringify({
        account: { email: a.email, password: a.password },
        projectId,
        backupId: receipt.id,
        digest: receipt.digest,
        handoffId: accepted.id,
        workspaceId: ca.workspaceId,
        sessionId,
      }),
      { mode: 0o600 },
    );
  }
} catch (error) {
  observations.error = error.stack;
  process.exitCode = 1;
  console.error(error);
}
await fs.writeFile(
  path.join(directory, afterMode ? 'restart-result.json' : 'result.json'),
  JSON.stringify({ passed: !process.exitCode, checks, observations }, null, 2),
);
console.log('Evidence: ' + directory);
