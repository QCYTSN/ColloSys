import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { ConnectorManager } from '../packages/connector/src/manager';
import { Connector } from '../packages/connector/src/connector';
const listen = async (server: http.Server) => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
};
test('manager shutdown waits for an in-flight real connector start and closes its listener', async (t) => {
  const directory = await fs.mkdtemp(path.resolve('.local/manager-lifecycle-'));
  const root = path.join(directory, 'project');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'file.txt'), 'TEST lifecycle');
  const backend = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const data = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const response =
      req.url === '/api/me'
        ? { user: { id: 'owner', name: 'TEST' } }
        : req.url?.endsWith('/members')
          ? { members: [{ id: 'owner', role: 'owner' }] }
          : { id: data.id, seq: 1 };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(response));
  });
  const backendPort = await listen(backend),
    probe = http.createServer(),
    port = await listen(probe);
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const manager = new ConnectorManager(
    path.join(directory, 'managed'),
    `http://127.0.0.1:${backendPort}`,
    'TEST-pairing',
    port,
  );
  let enter!: () => void, release!: () => void, created: Connector | undefined;
  const entered = new Promise<void>((r) => (enter = r)),
    gate = new Promise<void>((r) => (release = r)),
    original = Connector.prototype.start;
  t.mock.method(Connector.prototype, 'start', async function (this: Connector) {
    created = this;
    enter();
    await gate;
    await original.call(this);
  });
  try {
    await manager.start();
    const request = fetch(`http://127.0.0.1:${port}/api/connectors/create`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer TEST-long-session-token',
        'X-ColloSys-Pairing': 'TEST-pairing',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ root, projectId: 'project', label: 'TEST', confirmed: true }),
    });
    await entered;
    let stopped = false;
    const stop = manager.stop().then(() => (stopped = true));
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(stopped, false);
    release();
    assert.equal((await request).status, 200);
    await stop;
    assert.equal(manager.connectors.size, 0);
    assert.equal(created!.server!.listening, false);
  } finally {
    release();
    await manager.stop();
    await new Promise<void>((r) => backend.close(() => r()));
  }
});
