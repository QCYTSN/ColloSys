// Real local fixture data. No mocked responses and no restore writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
const saved = JSON.parse(await fs.readFile('.local/product-ui-context.json', 'utf8'));
export const account = JSON.parse(
  await fs.readFile(path.join(saved.acceptanceDir, 'restart-test.json'), 'utf8'),
);
export async function signIn(credentials) {
  const client = new ConvexHttpClient('http://127.0.0.1:3408');
  const result = await client.action('auth:signIn', {
    provider: 'password',
    params: { ...credentials, flow: 'signIn' },
  });
  client.setAuth(result.tokens.token);
  return { client, token: result.tokens.token };
}
export async function eventually(run, timeout = 60000) {
  const end = Date.now() + timeout;
  let error;
  while (Date.now() < end) {
    try {
      return await run();
    } catch (e) {
      error = e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw error;
}
export async function denseFixture() {
  const a = await signIn(account.a),
    b = await signIn(account.b);
  const configPath = '.local/refinement-fixture.json';
  try {
    const saved = JSON.parse(await fs.readFile(configPath, 'utf8'));
    assert.ok(await a.client.query('collo:projectByRef', { reference: saved.projectId }));
    return { ...saved, a, b };
  } catch {}
  const evidence = path.resolve('.local', `refinement-${Date.now()}`),
    root = path.join(evidence, 'TEST-independent-directory');
  await fs.mkdir(root, { recursive: true });
  for (let i = 1; i <= 32; i++)
    await fs.writeFile(
      path.join(root, `TEST-source-${String(i).padStart(2, '0')}.ts`),
      `// TEST FILE: review navigation ${i}\nexport const item${i} = ${i};\n`,
    );
  const teamId = await a.client.mutation('teams:createTeam', {
    name: `TEST refinement ${randomUUID().slice(0, 8)}`,
  });
  const team = await a.client.query('teams:getTeam', { team_id: teamId });
  await b.client.mutation('teams:joinTeam', { invite_code: team.invite_code }); // Local test enrollment, no message sent.
  const project = await a.client.mutation('projects:webCreate', {
    title: 'TEST dense reading · 团队上下文与长会话',
    workspace: 'team',
    team_id: teamId,
  });
  const pair = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
  const local = async (route, body, endpoint = 'http://127.0.0.1:3411') => {
    const response = await fetch(endpoint + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${a.token}`,
        'Content-Type': 'application/json',
        'X-ColloSys-Pairing': pair,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    assert.ok(response.ok, `${route}: ${result.error ?? response.status}`);
    return result;
  };
  const connector = await local('/api/connectors/create', {
    root,
    projectId: project.id,
    label: 'TEST dense source',
    confirmed: true,
  });
  const sessionId = `test-refinement-${randomUUID()}`,
    log = path.join(evidence, 'TEST-codex-reading.jsonl');
  const lines = [
    { type: 'session_meta', payload: { id: sessionId, cwd: root } },
    ...Array.from({ length: 65 }, (_, i) => ({
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      type: 'response_item',
      payload: {
        type: 'message',
        role: i % 2 ? 'assistant' : 'user',
        channel: 'final',
        content: [
          {
            type: i % 2 ? 'output_text' : 'input_text',
            text: `TEST READING ${String(i + 1).padStart(2, '0')} · 检查会话返回后的位置\n\nThis is explicit local acceptance data, captured through the authorized Codex adapter. Review the saved changes in TEST-source-${String((i % 32) + 1).padStart(2, '0')}.ts.\n\n${'A stable content anchor should survive pagination, navigation and a change of viewport. '.repeat(4)}`,
          },
        ],
      },
    })),
  ];
  await fs.writeFile(log, lines.map((x) => JSON.stringify(x)).join('\n') + '\n');
  await local('/api/agent/preview', { path: log }, connector.url);
  await local(
    '/api/agent/connect',
    { path: log, importHistory: true, confirmed: true },
    connector.url,
  );
  const session = await eventually(async () => {
    const page = await a.client.query('colloSessions:list', {
      projectId: project.id,
      paginationOpts: { numItems: 30, cursor: null },
    });
    const row = page.page.find((s) => s.sessionId === sessionId);
    assert.equal(row?.messageCount, 65);
    return row;
  });
  const task = await a.client.mutation('tasks:webCreate', {
    title: 'TEST refinement · Review long content and keep the draft',
    workspace: 'team',
    team_id: teamId,
    project_id: project.id,
  });
  const data = {
    projectId: project.id,
    projectShort: project.short_id,
    teamId,
    sessionId,
    workspaceId: session.workspaceId,
    taskId: task.id,
    evidence,
  };
  await fs.writeFile(configPath, JSON.stringify(data, null, 2));
  return { ...data, a, b };
}
