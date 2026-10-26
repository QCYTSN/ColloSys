// Real, isolated regression evidence. No fabricated browser/backend responses.
// Run only while the separately managed local application is already ready:
// node tests/codecast-workbench-audit.mjs .local/codecast-app/acceptance-<timestamp>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';

const base = path.resolve('.local/codecast-app');
const source = path.resolve(process.argv[2] ?? '');
if (path.dirname(source) !== base || !/^acceptance-\d+$/.test(path.basename(source)))
  throw new Error('Pass a completed local Codecast acceptance folder');
const sourceResult = JSON.parse(await fs.readFile(path.join(source, 'result.json'), 'utf8'));
assert.equal(sourceResult.passed, true, 'The source acceptance must have completed successfully');
const credentials = JSON.parse(await fs.readFile(path.join(source, 'restart-test.json'), 'utf8'));
const resumePath =
  process.argv[3] === '--account-only' ? path.resolve(process.argv[4] ?? '') : null;
if (
  resumePath &&
  (path.dirname(resumePath) !== base || !/^workbench-audit-\d+$/.test(path.basename(resumePath)))
)
  throw new Error('Account-only mode requires an isolated workbench audit folder');
const resume = resumePath
  ? JSON.parse(await fs.readFile(path.join(resumePath, 'result.json'), 'utf8'))
  : null;
if (resume)
  assert.ok(resume.checks.length >= 5 && resume.observed.initialEventId && resume.projectId);
const evidence = path.join(base, `workbench-audit-${Date.now()}`);
const root = path.join(evidence, 'TEST-multipart-project');
await fs.mkdir(root, { recursive: true });
const fileCount = 241;
if (!resume)
  await Promise.all(
    Array.from({ length: fileCount }, (_, index) =>
      fs.writeFile(
        path.join(root, `TEST-file-${String(index + 1).padStart(3, '0')}.txt`),
        `TEST FIXTURE: saved file ${index + 1}\n`,
      ),
    ),
  );
const origin = 'http://127.0.0.1:3407';
const backend = 'http://127.0.0.1:3408';
const pairing = (await fs.readFile(path.join(base, 'browser-pairing'), 'utf8')).trim();
const checks = [],
  errors = [];
const observed = { fileCount, expectedBurst: [], actualBurst: [] };
let browser, pageA, pageB, coldPage, a, b, connector, projectId, projectShort, teamId;

