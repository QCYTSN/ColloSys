import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import chokidar, { type FSWatcher } from 'chokidar';
import { z } from 'zod';
import { assertRoot, within } from './files';
import { sensitivePath, idSchema } from '../../shared/src/protocol';
import { Store } from './store';
import { Snapshots } from './snapshots';
import { collectCodex, inspectCodexSource } from './codex';
import { acquireStateLock } from './lock';
import { storageApi } from './storage-api';
import { cleanRetention } from './retention';
import { assertNoLinks } from './checked-file';
import { deliveryRetryTime, retryAfterTime } from './delivery-retry';

export const configSchema = z
  .object({
    root: z.string(),
    state: z.string(),
    backend: z.string().url(),
    projectId: idSchema,
    workspaceId: idSchema,
    userId: idSchema,
    label: z.string().min(1).max(80),
    token: z.string().min(16),
    credential: z.enum(['session', 'device']).default('session'),
    autoStart: z.boolean().default(true),
    webOrigins: z
      .array(z.string().refine((s) => /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(s)))
      .default(['http://127.0.0.1:5173', 'http://localhost:5173']),
    port: z.number().int().min(1024).max(65535),
    codexLog: z.string().optional(),
  })
  .strict();
export type ConnectorConfig = z.input<typeof configSchema>;
class BackendRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter = 0,
  ) {
    super(`${status}: ${message}`);
  }
}
export class Connector {
  store!: Store;
  snapshots!: Snapshots;
  watcher?: FSWatcher;
  server?: http.Server;
  private tasks: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private sending = false;
  private debounce?: NodeJS.Timeout;
  private scanQueued = false;
  private scanAgain = false;
  private scanTimer?: NodeJS.Timeout;
  private sendTimer?: NodeJS.Timeout;
  private registered = false;
  error: string | null = null;
  lastScan: number | null = null;
  lastSent: number | null = null;
  deliveryState: 'ready' | 'retrying' | 'reauth-required' | 'access-denied' = 'ready';
  private deliveryFailure(error: unknown) {
    this.deliveryState =
      error instanceof BackendRequestError
        ? error.status === 401
          ? 'reauth-required'
          : error.status === 403
            ? 'access-denied'
            : 'retrying'
        : 'retrying';
  }
  agentError: string | null = null;
  private releaseLock?: () => Promise<void>;
  private agentSource: string | null = null;
  private lastCleanup = 0;
  public config: z.infer<typeof configSchema>;
  constructor(config: z.input<typeof configSchema>) {
    this.config = configSchema.parse(config);
  }
  serial<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.tasks.catch(() => {}).then(fn);
    this.tasks = task;
    return task;
  }
  async start() {
    this.config.root = await assertRoot(path.resolve(this.config.root));
    this.config.state = path.resolve(this.config.state);
    if (within(this.config.root, this.config.state) || within(this.config.state, this.config.root))
      throw new Error('Connector state must be outside the project directory');
    await assertNoLinks(this.config.state, { allowMissing: true });
    await fs.mkdir(this.config.state, { recursive: true });
    this.config.state = await fs.realpath(this.config.state);
    if (within(this.config.root, this.config.state) || within(this.config.state, this.config.root))
      throw new Error('Connector state resolves inside the project directory');
    this.releaseLock = await acquireStateLock(this.config.state);
    try {
      this.store = new Store(this.config.state);
      this.agentSource = this.store.setting('codexSource', this.config.codexLog ?? null);
      const identity = {
        root: this.config.root,
        workspaceId: this.config.workspaceId,
        userId: this.config.userId,
        projectId: this.config.projectId,
      };
      const previous = this.store.setting<typeof identity | null>('identity', null);
      if (previous && JSON.stringify(previous) !== JSON.stringify(identity))
        throw new Error('State belongs to a different workspace; use a new state directory');
      this.store.set('identity', identity);
      this.snapshots = new Snapshots(
        this.config.root,
        this.config.state,
        this.config.workspaceId,
        this.store,
      );
      await this.snapshots.init();
      await this.scan();
      this.watcher = chokidar.watch(this.config.root, {
        ignoreInitial: true,
        followSymlinks: false,
        ignored: (p) => {
          const rel = path.relative(this.config.root, p).replaceAll('\\', '/');
          return !!rel && sensitivePath(rel);
        },
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      });
      this.watcher.on('all', () => this.scheduleScan());
      this.watcher.on('error', () => {
        this.error = 'File watcher failed; periodic rescans remain active';
      });
      this.scanTimer = setInterval(() => this.scheduleScan(), 5000);
      this.sendTimer = setInterval(() => void this.flush(), 1000);
      await this.listen();
      void this.flush();
    } catch (e) {
      await this.stop();
      throw e;
    }
  }
  scheduleScan() {
    if (this.stopped) return;
    if (this.scanQueued) {
      this.scanAgain = true;
      return;
    }
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.scanQueued = true;
      void this.serial(async () => {
        try {
          await this.scan();
        } finally {
          this.scanQueued = false;
          if (this.scanAgain) {
            this.scanAgain = false;
            this.scheduleScan();
          }
        }
      });
    }, 450);
  }
  async scan() {
    try {
      await this.snapshots.capture();
      if (Date.now() - this.lastCleanup > 60000) {
        await cleanRetention(this.snapshots);
        this.lastCleanup = Date.now();
      }
      this.lastScan = Date.now();
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    if (this.error?.includes('quota')) {
      this.agentError = 'Storage quota reached; message capture is paused';
      return;
    }
    if (this.agentSource)
      try {
        await collectCodex(this.agentSource, this.config.root, this.config.workspaceId, this.store);
        this.agentError = null;
      } catch (e) {
        this.agentError = e instanceof Error ? e.message : String(e);
      }
  }
  async backend(route: string, init: RequestInit = {}) {
    const response = await fetch(this.config.backend + route, {
      ...init,
      headers: {
        ...(this.config.credential === 'device'
          ? { 'X-ColloSys-Device': this.config.token }
          : { Authorization: `Bearer ${this.config.token}` }),
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(5000),
    });
    const value: unknown = await response.json().catch(() => null);
    const data =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    if (!response.ok)
      throw new BackendRequestError(
        response.status,
        typeof data?.error === 'string' ? data.error : 'Backend rejected request',
        retryAfterTime(response.headers.get('Retry-After')),
      );
    if (!data) throw new Error('Backend returned an invalid response');
    return data;
  }
  async flush() {
    if (this.sending || this.stopped || this.store.setting('offline', false)) return;
    const identity = createHash('sha256')
      .update(JSON.stringify([this.config.backend, this.config.token]))
      .digest('hex');
    const cooldown = this.store.setting<{
      identity: string;
      attempts: number;
      nextAt: number;
      status?: number;
      error: string;
    } | null>('deliveryCooldown', null);
    if (cooldown?.identity === identity && cooldown.nextAt > Date.now()) {
      this.deliveryFailure(new BackendRequestError(cooldown.status ?? 503, cooldown.error));
      return;
    }
    const defer = (error: unknown, registration = false) => {
      const failure = error instanceof BackendRequestError ? error : null;
      if (
        !registration &&
        !failure?.retryAfter &&
        ![401, 402, 403, 429].includes(failure?.status ?? 0)
      )
        return;
      const attempts = (cooldown?.identity === identity ? cooldown.attempts : 0) + 1;
      this.store.set('deliveryCooldown', {
        identity,
        attempts,
        nextAt: deliveryRetryTime(attempts, failure?.status, failure?.retryAfter),
        ...(failure ? { status: failure.status } : {}),
        error: (error instanceof Error ? error.message : 'Delivery failed').slice(0, 200),
      });
    };
    this.sending = true;
    try {
      if (!this.registered) {
        const registration = await this.backend(
          `/api/projects/${this.config.projectId}/workspaces`,
          {
            method: 'POST',
            body: JSON.stringify({ id: this.config.workspaceId, label: this.config.label }),
          },
        );
        if (registration.userId !== this.config.userId)
          throw new Error('Connector credentials belong to a different account');
        this.registered = true;
        this.deliveryState = 'ready';
        this.store.set('deliveryCooldown', null);
      }
      for (const row of this.store.pending()) {
        if (this.stopped || this.store.setting('offline', false) || row.next_at > Date.now()) break;
        try {
          const ack = await this.backend(`/api/projects/${this.config.projectId}/events`, {
            method: 'POST',
            body: row.event,
          });
          if (
            ack.id !== row.id ||
            typeof ack.seq !== 'number' ||
            !Number.isSafeInteger(ack.seq) ||
            ack.seq < 1
          )
            throw new Error('Invalid persistence receipt');
          this.store.acknowledge(row.id, ack.seq);
          this.lastSent = Date.now();
          this.deliveryState = 'ready';
          if (cooldown) this.store.set('deliveryCooldown', null);
        } catch (e) {
          this.deliveryFailure(e);
          defer(e);
          this.store.failure(row.id, row.attempts + 1, e instanceof Error ? e.message : String(e));
          break;
        }
      }
    } catch (e) {
      this.deliveryFailure(e);
      defer(e, !this.registered);
    } finally {
      this.sending = false;
    }
  }
  status() {
    return {
      workspaceId: this.config.workspaceId,
      projectId: this.config.projectId,
      userId: this.config.userId,
      label: this.config.label,
      root: this.config.root,
      pending: this.store.count(),
      deliveryError:
        this.store.pending().find((row) => row.error)?.error ??
        this.store.setting<{ error: string } | null>('deliveryCooldown', null)?.error ??
        null,
      nextDeliveryAt:
        this.store.setting<{ nextAt: number } | null>('deliveryCooldown', null)?.nextAt ?? null,
      deliveryState: this.store.setting('offline', false) ? 'paused' : this.deliveryState,
      offline: this.store.setting('offline', false),
      lastScan: this.lastScan,
      lastSent: this.lastSent,
      error: this.error,
      agent: {
        adapter: this.agentSource ? 'codex' : null,
        source: this.agentSource,
        error: this.agentError,
      },
      excluded: this.snapshots.lastSkipped,
      latest: this.store.latest()?.id ?? null,
      backup: 'local-only',
    };
  }
  async authorize(req: http.IncomingMessage) {
    const origin = req.headers.origin;
    if (origin && !this.config.webOrigins.includes(origin))
      throw new Error('403: Origin not allowed');
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new Error('401: Sign in required');
    const response = await fetch(this.config.backend + '/api/me', {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error('401: Session invalid');
    const data = (await response.json()) as { user: { id: string } };
    if (data.user.id !== this.config.userId)
      throw new Error('403: This connector belongs to another member');
  }
  async listen() {
    this.server = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      try {
        const origin = req.headers.origin;
        if (origin) {
          if (!this.config.webOrigins.includes(origin)) throw new Error('403: Origin not allowed');
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        }
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (url.pathname === '/health') {
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        await this.authorize(req);
        let body: any = {};
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 8192) throw new Error('413: Request too large');
            chunks.push(chunk);
          }
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            throw new Error('400: Invalid JSON');
          }
        }
        let result: unknown = await storageApi(this, url.pathname, req.method ?? 'GET', body);
        if (result !== undefined) {
          res.end(JSON.stringify(result));
          return;
        }
        if (url.pathname === '/api/inspect' && req.method === 'GET')
          result = { status: this.status(), checkpoints: this.store.list() };
        else if (url.pathname === '/api/status' && req.method === 'GET') result = this.status();
        else if (url.pathname === '/api/checkpoints' && req.method === 'GET')
          result = { checkpoints: this.store.list() };
        else if (url.pathname === '/api/capture' && req.method === 'POST') {
          result = await this.serial(() => this.snapshots.capture('手动检查点', true));
          void this.flush();
        } else if (url.pathname === '/api/offline' && req.method === 'POST') {
          const input = z.object({ offline: z.boolean() }).strict().parse(body);
          this.store.set('offline', input.offline);
          if (!input.offline) {
            this.store.retryNow();
            void this.flush();
          }
          result = this.status();
        } else if (url.pathname === '/api/agent/preview' && req.method === 'POST') {
          const input = z
            .object({ path: z.string().min(1).max(2000) })
            .strict()
            .parse(body);
          if (!path.isAbsolute(input.path))
            throw new Error('400: Choose an absolute log file path');
          const inspected = await inspectCodexSource(input.path, this.config.root);
          result = inspected.summary;
        } else if (url.pathname === '/api/agent/connect' && req.method === 'POST') {
          const input = z
            .object({
              path: z.string().min(1).max(2000),
              importHistory: z.boolean(),
              confirmed: z.literal(true),
            })
            .strict()
            .parse(body);
          if (!path.isAbsolute(input.path))
            throw new Error('400: Choose an absolute log file path');
          result = await this.serial(async () => {
            const inspected = await inspectCodexSource(input.path, this.config.root);
            if (!input.importHistory)
              this.store.transaction(() => {
                for (const message of inspected.messages)
                  this.store.db
                    .prepare('INSERT OR IGNORE INTO agent_seen VALUES(?)')
                    .run(message.messageId);
              });
            this.agentSource = input.path;
            this.store.set('codexSource', input.path);
            this.store.set('codexSourceVersion', null);
            const imported = await collectCodex(
              input.path,
              this.config.root,
              this.config.workspaceId,
              this.store,
            );
            return { connected: true, imported, ...inspected.summary };
          });
          void this.flush();
        } else if (url.pathname === '/api/agent/disconnect' && req.method === 'POST') {
          result = await this.serial(async () => {
            this.agentSource = null;
            this.store.set('codexSource', null);
            this.agentError = null;
            return { connected: false };
          });
        } else if (url.pathname === '/api/restore/preview' && req.method === 'POST') {
          const input = z.object({ checkpointId: idSchema }).strict().parse(body);
          result = await this.serial(() => this.snapshots.preview(input.checkpointId));
        } else if (url.pathname === '/api/restore/confirm' && req.method === 'POST') {
          const input = z
            .object({ previewId: idSchema, confirmed: z.literal(true) })
            .strict()
            .parse(body);
          result = await this.serial(() =>
            this.snapshots.restore(input.previewId, input.confirmed),
          );
          void this.flush();
        } else throw new Error('404: Not found');
        res.end(JSON.stringify(result));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const match = message.match(/^(\d{3}):/);
        res.statusCode = match
          ? Number(match[1])
          : e instanceof z.ZodError
            ? 400
            : /changed|expired|confirmation/i.test(message)
              ? 409
              : 500;
        res.end(JSON.stringify({ error: message }));
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.config.port, '127.0.0.1', resolve);
    });
  }
  async stop() {
    this.stopped = true;
    if (this.debounce) clearTimeout(this.debounce);
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.sendTimer) clearInterval(this.sendTimer);
    await this.watcher?.close();
    await this.tasks.catch(() => {});
    while (this.sending) await new Promise((r) => setTimeout(r, 25));
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
    this.store?.close();
    await this.releaseLock?.();
  }
}
