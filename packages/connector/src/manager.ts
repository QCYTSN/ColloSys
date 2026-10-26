import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Connector, configSchema } from './connector';
import { assertRoot, within } from './files';
import { idSchema } from '../../shared/src/protocol';
const exec = promisify(execFile);
export class ConnectorManager {
  ready = true;
  server?: http.Server;
  connectors = new Map<string, Connector>();
  private lifecycle = new Map<string, Promise<unknown>>();
  private requests = new Set<Promise<void>>();
  private stopping = false;
  private stopTask?: Promise<void>;
  private async exclusive<T>(id: string, fn: () => Promise<T>) {
    const task = (this.lifecycle.get(id) ?? Promise.resolve()).catch(() => {}).then(fn);
    this.lifecycle.set(id, task);
    try {
      return await task;
    } finally {
      if (this.lifecycle.get(id) === task) this.lifecycle.delete(id);
    }
  }
  onShutdown?: () => void;
  constructor(
    public directory: string,
    public backend: string,
    public pairing: string,
    public port = 8790,
    public options: { origins?: string[]; deviceCredentials?: boolean } = {},
  ) {}
  private async credential(authorization: string, projectId: string, workspaceId: string) {
    if (!this.options.deviceCredentials) return authorization.replace(/^Bearer /, '');
    const response = await fetch(this.backend + `/api/projects/${projectId}/devices`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`${response.status}: Cannot authorize this directory`);
    const data = (await response.json()) as { token: string };
    if (!/^collo_[a-f0-9]{64}$/.test(data.token)) throw new Error('502: Invalid device credential');
    return data.token;
  }
  async start() {
    await fs.mkdir(this.directory, { recursive: true });
    this.directory = await assertRoot(this.directory);
    this.server = http.createServer((req, res) => {
      const request = this.handle(req, res);
      this.requests.add(request);
      void request.finally(() => this.requests.delete(request));
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, '127.0.0.1', resolve);
    });
  }
  async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (this.stopping) throw new Error('503: Local manager is shutting down');
      if (!this.ready) throw new Error('503: Restoring authorized directories');
      if (![`127.0.0.1:${this.port}`, `localhost:${this.port}`].includes(req.headers.host ?? ''))
        throw new Error('403: Host not allowed');
      const origin = req.headers.origin;
      if (
        origin &&
        !(this.options.origins ?? ['http://127.0.0.1:5173', 'http://localhost:5173']).includes(
          origin,
        )
      )
        throw new Error('403: Origin not allowed');
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Authorization, Content-Type, X-ColloSys-Pairing',
        );
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method === 'GET' && req.url === '/health') {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      const pairing = String(req.headers['x-collosys-pairing'] ?? '');
      if (
        pairing.length !== this.pairing.length ||
        !timingSafeEqual(Buffer.from(pairing), Buffer.from(this.pairing))
      )
        throw new Error('403: Open ColloSys from its local launcher to pair this browser');
      const authorization = req.headers.authorization ?? '';
      const auth = await fetch(this.backend + '/api/me', {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(5000),
      });
      if (!auth.ok) throw new Error('401: Sign in first');
      const { user } = (await auth.json()) as { user: { id: string; name: string } };
      let raw: unknown = {};
      if (req.method === 'POST') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8192) throw new Error('413: Request too large');
          chunks.push(chunk);
        }
        raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
      const route = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      let result: unknown;
      if (route === '/api/shutdown' && req.method === 'POST') {
        z.object({ confirmed: z.literal(true) })
          .strict()
          .parse(raw);
        if (!this.onShutdown)
          throw new Error('400: This manager does not own the application launcher');
        result = { ok: true };
        setTimeout(() => this.onShutdown?.(), 100);
      } else if (route === '/api/roots/choose' && req.method === 'POST') {
        if (process.platform !== 'win32')
          throw new Error('400: Paste an absolute project directory on this platform');
        const script =
          "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $picker=New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description='Select an explicitly authorized ColloSys directory'; if($picker.ShowDialog() -eq 'OK'){[Console]::Write($picker.SelectedPath)}; $picker.Dispose()";
        const out = await exec(
          'powershell.exe',
          [
            '-NoProfile',
            '-STA',
            '-EncodedCommand',
            Buffer.from(script, 'utf16le').toString('base64'),
          ],
          { windowsHide: true, timeout: 120000 },
        );
        result = { path: out.stdout.trim() };
      } else if (route === '/api/connectors' && req.method === 'GET') {
        const connectors = [];
        for (const e of await fs.readdir(this.directory, { withFileTypes: true })) {
          if (!e.isDirectory() || e.isSymbolicLink() || !e.name.startsWith('workspace-')) continue;
          try {
            const config = configSchema.parse(
              JSON.parse(
                await fs.readFile(path.join(this.directory, e.name, 'config.json'), 'utf8'),
              ),
            );
            if (config.userId === user.id)
              connectors.push({
                workspaceId: config.workspaceId,
                projectId: config.projectId,
                label: config.label,
                root: config.root,
                url: `http://127.0.0.1:${config.port}`,
                running: this.connectors.has(config.workspaceId),
              });
          } catch {}
        }
        result = { connectors };
      } else if (route === '/api/connectors/create' && req.method === 'POST') {
        const input = z
          .object({
            root: z.string().min(1).max(2000),
            projectId: idSchema,
            label: z.string().min(1).max(80),
            confirmed: z.literal(true),
          })
          .strict()
          .parse(raw);
        if (!path.isAbsolute(input.root))
          throw new Error('400: An absolute project directory is required');
        const root = await assertRoot(input.root);
        if (within(root, this.directory) || within(this.directory, root))
          throw new Error('400: Project and managed storage must be separate');
        const membership = await fetch(this.backend + `/api/projects/${input.projectId}/members`, {
          headers: { Authorization: authorization },
          signal: AbortSignal.timeout(5000),
        });
        if (!membership.ok) throw new Error('403: Project access denied');
        const { members } = (await membership.json()) as {
          members: { id: string; role: string }[];
        };
        if (!members.some((m) => m.id === user.id && m.role !== 'viewer'))
          throw new Error('403: Project editor access required');
        const workspaceId = `workspace-${randomUUID()}`,
          state = path.join(this.directory, workspaceId);
        // Ask the OS for a free loopback port; Connector.listen still detects a race.
        const probe = http.createServer();
        await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
        const port = (probe.address() as { port: number }).port;
        await new Promise<void>((r) => probe.close(() => r()));
        const config = configSchema.parse({
          root,
          state,
          backend: this.backend,
          projectId: input.projectId,
          workspaceId,
          userId: user.id,
          label: input.label,
          token: await this.credential(authorization, input.projectId, workspaceId),
          credential: this.options.deviceCredentials ? 'device' : 'session',
          webOrigins: this.options.origins,
          port,
        });
        await fs.mkdir(state);
        await fs.writeFile(path.join(state, 'config.json'), JSON.stringify(config, null, 2), {
          mode: 0o600,
          flag: 'wx',
        });
        const connector = new Connector(config);
        await connector.start();
        this.connectors.set(workspaceId, connector);
        result = { workspaceId, url: `http://127.0.0.1:${port}` };
      } else if (
        ['/api/connectors/start', '/api/connectors/stop'].includes(route) &&
        req.method === 'POST'
      ) {
        const { workspaceId } = z.object({ workspaceId: idSchema }).strict().parse(raw);
        if (!/^workspace-[a-f0-9-]{36}$/.test(workspaceId))
          throw new Error('400: Invalid workspace');
        result = await this.exclusive(workspaceId, async () => {
          const state = path.join(this.directory, workspaceId);
          await assertRoot(state);
          const configFile = path.join(state, 'config.json'),
            config = configSchema.parse(JSON.parse(await fs.readFile(configFile, 'utf8')));
          if (
            config.userId !== user.id ||
            config.state !== state ||
            config.backend !== this.backend
          )
            throw new Error('403: Workspace owner mismatch');
          if (route.endsWith('/start')) {
            config.autoStart = true;
            const response = await fetch(
              this.backend + `/api/projects/${config.projectId}/members`,
              {
                headers: { Authorization: authorization },
                signal: AbortSignal.timeout(5000),
              },
            );
            if (!response.ok)
              throw new Error(`${response.status}: Cannot reauthenticate this workspace`);
            const data = (await response.json()) as { members: { id: string; role: string }[] };
            if (!data.members.some((member) => member.id === user.id && member.role !== 'viewer'))
              throw new Error('403: Project editor access required');
            await assertRoot(config.root);
          }
          if (this.connectors.has(workspaceId)) {
            await this.connectors.get(workspaceId)!.stop();
            this.connectors.delete(workspaceId);
          }
          if (route.endsWith('/start')) {
            config.token = await this.credential(authorization, config.projectId, workspaceId);
            const temporary = configFile + '.' + randomUUID() + '.tmp';
            await fs.writeFile(temporary, JSON.stringify(config, null, 2), {
              mode: 0o600,
              flag: 'wx',
            });
            await fs.rename(temporary, configFile);
            const connector = new Connector(config);
            await connector.start();
            connector.store.retryNow();
            this.connectors.set(workspaceId, connector);
            await connector.flush();
          } else {
            config.autoStart = false;
            const temporary = configFile + '.' + randomUUID() + '.tmp';
            await fs.writeFile(temporary, JSON.stringify(config, null, 2), {
              mode: 0o600,
              flag: 'wx',
            });
            await fs.rename(temporary, configFile);
          }
          return {
            workspaceId,
            url: `http://127.0.0.1:${config.port}`,
            running: this.connectors.has(workspaceId),
          };
        });
      } else throw new Error('404: Not found');
      res.end(JSON.stringify(result));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.statusCode = Number(
        message.match(/^(\d{3}):/)?.[1] ?? (e instanceof z.ZodError ? '400' : '500'),
      );
      res.end(JSON.stringify({ error: message }));
    }
  }
  async stop() {
    if (this.stopTask) return this.stopTask;
    this.stopping = true;
    this.stopTask = (async () => {
      const closed = new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
      await Promise.allSettled([...this.requests]);
      await Promise.allSettled([...this.lifecycle.values()]);
      for (const connector of this.connectors.values()) await connector.stop();
      this.connectors.clear();
      await closed;
    })();
    return this.stopTask;
  }
}