async function check(name, action) {
  await action();
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function eventually(action, timeout = 60000) {
  const end = Date.now() + timeout;
  let last;
  do {
    try {
      return await action();
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  } while (Date.now() < end);
  throw last;
}
async function signIn(saved) {
  const client = new ConvexHttpClient(backend);
  const result = await client.action('auth:signIn', {
    provider: 'password',
    params: { ...saved, flow: 'signIn' },
  });
  assert.ok(result.tokens?.token, 'Real password sign-in must create a session');
  client.setAuth(result.tokens.token);
  return { ...saved, client, token: result.tokens.token };
}
async function local(user, route, body, endpoint = 'http://127.0.0.1:3411') {
  const response = await fetch(endpoint + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/json',
      'X-ColloSys-Pairing': pairing,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(125000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status}: ${data.error}`);
  return data;
}
async function loginPage(page, user) {
  await page.goto(`${origin}/login#pair=${encodeURIComponent(pairing)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#email').fill(user.email, { timeout: 60000 });
  await page.locator('#password').fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === '/projects', { timeout: 60000 });
}
async function pageFor(user) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(error.message));
  await loginPage(page, user);
  return page;
}
function projectUrl(eventId) {
  const params = new URLSearchParams({ tab: 'workspaces' });
  if (eventId) params.set('event', eventId);
  return `${origin}/projects/${projectShort ?? projectId}?${params}`;
}
async function openProject(page, eventId) {
  await page.goto(projectUrl(eventId), { waitUntil: 'domcontentloaded' });
  await eventually(async () => {
    if (await page.locator('[data-foreign-switch]').isVisible())
      await page.locator('[data-foreign-switch]').click();
    assert.equal(await page.getByTestId('local-workspaces').isVisible(), true);
  });
}
async function replay(after = 0) {
  const events = [];
  for (;;) {
    const result = await a.client.query('collo:replay', { projectId, after });
    events.push(...result.events);
    if (!result.hasMore) return { events, cursor: result.cursor };
    assert.ok(result.cursor > after, 'Real replay cursor must advance');
    after = result.cursor;
  }
}
async function cachedEvents(page) {
  return page.evaluate((id) => {
    const state = window.__inboxStore?.getState();
    return Object.values(state?.colloEvents ?? {})
      .filter((event) => event.projectId === id)
      .map((event) => ({
        id: event.id,
        seq: event.seq,
        kind: event.kind,
        checkpointId: event.payload.checkpointId,
      }));
  }, projectId);
}
async function completeFiles(page) {
  const detail = page.getByTestId('collaboration-detail');
  await detail.waitFor();
  await eventually(async () => {
    const more = detail.getByRole('button', { name: 'Load remaining files', exact: true });
    if ((await more.isVisible()) && (await more.isEnabled())) await more.click();
    assert.match(
      await detail.getByTestId('checkpoint-completeness').innerText(),
      /241 of 241 file changes.*Complete checkpoint/,
    );
  });
  assert.equal(await detail.locator('section').count(), fileCount);
  await detail.getByText('TEST-file-241.txt', { exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await detail.getByText('TEST-file-241.txt', { exact: true }).isVisible(), true);
}

try {
  a = await signIn(credentials.a);
  b = await signIn(credentials.b);
  const health = await fetch('http://127.0.0.1:3411/health');
  assert.equal(health.status, 200, 'Start the real local application before this test');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  let initialEvent;
  if (resume) {
    projectId = resume.projectId;
    projectShort = resume.projectShort;
    teamId = resume.teamId;
    initialEvent = { id: resume.observed.initialEventId };
    observed.resumedFrom = resumePath;
    pageA = await pageFor(a);
  } else {
    await check(
      'Isolated TEST team and project use existing real accounts and original membership APIs',
      async () => {
        const teamName = `TEST workbench audit ${randomUUID().slice(0, 8)}`;
        teamId = await a.client.mutation('teams:createTeam', { name: teamName });
        const team = await a.client.query('teams:getTeam', { team_id: teamId });
        // Local test enrollment only. This sends no email or invitation message.
        await b.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
        const project = await a.client.mutation('projects:webCreate', {
          title: 'TEST multipart, deep-link and offline workbench',
          workspace: 'team',
          team_id: teamId,
        });
        projectId = project.id;
        projectShort = project.short_id;
        connector = await local(a, '/api/connectors/create', {
          root,
          projectId,
          label: 'TEST workbench source',
          confirmed: true,
        });
        await eventually(async () =>
          assert.equal((await local(a, '/api/status', undefined, connector.url)).pending, 0),
        );
        pageA = await pageFor(a);
        pageB = await pageFor(b);
        await openProject(pageA);
        await openProject(pageB);
      },
    );
    await check(
      '241 real saved files produce multipart transport but one activity with a complete visible file detail',
      async () => {
        const initial = await replay();
        const events = initial.events.filter(
          (event) => event.kind === 'checkpoint' && event.workspaceId === connector.workspaceId,
        );
        assert.ok(
          events.length > 1,
          'Initial capture must genuinely cross the 200-files part boundary',
        );
        initialEvent = events.find((event) => event.payload.part === 1);
        assert.ok(initialEvent);
        assert.equal(new Set(events.map((event) => event.payload.checkpointId)).size, 1);
        assert.equal(
          events.reduce((sum, event) => sum + event.payload.files.length, 0),
          fileCount,
        );
        observed.initialEventId = initialEvent.id;
        observed.initialCheckpointId = initialEvent.payload.checkpointId;
        await eventually(async () => {
          assert.equal(
            await pageB.getByTestId('collaboration-list').locator('[data-event-id]').count(),
            1,
          );
        });
        await pageB.getByTestId('collaboration-list').locator('[data-event-id]').click();
        await completeFiles(pageB);
        await pageB.screenshot({ path: path.join(evidence, 'multipart-detail.png') });
        await pageB.getByRole('button', { name: 'Back to activity', exact: true }).click();
      },
    );
    await check(
      'A disconnected browser catches every event after 45 real new checkpoints without a head gap',
      async () => {
        const before = (await replay()).cursor;
        const cachedBefore = await cachedEvents(pageB);
        assert.ok(cachedBefore.length >= 2);
        await pageB.context().setOffline(true);
        assert.equal(
          await pageB.getByTestId('collaboration-list').locator('[data-event-id]').count(),
          1,
        );
        for (let index = 1; index <= 45; index++) {
          await fs.writeFile(
            path.join(root, 'TEST-offline-burst.txt'),
            `TEST OFFLINE BURST ${index}\n`,
          );
          const checkpoint = await local(a, '/api/capture', {}, connector.url);
          assert.ok(
            checkpoint?.id,
            'Each real forced capture must return its persisted checkpoint',
          );
          observed.expectedBurst.push(checkpoint.id);
        }
        await eventually(
          async () =>
            assert.equal((await local(a, '/api/status', undefined, connector.url)).pending, 0),
          120000,
        );
        const added = (await replay(before)).events;
        const checkpointIds = new Set(
          added
            .filter((event) => event.kind === 'checkpoint')
            .map((event) => event.payload.checkpointId),
        );
        for (const id of observed.expectedBurst)
          assert.ok(
            checkpointIds.has(id),
            `Checkpoint ${id} must be persisted by the real backend`,
          );
        assert.ok(added.length >= 45);
        observed.actualBurst = added.map((event) => ({ id: event.id, seq: event.seq }));
        await pageB.context().setOffline(false);
        await eventually(async () => {
          const cached = new Set((await cachedEvents(pageB)).map((event) => event.id));
          for (const event of added)
            assert.ok(cached.has(event.id), `Live cache missed persisted event seq ${event.seq}`);
        }, 120000);
        await eventually(async () => {
          assert.equal(
            await pageB.getByTestId('collaboration-list').locator('[data-event-id]').count(),
            checkpointIds.size + 1,
          );
        });
        await pageB.screenshot({ path: path.join(evidence, 'offline-catchup.png') });
      },
    );
    await check(
      'An old event opens from a cold short-project deep link without loading earlier activity and survives reload',
      async () => {
        coldPage = await pageFor(b); // New context: no previously viewed event cache.
        await openProject(coldPage, initialEvent.id);
        await completeFiles(coldPage);
        assert.equal(new URL(coldPage.url()).searchParams.get('event'), initialEvent.id);
        await coldPage.reload({ waitUntil: 'domcontentloaded' });
        await completeFiles(coldPage);
        assert.equal(new URL(coldPage.url()).searchParams.get('event'), initialEvent.id);
        await coldPage.getByRole('button', { name: 'Back to activity', exact: true }).click();
        assert.equal(new URL(coldPage.url()).searchParams.has('event'), false);
        await coldPage.goBack();
        await completeFiles(coldPage);
        await coldPage.screenshot({ path: path.join(evidence, 'cold-old-event.png') });
      },
    );
    await check(
      'Revoking membership removes the cached project events and visible checkpoint in both open member windows',
      async () => {
        const members = await a.client.query('teams:getTeamMembers', { team_id: teamId });
        const member = members.find((row) => row.email === b.email);
        assert.ok(member?._id, 'The original member query must resolve the authenticated member');
        await a.client.mutation('teams:removeMember', {
          team_id: teamId,
          member_user_id: member._id,
        });
        await assert.rejects(
          b.client.query('collo:eventById', { projectId, eventId: initialEvent.id }),
          /Project access denied/,
        );
        for (const page of [pageB, coldPage]) {
          await eventually(async () => {
            assert.deepEqual(await cachedEvents(page), []);
            assert.equal(await page.getByText('TEST-file-241.txt', { exact: true }).count(), 0);
            assert.equal(
              await page.getByTestId('collaboration-list').locator('[data-event-id]').count(),
              0,
            );
          });
        }
        await coldPage.screenshot({ path: path.join(evidence, 'revoked-access.png') });
      },
    );
  }
  await check(
    'Original UI sign-out and another account sign-in clear the previous principal collaboration cache',
    async () => {
      await openProject(pageA, initialEvent.id);
      await completeFiles(pageA);
      assert.ok((await cachedEvents(pageA)).length > 0);
      // The upstream first-run theme tour is a real visible overlay. Finish it
      // through its own button; do not mutate store state to bypass the UI.
      if (await pageA.getByText('Color themes', { exact: true }).isVisible())
        await pageA.getByRole('button', { name: 'Done', exact: true }).click();
      const signOut = pageA.getByRole('button', { name: 'Sign out', exact: true });
      await eventually(async () => {
        if (!(await signOut.isVisible()))
          await pageA.getByRole('button', { name: 'User menu', exact: true }).click();
        assert.equal(await signOut.isVisible(), true);
      });
      await signOut.click();
      await pageA.waitForURL((url) => url.pathname === '/login', { timeout: 60000 });
      await loginPage(pageA, b);
      await eventually(async () => assert.deepEqual(await cachedEvents(pageA), []));
      await pageA.goto(projectUrl(initialEvent.id), { waitUntil: 'domcontentloaded' });
      await eventually(async () => {
        assert.deepEqual(await cachedEvents(pageA), []);
        assert.equal(await pageA.getByText('TEST-file-241.txt', { exact: true }).count(), 0);
      });
    },
  );
  assert.deepEqual(errors, [], 'No original-workbench page errors are allowed');
} catch (error) {
  for (const [name, page] of [
    ['alice', pageA],
    ['bob', pageB],
    ['cold', coldPage],
  ]) {
    if (page)
      await page.screenshot({ path: path.join(evidence, `failure-${name}.png`) }).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  // Only the fixture connector created above is stopped. Shared services and
  // original acceptance connectors are owned by the caller and stay untouched.
  if (connector && a)
    await local(a, '/api/connectors/stop', { workspaceId: connector.workspaceId }).catch(
      (error) => {
        errors.push(`Fixture cleanup: ${error.message}`);
        process.exitCode = 1;
      },
    );
  await browser?.close();
  await fs.writeFile(
    path.join(evidence, 'result.json'),
    JSON.stringify(
      {
        passed: !process.exitCode,
        checks,
        errors,
        observed,
        projectId,
        projectShort,
        teamId,
        root,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`Evidence: ${evidence}`);
}
