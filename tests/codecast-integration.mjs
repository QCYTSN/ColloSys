// Real local integration: real password accounts, native Codecast team/project,
// two on-disk worktrees, durable connector outboxes and actual browser screens.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import {
  ConvexHttpClient,
  ConvexClient,
} from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';

const origin = 'http://127.0.0.1:3407',
  backend = 'http://127.0.0.1:3408',
  site = 'http://127.0.0.1:3409';
const directory = path.resolve(`.local/codecast-app/acceptance-${Date.now()}`);
await fs.mkdir(directory, { recursive: true });
const pairing = await fs.readFile('.local/codecast-app/browser-pairing', 'utf8');
const checks = [],
  errors = [];
let teamName = '';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function check(name, action) {
  await action();
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function eventually(action, timeout = 30000) {
  const end = Date.now() + timeout;
  let last;
  do {
    try {
      return await action();
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 300));
  } while (Date.now() < end);
  throw last;
}
async function account(label) {
  const client = new ConvexHttpClient(backend);
  const email = `test-${label}-${randomUUID()}@example.test`,
    password = `Test-only-${randomUUID()}`;
  const result = await client.action('auth:signIn', {
    provider: 'password',
    params: { email, password, flow: 'signUp' },
  });
  assert.ok(result.tokens?.token, 'Real signup must return a session');
  client.setAuth(result.tokens.token);
  return { client, email, password, token: result.tokens.token };
}
async function request(user, route, body, endpoint = 'http://127.0.0.1:3411') {
  const response = await fetch(endpoint + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/json',
      'X-ColloSys-Pairing': pairing,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
  return data;
}
async function pageFor(user) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/login#pair=${pairing}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180000,
  });
  await page.locator('#email').fill(user.email, { timeout: 180000 });
  await page.locator('#password').fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`${origin}/projects`, { timeout: 60000 });
  // The API setup did not pretend to initialize the browser's workspace store.
  // Use the actual original workspace switcher, just as a member does.
  await page.getByRole('button', { name: 'Personal', exact: true }).click();
  await page.getByRole('menuitem', { name: teamName, exact: true }).click();
  await page.locator('[data-cc-team-label]').filter({ hasText: teamName }).waitFor();
  return page;
}
let a, b, outsider, ca, cb, projectId, projectShort, pageA, pageB;
try {
  await check(
    'Product entry and former website URLs reach local sign-in without marketing pages',
    async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      for (const pathname of ['/', '/pricing', '/download', '/blog/an-inbox-for-your-agents']) {
        await page.goto(origin + pathname, { waitUntil: 'domcontentloaded' });
        await page.waitForURL((url) => url.pathname === '/login', { timeout: 30000 });
        await page.locator('#email').waitFor({ state: 'visible' });
        assert.equal(new URL(page.url()).searchParams.get('return_to'), '/projects');
      }
      const html = await (await fetch(origin)).text();
      assert.ok(html.includes('<title>ColloSys</title>'));
      assert.ok(!html.includes('apple-itunes-app') && !html.includes('Codecast blog'));
      const surface = await (await fetch(origin + '/product-surface.json')).json();
      assert.deepEqual(surface.marketingPages, []);
      for (const asset of ['blog/rss.xml', 'install.ps1', 'install.sh']) {
        await assert.rejects(fs.access(path.resolve('dist/codecast-app', asset)));
      }
      await page.screenshot({ path: path.join(directory, 'product-entry.png') });
      await context.close();
    },
  );
  await check('Real Codecast accounts, team and shared project', async () => {
    a = await account('alice');
    b = await account('bob');
    outsider = await account('outsider');
    teamName = `TEST local ${randomUUID().slice(0, 8)}`;
    const teamId = await a.client.mutation('teams:createTeam', { name: teamName });
    const team = await a.client.query('teams:getTeam', { team_id: teamId });
    // This is a local test enrollment. No invitations or emails are sent.
    await b.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
    const result = await a.client.mutation('projects:webCreate', {
      title: 'TEST shared file workflow',
      workspace: 'team',
      team_id: teamId,
    });
    projectId = result.id;
    projectShort = result.short_id;
    assert.ok(await b.client.query('projects:webGet', { id: projectId }));
  });
  const rootA = path.join(directory, 'alice'),
    rootB = path.join(directory, 'bob');
  await fs.mkdir(rootA);
  await fs.mkdir(rootB);
  for (const root of [rootA, rootB]) {
    await fs.writeFile(path.join(root, 'hello.txt'), 'original\n');
    await fs.writeFile(path.join(root, '.env'), 'SECRET_NOT_TO_SHARE=private\n');
    execFileSync('git', ['init', '-q', root], { windowsHide: true });
    execFileSync('git', ['-C', root, 'add', 'hello.txt'], { windowsHide: true });
  }
  const indexA = await fs.readFile(path.join(rootA, '.git/index'));
  await check('Two real directories connected using scoped device credentials', async () => {
    pageA = await pageFor(a);
    await pageA.goto(`${origin}/projects/${projectId}?tab=workspaces`, {
      waitUntil: 'domcontentloaded',
    });
    await pageA.getByRole('button', { name: 'Connect directory', exact: true }).click();
    const dialog = pageA.getByRole('dialog', { name: 'Connect your directory' });
    await dialog.getByLabel('Directory path', { exact: true }).fill(rootA);
    await dialog.getByLabel('Directory name', { exact: true }).fill('Alice local');
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Connect and share', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    ca = (await request(a, '/api/connectors')).connectors.find((d) => d.root === rootA);
    assert.ok(ca, 'Directory must be created by the actual browser flow');
    cb = await request(b, '/api/connectors/create', {
      root: rootB,
      projectId,
      label: 'Bob local',
      confirmed: true,
    });
    await eventually(async () =>
      assert.equal((await request(a, '/api/status', undefined, ca.url)).pending, 0),
    );
    await eventually(async () =>
      assert.equal((await request(b, '/api/status', undefined, cb.url)).pending, 0),
    );
  });
  const initial = (await request(a, '/api/checkpoints', undefined, ca.url)).checkpoints[0];
  await check('Manual additions, modifications and deletions reach the other member', async () => {
    await fs.writeFile(path.join(rootA, 'hello.txt'), 'edited by Alice\n');
    await fs.writeFile(path.join(rootA, 'new.txt'), 'added by Alice\n');
    await eventually(async () => {
      const page = await b.client.query('collo:replay', { projectId, after: 0 });
      assert.ok(
        page.events.some((e) => e.payload.files?.some((f) => f.patch.includes('edited by Alice'))),
      );
      assert.ok(
        page.events.some((e) =>
          e.payload.files?.some((f) => f.path === 'new.txt' && f.status === 'added'),
        ),
      );
      assert.ok(!JSON.stringify(page).includes('SECRET_NOT_TO_SHARE'));
      assert.ok(page.events.every((e) => !e.payload.files?.some((f) => f.path === '.env')));
    });
    await fs.unlink(path.join(rootA, 'new.txt'));
    await eventually(async () =>
      assert.ok(
        (await b.client.query('collo:replay', { projectId, after: 0 })).events.some((e) =>
          e.payload.files?.some((f) => f.path === 'new.txt' && f.status === 'deleted'),
        ),
      ),
    );
  });
  await check(
    'Original password login and project Workspaces tab render for both members',
    async () => {
      pageB = await pageFor(b);
      for (const page of [pageA, pageB]) {
        await page.goto(`${origin}/projects/${projectId}?tab=workspaces`, {
          waitUntil: 'domcontentloaded',
        });
        await page.getByTestId('local-workspaces').waitFor({ timeout: 60000 });
        await page
          .getByRole('button', { name: /Alice local/ })
          .first()
          .waitFor({ timeout: 30000 });
      }
      await pageB
        .getByRole('button', { name: /Alice local/ })
        .first()
        .click();
      await pageB.screenshot({ path: path.join(directory, 'team-workspaces.png') });
    },
  );
  await check('Pause queues real edits; restart keeps queue and reconnect replays', async () => {
    await request(a, '/api/offline', { offline: true }, ca.url);
    const before = await b.client.query('collo:replay', { projectId, after: 0 });
    await fs.writeFile(path.join(rootA, 'hello.txt'), 'offline saved edit\n');
    await eventually(async () =>
      assert.ok((await request(a, '/api/status', undefined, ca.url)).pending > 0),
    );
    await request(a, '/api/connectors/stop', { workspaceId: ca.workspaceId });
    await request(a, '/api/connectors/start', { workspaceId: ca.workspaceId });
    assert.ok((await request(a, '/api/status', undefined, ca.url)).pending > 0);
    assert.equal(
      (await b.client.query('collo:replay', { projectId, after: before.cursor })).events.length,
      0,
    );
    await request(a, '/api/offline', { offline: false }, ca.url);
    await eventually(async () =>
      assert.equal((await request(a, '/api/status', undefined, ca.url)).pending, 0),
    );
    assert.ok(
      (await b.client.query('collo:replay', { projectId, after: before.cursor })).events.some((e) =>
        e.payload.files?.some((f) => f.patch.includes('offline saved edit')),
      ),
    );
  });
  await check(
    'Duplicate retry is acknowledged once; spoofing, sensitive files and outsiders rejected',
    async () => {
      const config = JSON.parse(
        await fs.readFile(
          path.join('.local/codecast-app/connectors', ca.workspaceId, 'config.json'),
          'utf8',
        ),
      );
      const page = await a.client.query('collo:replay', { projectId, after: 0 });
      const saved = page.events.find((e) => e.workspaceId === ca.workspaceId);
      const { seq, actor, receivedAt, ...event } = saved;
      async function post(body) {
        const r = await fetch(`${site}/api/projects/${projectId}/events`, {
          method: 'POST',
          headers: { 'X-ColloSys-Device': config.token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return [r.status, await r.json()];
      }
      const [status, ack] = await post(event);
      assert.equal(status, 200);
      assert.equal(ack.seq, seq);
      assert.equal((await post({ ...event, workspaceId: cb.workspaceId }))[0], 403);
      assert.equal((await post({ ...event, id: randomUUID(), userId: 'forged' }))[0], 400);
      assert.equal(
        (
          await post({
            ...event,
            id: randomUUID(),
            payload: { ...event.payload, files: [{ ...event.payload.files[0], path: '.env' }] },
          })
        )[0],
        400,
      );
      assert.equal(
        (await post({ ...event, payload: { ...event.payload, label: 'changed same ID' } }))[0],
        409,
      );
      await assert.rejects(
        outsider.client.query('collo:replay', { projectId, after: 0 }),
        /Project access denied/,
      );
      await assert.rejects(request(b, '/api/checkpoints', undefined, ca.url), /403/);
    },
  );
  await check(
    'Stale restore rejected; confirmed restore backs up A and leaves B/index untouched',
    async () => {
      const stale = await request(a, '/api/restore/preview', { checkpointId: initial.id }, ca.url);
      await fs.writeFile(path.join(rootA, 'hello.txt'), 'newer work after preview\n');
      await assert.rejects(
        request(a, '/api/restore/confirm', { previewId: stale.id, confirmed: true }, ca.url),
        /409/,
      );
      const preview = await request(
        a,
        '/api/restore/preview',
        { checkpointId: initial.id },
        ca.url,
      );
      assert.equal(
        await fs.readFile(path.join(preview.directory, 'hello.txt'), 'utf8'),
        'original\n',
      );
      await request(a, '/api/restore/confirm', { previewId: preview.id, confirmed: true }, ca.url);
      assert.equal(await fs.readFile(path.join(rootA, 'hello.txt'), 'utf8'), 'original\n');
      assert.equal(await fs.readFile(path.join(rootB, 'hello.txt'), 'utf8'), 'original\n');
      assert.deepEqual(await fs.readFile(path.join(rootA, '.git/index')), indexA);
      assert.equal(
        await fs.readFile(path.join(rootA, '.env'), 'utf8'),
        'SECRET_NOT_TO_SHARE=private\n',
      );
      const history = await request(a, '/api/checkpoints', undefined, ca.url);
      assert.ok(history.checkpoints.some((cp) => cp.label.includes('恢复前')));
    },
  );
  await check(
    'Real Codex-format fixture is explicitly test data and read through the actual adapter',
    async () => {
      const source = path.join(directory, 'TEST-codex-session.jsonl');
      const lines = [
        { type: 'session_meta', payload: { id: `test-${randomUUID()}`, cwd: rootA } },
        {
          timestamp: new Date().toISOString(),
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            channel: 'final',
            content: [{ type: 'output_text', text: 'TEST FIXTURE: authorized Codex log adapter' }],
          },
        },
      ];
      await fs.writeFile(source, lines.map((x) => JSON.stringify(x)).join('\n') + '\n');
      await request(a, '/api/agent/preview', { path: source }, ca.url);
      await request(
        a,
        '/api/agent/connect',
        { path: source, importHistory: true, confirmed: true },
        ca.url,
      );
      await eventually(async () =>
        assert.ok(
          (await b.client.query('collo:replay', { projectId, after: 0 })).events.some(
            (e) => e.kind === 'agent.message' && e.payload.text.includes('TEST FIXTURE'),
          ),
        ),
      );
    },
  );
  await check('Original UI restore preview opens real on-disk checkpoint', async () => {
    await pageA.getByRole('button', { name: 'Local history', exact: true }).click();
    await pageA
      .getByRole('button', { name: /Preview restore/ })
      .last()
      .click();
    await pageA.getByRole('dialog', { name: 'Preview restore', exact: true }).waitFor();
    await pageA.screenshot({ path: path.join(directory, 'restore-preview.png') });
    await pageA.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  await check(
    'Cold short project links outside the active workspace resolve and switch normally',
    async () => {
      await pageA.getByRole('button', { name: teamName, exact: true }).click();
      await pageA.getByRole('menuitem', { name: 'Personal', exact: true }).click();
      await pageA.goto(`${origin}/projects/${projectShort}`, { waitUntil: 'domcontentloaded' });
      await pageA.locator('[data-foreign-switch]').waitFor();
      await pageA.locator('[data-foreign-switch]').click();
      await pageA.locator('[data-cc-team-label]').filter({ hasText: teamName }).waitFor();
      assert.ok(await a.client.query('collo:projectByRef', { reference: projectShort }));
      assert.equal(
        await outsider.client.query('collo:projectByRef', { reference: projectShort }),
        null,
      );
    },
  );
  await check(
    'Ten independent local WebSocket clients receive a real saved-file event',
    async () => {
      const clients = [],
        seen = new Set();
      const marker = `ten-local-clients-${randomUUID()}`;
      const before = await a.client.query('collo:replay', { projectId, after: 0 });
      try {
        for (let i = 0; i < 10; i++) {
          const client = new ConvexClient(backend);
          clients.push(client);
          client.setAuth(async () => (i % 2 ? b : a).token);
          client.onUpdate('collo:replay', { projectId, after: before.cursor }, (page) => {
            if (page.events.some((e) => e.payload.files?.some((f) => f.patch.includes(marker))))
              seen.add(i);
          });
        }
        await fs.writeFile(path.join(rootA, 'ten.txt'), marker + '\n');
        await eventually(() => assert.equal(seen.size, 10));
      } finally {
        await Promise.all(clients.map((c) => c.close()));
      }
    },
  );
  await check(
    'Signing out invalidates old browser JWT for local access and device minting',
    async () => {
      await a.client.action('auth:signOut', {});
      const staleMe = await fetch(site + '/api/me', {
        headers: { Authorization: `Bearer ${a.token}` },
      });
      assert.equal(staleMe.status, 401);
      await assert.rejects(request(a, '/api/checkpoints', undefined, ca.url), /401/);
      const mint = await fetch(`${site}/api/projects/${projectId}/devices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: ca.workspaceId }),
      });
      assert.equal(mint.status, 401);
    },
  );
  assert.deepEqual(errors, []);
  // Secrets remain local and are intentionally not printed. Restart verification
  // may authenticate again with these real test credentials.
  await fs.writeFile(
    path.join(directory, 'restart-test.json'),
    JSON.stringify({
      a: { email: a.email, password: a.password },
      b: { email: b.email, password: b.password },
      projectId,
      workspaceA: ca.workspaceId,
      rootA,
      rootB,
    }),
    { mode: 0o600 },
  );
} catch (error) {
  if (pageA) await pageA.screenshot({ path: path.join(directory, 'failure.png') }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(directory, 'result.json'),
    JSON.stringify(
      { checks, errors, passed: !process.exitCode, at: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(`Evidence: ${directory}`);
}
