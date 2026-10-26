// TEST DATA ONLY. Real local Convex; does not start, stop or modify service configuration.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';

const baseline = process.argv.includes('--baseline');
const backend = 'http://127.0.0.1:3408',
  site = 'http://127.0.0.1:3409';
const directory = path.resolve(`.local/codecast-app/backend-audit-${Date.now()}`);
await fs.mkdir(directory, { recursive: true });
const checks = [],
  observations = {};
async function account() {
  const client = new ConvexHttpClient(backend);
  const auth = await client.action('auth:signIn', {
    provider: 'password',
    params: {
      email: `test-backend-${randomUUID()}@example.test`,
      password: `TEST-only-${randomUUID()}`,
      flow: 'signUp',
    },
  });
  assert.ok(auth.tokens?.token);
  client.setAuth(auth.tokens.token);
  return { client, token: auth.tokens.token };
}
async function http(route, { user, device, data } = {}) {
  const response = await fetch(site + route, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...(device ? { 'X-ColloSys-Device': device } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, data: await response.json() };
}
async function grant(user, projectId) {
  const workspaceId = 'workspace-' + randomUUID();
  const issued = await http(`/api/projects/${projectId}/devices`, { user, data: { workspaceId } });
  assert.equal(issued.status, 200, JSON.stringify(issued.data));
  const registered = await http(`/api/projects/${projectId}/workspaces`, {
    device: issued.data.token,
    data: { id: workspaceId, label: 'TEST backend audit directory' },
  });
  assert.equal(registered.status, 200);
  return { workspaceId, token: issued.data.token };
}
const file = (name) => ({
  path: name,
  status: 'added',
  binary: false,
  beforeHash: null,
  afterHash: 'a'.repeat(64),
  size: 4,
  patch: '+test',
  truncated: false,
});
function part(device, checkpointId, ordinal, parts, at, totalFiles = parts) {
  return {
    version: 1,
    id: randomUUID(),
    workspaceId: device.workspaceId,
    occurredAt: at,
    kind: 'checkpoint',
    payload: {
      checkpointId,
      parentId: null,
      label: 'TEST audit checkpoint',
      files: totalFiles ? [file(`part-${ordinal}.txt`)] : [],
      totalFiles,
      part: ordinal,
      parts,
      source: 'local',
      backup: 'local-only',
    },
  };
}
const mark = (label) => {
  checks.push(label);
  console.log('PASS ' + label);
};
function pausedEvent(route, credential, event) {
  const bytes = Buffer.from(JSON.stringify(event));
  let finish;
  const result = new Promise((resolve, reject) => {
    const request = httpRequest(
      site + route,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bytes.length,
          'X-ColloSys-Device': credential,
        },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      },
    );
    request.on('error', reject);
    request.setTimeout(10_000, () =>
      request.destroy(new Error('Audit streamed request timed out')),
    );
    request.write(bytes.subarray(0, 1));
    finish = () => request.end(bytes.subarray(1));
  });
  return { result, finish: () => finish() };
}
try {
  const owner = await account(),
    member = await account(),
    outsider = await account();
  const teamId = await owner.client.mutation('teams:createTeam', {
    name: `TEST audit ${randomUUID().slice(0, 8)}`,
  });
  const team = await owner.client.query('teams:getTeam', { team_id: teamId });
  await member.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
  const project = await owner.client.mutation('projects:webCreate', {
    title: 'TEST backend audit',
    workspace: 'team',
    team_id: teamId,
  });
  const projectId = project.id,
    base = `/api/projects/${projectId}`;
  const device = await grant(owner, projectId);
  const send = (event, credential = device.token) =>
    http(base + '/events', { device: credential, data: event });
  const cp = randomUUID(),
    at = Date.now(),
    first = part(device, cp, 2, 3, at);
  assert.equal((await send(first)).status, 200);
  const duplicatePart = await send({ ...first, id: randomUUID() });
  const conflictingMetadata = await send(part(device, cp, 1, 4, at));
  observations.duplicatePartStatus = duplicatePart.status;
  observations.conflictingMetadataStatus = conflictingMetadata.status;
  if (!baseline) {
    assert.equal(duplicatePart.status, 409);
    assert.equal(conflictingMetadata.status, 409);
    const incomplete = await owner.client.query('collo:checkpointParts', {
      projectId,
      workspaceId: device.workspaceId,
      checkpointId: cp,
    });
    assert.equal(incomplete.complete, false);
    assert.equal(incomplete.receivedParts, 1);
    const retry = await send(first);
    assert.equal(retry.status, 200);
    const finish = await Promise.all([
      send(part(device, cp, 3, 3, at)),
      send(part(device, cp, 1, 3, at)),
    ]);
    assert.ok(
      finish.every((r) => r.status === 200),
      JSON.stringify(finish),
    );
    const complete = await member.client.query('collo:checkpointParts', {
      projectId,
      workspaceId: device.workspaceId,
      checkpointId: cp,
    });
    assert.equal(complete.complete, true);
    assert.equal(complete.receivedParts, 3);
    assert.deepEqual(
      complete.events.map((e) => e.payload.part),
      [1, 2, 3],
    );
    assert.equal(
      (await owner.client.query('collo:eventById', { projectId, eventId: first.id })).id,
      first.id,
    );
    await assert.rejects(
      outsider.client.query('collo:eventById', { projectId, eventId: first.id }),
      /Project access denied/,
    );
    await assert.rejects(
      outsider.client.query('collo:checkpointParts', {
        projectId,
        workspaceId: device.workspaceId,
        checkpointId: cp,
      }),
      /Project access denied/,
    );
    mark(
      'Out-of-order multipart receipts are atomic, consistent, unique and deep-linkable with project access',
    );

    const invalidTotal = part(device, randomUUID(), 1, 1, Date.now(), 2);
    assert.equal((await send(invalidTotal)).status, 409);
    const excessive = part(device, randomUUID(), 1, 20002, Date.now());
    assert.equal((await send(excessive)).status, 400);
    const malformed = await http(base + '/devices', { user: owner, data: null });
    assert.equal(malformed.status, 400);
    mark(
      'Incomplete declared totals, excessive multipart counts and malformed bodies fail explicitly',
    );

    const published = [];
    for (let i = 0; i < 45; i++) {
      const event = {
        version: 1,
        id: randomUUID(),
        workspaceId: device.workspaceId,
        occurredAt: Date.now(),
        kind: 'agent.message',
        payload: {
          adapter: 'codex',
          sessionId: 'TEST-audit',
          messageId: randomUUID(),
          role: 'assistant',
          text: `TEST event ${i}`,
          checkpointId: cp,
          association: 'observed-nearby',
        },
      };
      const ack = await send(event);
      assert.equal(ack.status, 200);
      published.push({ event, ack: ack.data });
    }
    const retries = await Promise.all(Array.from({ length: 8 }, () => send(published[0].event)));
    assert.ok(retries.every((r) => r.status === 200 && r.data.seq === published[0].ack.seq));
    let after = 0;
    const replayed = [];
    for (;;) {
      const page = await member.client.query('collo:replay', { projectId, after });
      assert.ok(page.events.length <= 20);
      replayed.push(...page.events);
      if (!page.hasMore) break;
      assert.ok(page.cursor > after);
      after = page.cursor;
    }
    assert.equal(replayed.length, 48);
    assert.equal(new Set(replayed.map((e) => e.id)).size, 48);
    assert.deepEqual(
      replayed.map((e) => e.seq),
      Array.from({ length: 48 }, (_, i) => i + 1),
    );
    const afterAgents = await owner.client.query('collo:checkpointParts', {
      projectId,
      workspaceId: device.workspaceId,
      checkpointId: cp,
    });
    assert.equal(
      afterAgents.events.length,
      3,
      'Referenced agent messages must not become checkpoint parts',
    );
    const deep = await owner.client.query('collo:eventById', { projectId, eventId: first.id });
    assert.equal(deep.id, first.id, 'Old event must remain addressable beyond first replay page');
    await assert.rejects(
      owner.client.query('collo:replay', { projectId, after: -1 }),
      /Invalid cursor/,
    );
    mark('Acknowledged events replay exactly once across bounded cursor pages and retries');

    // 23 parts exercise ordinal pagination, independent of timeline page order.
    const largeCp = randomUUID(),
      largeAt = Date.now();
    for (let i = 23; i > 0; i--)
      assert.equal((await send(part(device, largeCp, i, 23, largeAt))).status, 200);
    const p1 = await owner.client.query('collo:checkpointParts', {
      projectId,
      workspaceId: device.workspaceId,
      checkpointId: largeCp,
    });
    const p2 = await owner.client.query('collo:checkpointParts', {
      projectId,
      workspaceId: device.workspaceId,
      checkpointId: largeCp,
      afterPart: p1.cursor,
    });
    assert.equal(p1.hasMore, true);
    assert.equal(p2.hasMore, false);
    assert.deepEqual(
      [...p1.events, ...p2.events].map((e) => e.payload.part),
      Array.from({ length: 23 }, (_, i) => i + 1),
    );
    assert.equal(p2.complete, true);
    mark('Checkpoint details paginate by ordinal without losing parts');

    const heavyCp = randomUUID(),
      heavyAt = Date.now();
    for (let ordinal = 1; ordinal <= 3; ordinal++) {
      const event = part(device, heavyCp, ordinal, 3, heavyAt, 30);
      event.payload.files = Array.from({ length: 10 }, (_, i) => ({
        ...file(`large-${ordinal}-${i}.txt`),
        patch: '+'.repeat(48_000),
      }));
      assert.equal((await send(event)).status, 200);
    }
    const heavyPage = await owner.client.query('collo:checkpointParts', {
      projectId,
      workspaceId: device.workspaceId,
      checkpointId: heavyCp,
    });
    assert.equal(heavyPage.events.length, 2);
    assert.equal(heavyPage.hasMore, true);
    const heavyTail = await owner.client.query('collo:checkpointParts', {
      projectId,
      workspaceId: device.workspaceId,
      checkpointId: heavyCp,
      afterPart: heavyPage.cursor,
    });
    assert.equal(heavyTail.events.length, 1);
    assert.equal(heavyTail.complete, true);
    mark('Large checkpoint detail responses obey the byte budget and resume without loss');

    const replaced = await http(base + '/devices', {
      user: owner,
      data: { workspaceId: device.workspaceId },
    });
    assert.equal(replaced.status, 200);
    assert.equal((await send(part(device, randomUUID(), 1, 1, Date.now()))).status, 401);
    await assert.rejects(
      member.client.mutation('collo:revoke', { workspaceId: device.workspaceId }),
      /Workspace owner mismatch/,
    );
    const inFlight = pausedEvent(
      base + '/events',
      replaced.data.token,
      part(device, randomUUID(), 1, 1, Date.now()),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    await owner.client.mutation('collo:revoke', { workspaceId: device.workspaceId });
    inFlight.finish();
    assert.equal(
      await inFlight.result,
      401,
      'Mutation must recheck grants after the complete streamed body arrives',
    );
    assert.equal(
      (await send(part(device, randomUUID(), 1, 1, Date.now()), replaced.data.token)).status,
      401,
    );
    const memberDevice = await grant(member, projectId);
    const memberMe = await http('/api/me', { user: member });
    await owner.client.mutation('teams:removeMember', {
      team_id: teamId,
      member_user_id: memberMe.data.user.id,
    });
    assert.equal(
      (await send(part(memberDevice, randomUUID(), 1, 1, Date.now()), memberDevice.token)).status,
      403,
    );
    await assert.rejects(
      member.client.query('collo:replay', { projectId, after: 0 }),
      /Project access denied/,
    );
    await member.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
    mark('Device rotation, owner-only revoke and live team membership gate writes and reads');
  }

  // Nine current seats, two simultaneous joins competing for the final seat.
  for (let i = 0; i < 7; i++) {
    const user = await account();
    await user.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
  }
  const extraA = await account(),
    extraB = await account();
  const joins = await Promise.allSettled(
    [extraA, extraB].map((a) =>
      a.client.mutation('teams:joinTeam', { invite_code: team.invite_code }),
    ),
  );
  observations.concurrentFinalSeatSuccesses = joins.filter((r) => r.status === 'fulfilled').length;
  if (!baseline) {
    assert.equal(observations.concurrentFinalSeatSuccesses, 1);
    mark('Concurrent native joins cannot exceed ten team members');
  }

  await owner.client.action('auth:signOut', {});
  const extension = await http('/api/me', { user: owner });
  assert.equal(extension.status, 401);
  const staleRead = await owner.client.query('projects:webGet', { id: projectId }).then(
    () => true,
    () => false,
  );
  const staleWrite = await owner.client
    .mutation('projects:webCreate', { title: 'TEST stale revoked session', workspace: 'personal' })
    .then(
      () => true,
      () => false,
    );
  observations.revokedJwtNativeReadAccepted = staleRead;
  observations.revokedJwtNativeWriteAccepted = staleWrite;
  if (!baseline) {
    assert.equal(staleRead, false);
    assert.equal(staleWrite, false);
    await assert.rejects(owner.client.query('syncLog:getHeads', {}), /Session expired/);
    await assert.rejects(owner.client.query('buckets:webList', {}), /Session expired/);
    const staleReplay = await fetch(site + '/cli/replays/chunk?replay=TEST-audit-missing&seq=0', {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.equal(staleReplay.status, 401);
    await assert.rejects(
      owner.client.action('artifactsHttp:sourceForWeb', {
        slug: 'TEST-backend-audit-nonexistent',
      }),
      /Session expired/,
    );
    const anonymous = new ConvexHttpClient(backend);
    assert.ok(await anonymous.query('auth:signInProviders', {}));
    mark(
      'Logout invalidates native project reads/writes while anonymous sign-in discovery remains usable',
    );
  }
  console.log(JSON.stringify({ baseline, observations, directory }, null, 2));
} catch (error) {
  observations.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  await fs.writeFile(
    path.join(directory, 'result.json'),
    JSON.stringify({ baseline, checks, observations, passed: !process.exitCode }, null, 2),
  );
  console.log('Evidence: ' + directory);
}
