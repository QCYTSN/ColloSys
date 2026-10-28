// Writes exclusively to a fresh TEST team and .local temporary directories.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { account, signIn, eventually } from './product-ui-refinement-data.mjs';
export { account, signIn, eventually };
export const longChinese = '团队协作与上下文连续性'.repeat(6).slice(0, 60);
export const longEnglish = 'UnbrokenProjectTitle'.repeat(7).slice(0, 120);
export const longUrl = `https://example.invalid/${'project-context-and-evidence/'.repeat(8)}source`;
export async function completionFixture() {
  const a = await signIn(account.a),
    b = await signIn(account.b);
  const pairing = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
  const local = async (route, body, endpoint = 'http://127.0.0.1:3411') => {
    const response = await fetch(endpoint + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${a.token}`,
        'Content-Type': 'application/json',
        'X-ColloSys-Pairing': pairing,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json();
    assert.ok(response.ok, `${route}: ${value.error ?? response.status}`);
    return value;
  };
  const saved = await fs
    .readFile('.local/completion-fixture.json', 'utf8')
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
  if (saved) {
    assert.ok(await a.client.query('collo:projectByRef', { reference: saved.projectId }));
    const connector = await eventually(async () => {
      const list = await local('/api/connectors');
      const item = list.connectors.find((d) => d.workspaceId === saved.workspaceId);
      assert.ok(item?.running);
      return item;
    });
    return { ...saved, a, b, local, connector };
  }
  const evidence = path.resolve('.local', `completion-${Date.now()}`),
    root = path.join(evidence, 'TEST-independent-directory');
  await fs.mkdir(root, { recursive: true });
  const longPath =
    Array.from({ length: 4 }, (_, i) => `${i}-context-${'evidence'.repeat(5)}`).join('/') +
    '/same-name.ts';
  for (const relative of ['readme.txt', 'one/same-name.ts', 'two/same-name.ts', longPath]) {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.writeFile(
      path.join(root, relative),
      `// TEST isolated completion fixture\nexport const state = 'original';\n${longUrl}\n`,
    );
  }
  const teamId = await a.client.mutation('teams:createTeam', {
    name: `TEST completion ${randomUUID().slice(0, 8)}`,
  });
  const team = await a.client.query('teams:getTeam', { team_id: teamId });
  await b.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
  const p = await a.client.mutation('projects:webCreate', {
    title: longChinese,
    workspace: 'team',
    team_id: teamId,
  });
  const other = await a.client.mutation('projects:webCreate', {
    title: longEnglish,
    workspace: 'team',
    team_id: teamId,
  });
  const connector = await local('/api/connectors/create', {
    root,
    projectId: p.id,
    label: 'TEST completion source',
    confirmed: true,
  });
  const first = await eventually(async () => {
    const data = await local('/api/inspect', undefined, connector.url);
    assert.ok(data.checkpoints.length);
    return data.checkpoints[0];
  });
  await fs.writeFile(
    path.join(root, 'readme.txt'),
    `// TEST saved-file edit, without an Agent\n${longUrl}\n`,
  );
  await local('/api/capture', {}, connector.url);
  const sessionId = `test-completion-${randomUUID()}`,
    log = path.join(evidence, 'TEST-codex.jsonl');
  const rows = [
    { type: 'session_meta', payload: { id: sessionId, cwd: root } },
    ...Array.from({ length: 75 }, (_, i) => ({
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      type: 'response_item',
      payload: {
        type: 'message',
        role: i % 2 ? 'assistant' : 'user',
        content: [
          {
            type: i % 2 ? 'output_text' : 'input_text',
            text: `TEST conversation ${i + 1}\n${i === 0 ? longChinese : 'Context reading remains in the same workspace.'}\n${longUrl}\n${'A shared record is not permission to apply another member’s files. '.repeat(4)}`,
          },
        ],
      },
    })),
  ];
  await fs.writeFile(log, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  await local('/api/agent/preview', { path: log }, connector.url);
  await local(
    '/api/agent/connect',
    { path: log, confirmed: true, importHistory: true },
    connector.url,
  );
  const session = await eventually(async () => {
    const result = await a.client.query('colloSessions:list', {
      projectId: p.id,
      paginationOpts: { cursor: null, numItems: 30 },
    });
    const s = result.page.find((s) => s.sessionId === sessionId);
    assert.equal(s?.messageCount, 75);
    return s;
  });
  const task = await a.client.mutation('tasks:webCreate', {
    title: 'TEST ' + longEnglish,
    workspace: 'team',
    team_id: teamId,
    project_id: p.id,
  });
  const data = {
    projectId: p.id,
    projectShort: p.short_id,
    otherProjectId: other.id,
    teamId,
    workspaceId: session.workspaceId,
    sessionId,
    taskId: task.id,
    evidence,
    root,
    longPath,
    firstCheckpointId: first.id,
  };
  await fs.writeFile('.local/completion-fixture.json', JSON.stringify(data, null, 2));
  return { ...data, a, b, local, connector };
}
