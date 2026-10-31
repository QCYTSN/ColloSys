// Real connector data isolated from the fixed performance fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { account, signIn, eventually } from './product-ui-refinement-data.mjs';
export { account, eventually };
export async function workspaceFixture() {
  const a = await signIn(account.a), b = await signIn(account.b);
  const pairing = (await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim();
  const local = async (route, body, endpoint = 'http://127.0.0.1:3411') => {
    const response = await fetch(endpoint + route, { method: body ? 'POST' : 'GET', headers: {
      Authorization: `Bearer ${a.token}`, 'X-ColloSys-Pairing': pairing, 'Content-Type': 'application/json',
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    assert.ok(response.ok, `${route}: ${result.error ?? response.status}`);
    return result;
  };
  const saved = await fs.readFile('.local/workspace-polish-fixture.json', 'utf8').then(JSON.parse).catch(e => {
    if (e.code !== 'ENOENT') throw e;
  });
  if (saved) return { ...saved, a, b, local, pairing };
  const dir = path.resolve('.local', `workspace-polish-${randomUUID()}`), root = path.join(dir, 'TEST-directory');
  await fs.mkdir(root, { recursive: true });
  const ordinary = [...Array.from({ length: 24 }, (_, i) => `file-${String(i + 1).padStart(2, '0')}.ts`), 'one/same.ts', 'two/same.ts'];
  const write = async (relative, content) => {
    const target = path.resolve(root, relative);
    assert.ok(target.startsWith(root + path.sep));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };
  for (const file of ordinary) await write(file, `// TEST ${file}\nexport const version = 1;\n`);
  await write('long.ts', 'export const before = true;\n');
  await write('binary.bin', Buffer.from([0, 1, 2, 3]));
  await write('large.txt', 'TEST before\n');
  await write('old-name.txt', 'TEST rename retains bytes\n');
  await write('excluded.txt', 'TEST formerly shared, no sensitive data\n');
  const teamId = await a.client.mutation('teams:createTeam', { name: `TEST workspace polish ${randomUUID().slice(0, 8)}` });
  const team = await a.client.query('teams:getTeam', { team_id: teamId });
  await b.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
  const project = await a.client.mutation('projects:webCreate', {
    title: 'TEST 工作连续性 · LongProjectTitleWithoutSpacesAndWithReadableControls', workspace: 'team', team_id: teamId,
  });
  let connector = await local('/api/connectors/create', { root, projectId: project.id, label: 'TEST workspace polish', confirmed: true });
  const initial = await eventually(async () => {
    const data = await local('/api/inspect', undefined, connector.url);
    assert.ok(data.checkpoints[0]); return data.checkpoints[0];
  });
  const sessions = [];
  for (const [name, count] of [['A', 65], ['B', 2]]) {
    const id = `test-workspace-${name}-${randomUUID()}`, log = path.join(dir, `TEST-${name}.jsonl`);
    const rows = [{ type: 'session_meta', payload: { id, cwd: root } }, ...Array.from({ length: count }, (_, i) => ({
      timestamp: new Date(Date.now() + i * 1000).toISOString(), type: 'response_item', payload: {
        type: 'message', role: i % 2 ? 'assistant' : 'user', content: [{ type: i % 2 ? 'output_text' : 'input_text',
          text: `TEST SESSION ${name} MESSAGE ${i + 1}\n\n${'阅读位置与独立目录中的保存内容需要保持一致。 '.repeat(8)}\n\n` +
            (i % 2 ? '```typescript\n' + `export const reading${i} = "${'long-readable-value-'.repeat(15)}";\n` + '```' : 'Review long.ts and one/same.ts in the saved checkpoint.'),
        }],
      },
    }))];
    await fs.writeFile(log, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    await local('/api/agent/preview', { path: log }, connector.url);
    await local('/api/agent/connect', { path: log, importHistory: true, confirmed: true }, connector.url);
    await eventually(async () => {
      const page = await a.client.query('colloSessions:list', { projectId: project.id, paginationOpts: { numItems: 30, cursor: null } });
      assert.equal(page.page.find(row => row.sessionId === id)?.messageCount, count);
    });
    sessions.push(id);
  }
  await local('/api/connectors/stop', { workspaceId: connector.workspaceId });
  for (const file of ordinary.slice(1)) await write(file, `// TEST ${file}\nexport const version = 2;\n`);
  await write('long.ts', Array.from({ length: 260 }, (_, i) => `export const line${i + 1} = "TEST-${i + 1}${i === 80 ? '-long-path-without-spaces'.repeat(90) : ''}";`).join('\n') + '\n');
  await write('binary.bin', Buffer.from([0, 5, 6, 7]));
  await write('large.txt', 'TEST large saved text\n'.repeat(16000));
  await fs.rename(path.join(root, 'old-name.txt'), path.join(root, 'new-name.txt'));
  await write('.gitignore', 'excluded.txt\n');
  connector = await local('/api/connectors/start', { workspaceId: connector.workspaceId });
  await local('/api/capture', {}, connector.url);
  const { checkpoint, receipt } = await eventually(async () => {
    const data = await local('/api/inspect', undefined, connector.url);
    for (const checkpoint of data.checkpoints.filter(cp => cp.id !== initial.id)) {
      const receipt = await a.client.query('collo:checkpointParts', { projectId: project.id, workspaceId: connector.workspaceId, checkpointId: checkpoint.id });
      if (receipt.complete && receipt.events.flatMap(e => e.payload.files).length === 32) return { checkpoint, receipt };
    }
    assert.fail('Waiting for the 32-change checkpoint (a separate manual no-change snapshot is not that checkpoint)');
  });
  const files = receipt.events.flatMap(e => e.payload.files);
  assert.equal(files.length, 32);
  assert.ok(files.some(f => f.status === 'excluded'));
  const task = await a.client.mutation('tasks:webCreate', {
    title: 'TEST 工作区评论 · 完整操作与返回位置', description: 'TEST description retained with a comment draft.',
    workspace: 'team', team_id: teamId, project_id: project.id,
  });
  const data = { projectId: project.id, teamId, workspaceId: connector.workspaceId, sessions, taskId: task.id,
    checkpointId: checkpoint.id, eventId: receipt.events[0].id, initialCheckpointId: initial.id, root };
  await fs.writeFile('.local/workspace-polish-fixture.json', JSON.stringify(data, null, 2));
  return { ...data, a, b, local, pairing };
}
