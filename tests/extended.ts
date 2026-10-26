import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { nodeTool, root, runTool, stopProcess, waitFor, assertPortsFree } from '../scripts/process';
import { ConnectorManager } from '../packages/connector/src/manager';
import { digest } from '../packages/connector/src/files';
const directory = path.join(
    root,
    '.local',
    'extended',
    new Date().toISOString().replaceAll(':', '-'),
  ),
  backend = 'http://127.0.0.1:8967';
await fs.mkdir(directory, { recursive: true });
const persistence = path.join(directory, 'cloudflare'),
  envFile = path.join(directory, 'auth.env'),
  checks: string[] = [];
let worker: ChildProcess | undefined, manager: ConnectorManager | undefined;
const mark = (name: string) => {
  checks.push(name);
  console.log('PASS ' + name);
};
const password = 'TEST-fixture-long-password-' + randomUUID();
async function request(
  route: string,
  token = '',
  data?: unknown,
  method = data === undefined ? 'GET' : 'POST',
) {
  const response = await fetch(backend + route, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(20000),
  });
  return { status: response.status, data: (await response.json()) as any };
}
async function ok(route: string, token = '', data?: unknown, method?: string) {
  const result = await request(route, token, data, method);
  assert.ok(result.status < 300, `${route}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
const register = async (username: string) =>
  ok('/api/auth/register', '', { username, password, name: username });
async function startWorker() {
  worker = nodeTool(
    'wrangler',
    [
      'dev',
      '--config',
      'packages/backend/wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      '8967',
      '--inspector-port',
      '0',
      '--persist-to',
      persistence,
      '--env-file',
      envFile,
      '--var',
      'AUTH_MODE:production',
    ],
    { quiet: true },
  );
  const log = createWriteStream(path.join(directory, 'backend.log'), { flags: 'a' });
  worker.stdout?.pipe(log);
  worker.stderr?.pipe(log);
  await waitFor(backend + '/api/health', 60000, worker);
}
async function local(url: string, route: string, token: string, data?: unknown) {
  const response = await fetch(url + route, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(90000),
  });
  const value = (await response.json()) as any;
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
}
try {
  await assertPortsFree([8967, 8960]);
  await fs.writeFile(envFile, `AUTH_PEPPER=${randomBytes(48).toString('hex')}\n`, { mode: 0o600 });
  for (const file of ['0001.sql', '0002.sql', '0003.sql'])
    await runTool('wrangler', [
      'd1',
      'execute',
      'collosys',
      '--local',
      '--config',
      'packages/backend/wrangler.jsonc',
      '--persist-to',
      persistence,
      '--file',
      'packages/backend/migrations/' + file,
    ]);
  await startWorker();
  assert.equal((await request('/api/dev/login', '', { user: 'alice' })).status, 403);
  const a = await register('fixture_owner'),
    b = await register('fixture_member'),
    c = await register('fixture_viewer');
  assert.equal(
    (
      await request('/api/auth/login', '', {
        username: 'fixture_owner',
        password: 'incorrect-test-password',
      })
    ).status,
    401,
  );
  assert.equal(
    (await ok('/api/auth/login', '', { username: 'fixture_owner', password })).user.id,
    a.user.id,
  );
  mark('Real password accounts authenticate; production mode rejects development login');
  const team = await ok('/api/teams', a.token, { name: 'TEST team' }),
    project = await ok(`/api/teams/${team.id}/projects`, a.token, { name: 'TEST project' }),
    base = `/api/projects/${project.id}`;
  const invite = await ok(`/api/teams/${team.id}/invitations`, a.token, {
    projectId: project.id,
    role: 'editor',
  });
  await ok('/api/invitations/accept', b.token, { token: invite.token });
  assert.equal(
    (await request('/api/invitations/accept', c.token, { token: invite.token })).status,
    410,
  );
  assert.equal((await request(base + '/events', c.token)).status, 403);
  mark('Team/project creation and single-use invitation acceptance enforce membership');
  const revoked = await ok(`/api/teams/${team.id}/invitations`, a.token, {
    projectId: project.id,
    role: 'editor',
  });
  await ok(`/api/teams/${team.id}/invitations/${revoked.id}`, a.token, undefined, 'DELETE');
  assert.equal(
    (await request('/api/invitations/accept', c.token, { token: revoked.token })).status,
    410,
  );
  const vi = await ok(`/api/teams/${team.id}/invitations`, a.token, {
    projectId: project.id,
    role: 'viewer',
  });
  await ok('/api/invitations/accept', c.token, { token: vi.token });
  assert.equal((await request(base + '/tasks', c.token, { title: 'forbidden' })).status, 403);
  assert.equal(
    (await request(`/api/teams/${team.id}/projects`, b.token, { name: 'forged' })).status,
    403,
  );
  mark('Revoked invitations, viewer mutations and non-owner administration are rejected');
  await ok(`/api/teams/${team.id}/project-access`, a.token, {
    projectId: project.id,
    userId: c.user.id,
    role: 'editor',
  });
  assert.equal(
    (await ok(base + '/members', a.token)).members.find((m: { id: string }) => m.id === c.user.id)
      .role,
    'editor',
  );
  await ok(`/api/teams/${team.id}/project-access`, a.token, {
    projectId: project.id,
    userId: c.user.id,
    role: 'viewer',
  });
  const task = await ok(base + '/tasks', a.token, {
    title: 'Implement feature',
    description: 'TEST description',
    assignee: b.user.id,
  });
  let state = await ok(base + '/collaboration', b.token);
  const t = state.tasks[0];
  assert.equal(t.id, task.id);
  const update = {
    title: t.title,
    description: t.description,
    assignee: t.assignee,
    status: 'doing',
    version: t.version,
  };
  await ok(base + '/tasks/' + task.id, b.token, update, 'PATCH');
  assert.equal((await request(base + '/tasks/' + task.id, a.token, update, 'PATCH')).status, 409);
  await ok(base + '/comments', b.token, { text: 'TEST comment', taskId: task.id });
  assert.equal((await ok(base + '/collaboration', a.token)).comments[0].text, 'TEST comment');
  mark('Tasks share assignment/status; stale edits rejected; comments persist across members');
  const handoff = await ok(base + '/handoffs', a.token, {
    toUser: b.user.id,
    title: 'TEST handoff',
    context: 'Current progress',
    nextSteps: 'Continue locally',
    eventId: null,
    taskId: task.id,
  });
  assert.equal(
    (await request(base + '/handoffs/' + handoff.id, a.token, { status: 'accepted' }, 'PATCH'))
      .status,
    409,
  );
  await ok(base + '/handoffs/' + handoff.id, b.token, { status: 'accepted' }, 'PATCH');
  assert.equal(
    (await request(base + '/handoffs/' + handoff.id, b.token, { status: 'declined' }, 'PATCH'))
      .status,
    409,
  );
  assert.equal(
    (
      await request(base + '/handoffs', a.token, {
        toUser: b.user.id,
        title: 'bad reference',
        context: 'x',
        nextSteps: '',
        eventId: randomUUID(),
        taskId: null,
      })
    ).status,
    400,
  );
  mark('Handoff requires recipient confirmation and valid project references');
  // Race for the last of ten places: the trigger and D1 batch must keep one invite unconsumed.
  for (let i = 0; i < 6; i++) {
    const account = await register(`fixture_extra_${i}`);
    const inv = await ok(`/api/teams/${team.id}/invitations`, a.token, {
      projectId: null,
      role: 'viewer',
    });
    await ok('/api/invitations/accept', account.token, { token: inv.token });
  }
  const x = await register('fixture_tenth'),
    y = await register('fixture_eleventh');
  const ix = await ok(`/api/teams/${team.id}/invitations`, a.token, {
      projectId: null,
      role: 'viewer',
    }),
    iy = await ok(`/api/teams/${team.id}/invitations`, a.token, {
      projectId: null,
      role: 'viewer',
    });
  const race = await Promise.all([
    request('/api/invitations/accept', x.token, { token: ix.token }),
    request('/api/invitations/accept', y.token, { token: iy.token }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await ok(`/api/teams/${team.id}`, a.token)).members.length, 10);
  mark('Concurrent joins enforce ten-member team capacity transactionally');
  const pairing = randomBytes(32).toString('hex');
  manager = new ConnectorManager(path.join(directory, 'managed'), backend, pairing, 8960);
  await manager.start();
  const manage = async (route: string, token: string, data?: unknown, pair = pairing) => {
    const res = await fetch('http://127.0.0.1:8960/api/' + route, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-ColloSys-Pairing': pair,
        'Content-Type': 'application/json',
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, data: (await res.json()) as any };
  };
  assert.equal((await manage('connectors', a.token, undefined, 'wrong')).status, 403);
  const projectRoot = path.join(directory, 'project-a'),
    bobRoot = path.join(directory, 'project-b');
  await fs.mkdir(projectRoot);
  await fs.mkdir(bobRoot);
  await fs.writeFile(path.join(projectRoot, 'hello.txt'), 'original exact bytes\r\n');
  await fs.writeFile(path.join(projectRoot, 'binary.bin'), Buffer.from([0, 255, 128]));
  await fs.writeFile(path.join(projectRoot, '.env'), 'SECRET=TEST_NOT_SHARED');
  await fs.writeFile(path.join(bobRoot, 'untouched.txt'), 'Bob independent');
  const attached = await manage('connectors/create', a.token, {
    root: projectRoot,
    projectId: project.id,
    label: 'TEST workspace',
    confirmed: true,
  });
  assert.equal(attached.status, 200, JSON.stringify(attached.data));
  const connector = manager.connectors.get(attached.data.workspaceId)!;
  await connector.flush();
  assert.equal((await manage('connectors', b.token)).data.connectors.length, 0);
  assert.equal(
    (await manage('connectors/stop', b.token, { workspaceId: connector.config.workspaceId }))
      .status,
    403,
  );
  mark('Paired local manager attaches a real authorized directory and isolates account ownership');
  const cp = connector.store.latest()!,
    phrase = 'TEST-only-long-archive-passphrase';
  const backup = await local(attached.data.url, '/api/backups/create', a.token, {
    checkpointId: cp.id,
    passphrase: phrase,
    confirmed: true,
  });
  assert.equal(backup.location, 'local-object-storage');
  const list = await ok(base + '/backups', a.token);
  assert.equal(list.backups[0].status, 'complete');
  assert.equal((await ok(base + '/backups', b.token)).backups.length, 0);
  assert.equal((await request(base + '/backups/' + backup.id, b.token)).status, 404);
  mark('AES-GCM encrypted checkpoint backup persists in real local R2 with owner-only access');
  const encrypted = await fetch(backend + base + '/backups/' + backup.id, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const cipher = Buffer.from(await encrypted.arrayBuffer());
  assert.equal(digest(cipher), backup.digest);
  assert.ok(!cipher.includes(Buffer.from('original exact bytes')));
  const over = await request(base + '/backups', a.token, {
    id: randomUUID(),
    checkpointId: cp.id,
    size: 30 * 1024 * 1024,
    digest: 'a'.repeat(64),
  });
  assert.equal(over.status, 400);
  // Reserve 512 MiB total, then one extra byte must fail without creating a record.
  const reservations = [];
  for (let i = 0; i < 21; i++) {
    const id = randomUUID();
    await ok(base + '/backups', a.token, {
      id,
      checkpointId: cp.id,
      size: 24 * 1024 * 1024,
      digest: 'b'.repeat(64),
    });
    reservations.push(id);
  }
  assert.equal(
    (
      await request(base + '/backups', a.token, {
        id: randomUUID(),
        checkpointId: cp.id,
        size: 24 * 1024 * 1024,
        digest: 'c'.repeat(64),
      })
    ).status,
    409,
  );
  for (const id of reservations) await ok(base + '/backups/' + id, a.token, undefined, 'DELETE');
  mark('Backup size and cumulative per-member quota are enforced');
  await manage('connectors/stop', a.token, { workspaceId: connector.config.workspaceId });
  await stopProcess(worker!);
  worker = undefined;
  await startWorker();
  assert.equal((await ok(base + '/collaboration', a.token)).handoffs[0].status, 'accepted');
  assert.equal((await ok(base + '/backups', a.token)).backups[0].id, backup.id);
  mark('Real Worker restart preserves accounts, collaboration and encrypted objects');
  // Recover using a NEW connector with no snapshots, emulating loss of original connector state.
  const freshRoot = path.join(directory, 'fresh-project');
  await fs.mkdir(freshRoot);
  const fresh = await manage('connectors/create', a.token, {
    root: freshRoot,
    projectId: project.id,
    label: 'TEST recovery device',
    confirmed: true,
  });
  assert.equal(fresh.status, 200);
  const recovered = await local(fresh.data.url, '/api/backups/recover', a.token, {
    id: backup.id,
    passphrase: phrase,
    confirmed: true,
  });
  assert.equal(
    await fs.readFile(path.join(recovered.directory, 'hello.txt'), 'utf8'),
    'original exact bytes\r\n',
  );
  assert.deepEqual(
    await fs.readFile(path.join(recovered.directory, 'binary.bin')),
    Buffer.from([0, 255, 128]),
  );
  assert.deepEqual(await fs.readdir(freshRoot), []);
  assert.equal(await fs.readFile(path.join(bobRoot, 'untouched.txt'), 'utf8'), 'Bob independent');
  await assert.rejects(fs.access(path.join(recovered.directory, '.env')));
  mark(
    'Fresh-device recovery verifies original text/binary bytes in a separate directory; both workspaces untouched',
  );
  await ok(`/api/teams/${team.id}/project-access`, a.token, {
    projectId: project.id,
    userId: b.user.id,
    role: null,
  });
  assert.equal((await request(base + '/collaboration', b.token)).status, 403);
  mark('Project access revocation also revokes tasks, comments, handoffs and backups');
  const session = await ok('/api/auth/login', '', { username: 'fixture_owner', password });
  await ok('/api/auth/password', a.token, {
    currentPassword: password,
    password: password + '-changed',
  });
  assert.equal((await request('/api/me', a.token)).status, 401);
  assert.equal((await request('/api/me', session.token)).status, 401);
  await ok('/api/auth/login', '', { username: 'fixture_owner', password: password + '-changed' });
  mark('Password change invalidates all existing sessions');
  for (let i = 0; i < 10; i++)
    await request('/api/auth/login', '', { username: 'unknown_account', password });
  assert.equal(
    (await request('/api/auth/login', '', { username: 'unknown_account', password })).status,
    429,
  );
  mark('Persistent authentication throttling rejects excessive attempts');
  await fs.writeFile(
    path.join(directory, 'result.json'),
    JSON.stringify({ passed: checks.length, checks, at: new Date().toISOString() }, null, 2),
  );
  console.log(`EXTENDED PASSED ${checks.length}: ${directory}`);
} finally {
  await manager?.stop();
  if (worker) await stopProcess(worker);
}
