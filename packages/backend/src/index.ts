import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import { eventSchema, idSchema, sensitivePath, redact } from '../../shared/src/protocol';

import type { Env, Actor } from './types';
import { json, HttpError, hash, loopback, body } from './http';
import { accounts, changePassword } from './accounts';
import { teams } from './teams';
import { collaboration } from './collaboration';
import { backups } from './backups';
import { initializeHistory, queryHistory } from './history';

function checkOrigin(req: Request) {
  const origin = req.headers.get('Origin');
  if (!origin) return;
  const url = new URL(req.url),
    source = new URL(origin);
  if (source.origin === url.origin) return;
  if (loopback(url.hostname) && loopback(source.hostname) && source.port === '5173') return;
  throw new HttpError(403, 'Origin is not allowed');
}
async function authenticate(req: Request, env: Env): Promise<Actor> {
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token || token.length > 200) throw new HttpError(401, 'Sign in is required');
  const tokenHash = await hash(token);
  const row = await env.DB.prepare(
    'SELECT u.id,u.name,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
  )
    .bind(tokenHash, Date.now())
    .first<{ id: string; name: string; expires_at: number }>();
  if (!row) throw new HttpError(401, 'Session expired', 'SESSION_INVALID');
  return { id: row.id, name: row.name, tokenHash, expiresAt: row.expires_at };
}
async function membership(env: Env, project: string, user: string, write = false) {
  const row = await env.DB.prepare(
    'SELECT role FROM project_members WHERE project_id=? AND user_id=?',
  )
    .bind(project, user)
    .first<{ role: string }>();
  if (!row || (write && row.role === 'viewer'))
    throw new HttpError(403, 'Project access is not allowed');
  return row;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      checkOrigin(req);
      const url = new URL(req.url),
        parts = url.pathname.split('/').filter(Boolean);
      if (url.pathname === '/api/health')
        return json({
          ok: true,
          protocol: 1,
          auth: env.AUTH_MODE,
          snapshotBackup: env.BACKUP_LOCATION ?? 'local-object-storage',
        });
      if (url.pathname === '/api/dev/login' && req.method === 'POST') {
        if (env.AUTH_MODE !== 'development' || !loopback(url.hostname))
          throw new HttpError(403, 'Development login is disabled');
        const input = z
          .object({ user: z.enum(['alice', 'bob', 'outsider']) })
          .strict()
          .parse(await body(req, 1024));
        const user = await env.DB.prepare('SELECT id,name FROM users WHERE id=?')
          .bind(input.user)
          .first();
        if (!user) throw new HttpError(503, 'Run database initialization first');
        const token = crypto.randomUUID() + crypto.randomUUID(),
          expiresAt = Date.now() + 7 * 86400000;
        await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
          .bind(await hash(token), input.user, expiresAt)
          .run();
        return json({ token, user, expiresAt, developmentOnly: true });
      }
      if (parts[0] !== 'api')
        return env.ASSETS ? env.ASSETS.fetch(req) : json({ error: 'Not found' }, 404);
      const accountResponse = await accounts(req, env);
      if (accountResponse) return accountResponse;
      if (
        parts[1] === 'projects' &&
        parts[3] === 'live' &&
        req.headers.get('Upgrade') === 'websocket'
      ) {
        const ticket = url.searchParams.get('ticket');
        if (!ticket || ticket.length > 100) throw new HttpError(401, 'Socket ticket required');
        const entry = await env.DB.prepare(
          'DELETE FROM socket_tickets WHERE token_hash=? AND project_id=? AND expires_at>? RETURNING user_id,session_hash',
        )
          .bind(await hash(ticket), parts[2], Date.now())
          .first<{ user_id: string; session_hash: string }>();
        if (!entry) throw new HttpError(401, 'Socket ticket expired');
        const session = await env.DB.prepare(
          'SELECT expires_at FROM sessions WHERE token_hash=? AND expires_at>?',
        )
          .bind(entry.session_hash, Date.now())
          .first<{ expires_at: number }>();
        if (!session) throw new HttpError(401, 'Session expired');
        await membership(env, parts[2], entry.user_id);
        return env.PROJECTS.getByName(parts[2]).fetch(
          new Request('https://room/live', {
            headers: {
              Upgrade: 'websocket',
              'X-Actor': entry.user_id,
              'X-Project': parts[2],
              'X-Session': entry.session_hash,
              'X-Expiry': String(session.expires_at),
            },
          }),
        );
      }
      const actor = await authenticate(req, env);
      if (url.pathname === '/api/me') return json({ user: { id: actor.id, name: actor.name } });
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(actor.tokenHash).run();
        return json({ ok: true });
      }
      if (url.pathname === '/api/auth/password' && req.method === 'POST')
        return changePassword(req, env, actor);
      const teamResponse = await teams(req, env, actor);
      if (teamResponse) return teamResponse;
      if (url.pathname === '/api/projects' && req.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT p.*,m.role FROM projects p JOIN project_members m ON p.id=m.project_id WHERE m.user_id=?',
        )
          .bind(actor.id)
          .all();
        return json({ projects: results });
      }
      if (parts[1] !== 'projects' || !idSchema.safeParse(parts[2]).success)
        throw new HttpError(404, 'Project not found');
      const project = parts[2];
      const access = await membership(
        env,
        project,
        actor.id,
        !['GET', 'HEAD'].includes(req.method) && parts[3] !== 'ticket',
      );
      const collaborationResponse = await collaboration(req, env, actor, project, access.role);
      if (collaborationResponse) return collaborationResponse;
      const backupResponse = await backups(req, env, actor, project);
      if (backupResponse) return backupResponse;
      if (parts[3] === 'members' && req.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT u.id,u.name,m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE project_id=?',
        )
          .bind(project)
          .all();
        return json({ members: results });
      }
      if (parts[3] === 'workspaces' && req.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM workspaces WHERE project_id=?')
          .bind(project)
          .all();
        return json({ workspaces: results });
      }
      if (parts[3] === 'workspaces' && req.method === 'POST') {
        const input = z
          .object({ id: idSchema, label: z.string().min(1).max(80) })
          .strict()
          .parse(await body(req, 2048));
        const existing = await env.DB.prepare(
          'SELECT user_id,project_id FROM workspaces WHERE id=?',
        )
          .bind(input.id)
          .first<{ user_id: string; project_id: string }>();
        if (existing && (existing.user_id !== actor.id || existing.project_id !== project))
          throw new HttpError(403, 'Workspace belongs to another member');
        await env.DB.prepare(
          'INSERT INTO workspaces VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,updated_at=excluded.updated_at',
        )
          .bind(input.id, project, actor.id, input.label, Date.now())
          .run();
        return json({ id: input.id, userId: actor.id });
      }
      if (parts[3] === 'ticket' && req.method === 'POST') {
        const ticket = crypto.randomUUID();
        await env.DB.prepare('DELETE FROM socket_tickets WHERE expires_at<?')
          .bind(Date.now())
          .run();
        await env.DB.prepare('INSERT INTO socket_tickets VALUES(?,?,?,?,?)')
          .bind(await hash(ticket), actor.tokenHash, project, actor.id, Date.now() + 30000)
          .run();
        return json({ ticket });
      }
      const room = env.PROJECTS.getByName(project);
      if (
        [
          'history',
          'sessions',
          'messages',
          'event',
          'checkpoint-files',
          'checkpoint-file',
        ].includes(parts[3]) &&
        req.method === 'GET'
      )
        return room.fetch(new Request(`https://room/${parts[3]}${url.search}`));
      if (parts[3] === 'events' && req.method === 'GET') {
        const after = Number(url.searchParams.get('after') ?? 0);
        if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, 'Invalid cursor');
        return room.fetch(new Request(`https://room/events?after=${after}`));
      }
      if (parts[3] === 'events' && req.method === 'POST') {
        const event = eventSchema.parse(await body(req));
        const ws = await env.DB.prepare(
          'SELECT user_id FROM workspaces WHERE id=? AND project_id=?',
        )
          .bind(event.workspaceId, project)
          .first<{ user_id: string }>();
        if (!ws || ws.user_id !== actor.id)
          throw new HttpError(403, 'Cannot publish another member’s workspace');
        if (event.kind === 'checkpoint') {
          for (const f of event.payload.files) {
            if (sensitivePath(f.path)) throw new HttpError(400, 'Excluded path in event');
            f.patch = redact(f.patch);
          }
        } else event.payload.text = redact(event.payload.text);
        return room.fetch(
          new Request('https://room/events', {
            method: 'POST',
            body: JSON.stringify({ event, actor, project }),
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      throw new HttpError(404, 'Not found');
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message, code: error.code }, error.status);
      if (error instanceof z.ZodError)
        return json(
          {
            error: 'Invalid request',
            issues: error.issues.map((x) => ({ path: x.path, message: x.message })),
          },
          400,
        );
      if (/Team is full|Backup quota exceeded/.test(String(error)))
        return json({ error: 'Team capacity or backup quota reached' }, 409);
      console.error('Backend operation failed:', error instanceof Error ? error.name : 'unknown');
      return json({ error: 'Backend operation failed' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

type SocketIdentity = { user: string; project: string; session: string; expiresAt: number };
export class ProjectRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL, body TEXT NOT NULL)',
    );
    initializeHistory(ctx.storage.sql);
  }
  async fetch(req: Request) {
    const url = new URL(req.url);
    if (
      req.method === 'GET' &&
      [
        '/history',
        '/sessions',
        '/messages',
        '/event',
        '/checkpoint-files',
        '/checkpoint-file',
      ].includes(url.pathname)
    ) {
      try {
        return queryHistory(this.ctx.storage.sql, url);
      } catch (error) {
        if (error instanceof HttpError) return json({ error: error.message }, error.status);
        if (error instanceof z.ZodError) return json({ error: 'Invalid history query' }, 400);
        throw error;
      }
    }
    if (url.pathname === '/authorization-barrier')
      return this.ctx.blockConcurrencyWhile(async () => {
        await this.broadcastPresence();
        return json({ ok: true });
      });
    if (url.pathname === '/access') {
      const { project, actor, user, role } = await req.json<{
        project: string;
        actor: Actor;
        user: string;
        role: string | null;
      }>();
      return this.ctx.blockConcurrencyWhile(async () => {
        const owner = await this.env.DB.prepare(
          "SELECT p.team_id FROM projects p JOIN team_members m ON m.team_id=p.team_id JOIN sessions s ON s.user_id=m.user_id WHERE p.id=? AND m.user_id=? AND m.role='owner' AND s.token_hash=? AND s.expires_at>?",
        )
          .bind(project, actor.id, actor.tokenHash, Date.now())
          .first<{ team_id: string }>();
        if (!owner) return json({ error: 'Team owner access required' }, 403);
        const current = await this.env.DB.prepare(
          'SELECT role FROM project_members WHERE project_id=? AND user_id=?',
        )
          .bind(project, user)
          .first<{ role: string }>();
        if (current?.role === 'owner') return json({ error: 'Cannot change project owner' }, 409);
        if (role)
          await this.env.DB.prepare(
            'INSERT INTO project_members SELECT ?,user_id,? FROM team_members WHERE team_id=? AND user_id=? ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role',
          )
            .bind(project, role, owner.team_id, user)
            .run();
        else
          await this.env.DB.prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?')
            .bind(project, user)
            .run();
        this.ctx.waitUntil(this.broadcastPresence());
        return json({ ok: true });
      });
    }
    if (url.pathname === '/live') {
      if (this.ctx.getWebSockets().length >= 40)
        return json({ error: 'Room connection limit reached' }, 429);
      const pair = new WebSocketPair(),
        client = pair[0],
        server = pair[1];
      server.serializeAttachment({
        user: req.headers.get('X-Actor')!,
        project: req.headers.get('X-Project')!,
        session: req.headers.get('X-Session')!,
        expiresAt: Number(req.headers.get('X-Expiry')),
      } satisfies SocketIdentity);
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: 'ready', head: this.head() }));
      this.ctx.waitUntil(this.broadcastPresence());
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/reference') {
      const row = this.ctx.storage.sql
        .exec<{ body: string }>(
          'SELECT body FROM events WHERE event_id=?',
          url.searchParams.get('id') ?? '',
        )
        .toArray()[0];
      return row ? json(JSON.parse(row.body)) : json({ error: 'Not found' }, 404);
    }
    if (req.method === 'GET') {
      const after = Number(url.searchParams.get('after') ?? 0);
      const rows = this.ctx.storage.sql
        .exec<{ seq: number; body: string }>(
          'SELECT seq,body FROM events WHERE seq>? ORDER BY seq LIMIT 101',
          after,
        )
        .toArray();
      const page = rows.slice(0, 100);
      return json({
        events: page.map((r) => ({ ...JSON.parse(r.body), seq: r.seq })),
        cursor: page.at(-1)?.seq ?? after,
        hasMore: rows.length > 100,
      });
    }
    const { event, actor, project } = await req.json<{
      event: z.infer<typeof eventSchema>;
      actor: Actor;
      project: string;
    }>();
    const fingerprint = await hash(JSON.stringify({ event, actorId: actor.id }));
    return this.ctx.blockConcurrencyWhile(async () => {
      const allowed = await this.env.DB.prepare(
        "SELECT 1 FROM project_members m JOIN sessions s ON s.user_id=m.user_id JOIN workspaces w ON w.user_id=m.user_id AND w.project_id=m.project_id WHERE m.project_id=? AND m.user_id=? AND m.role IN ('owner','editor') AND s.token_hash=? AND s.expires_at>? AND w.id=?",
      )
        .bind(project, actor.id, actor.tokenHash, Date.now(), event.workspaceId)
        .first();
      if (!allowed) return json({ error: 'Publishing access expired' }, 403);
      const old = this.ctx.storage.sql
        .exec<{ seq: number; fingerprint: string }>(
          'SELECT seq,fingerprint FROM events WHERE event_id=?',
          event.id,
        )
        .toArray()[0];
      if (old) {
        if (old.fingerprint !== fingerprint)
          return json({ error: 'Event ID already has different content' }, 409);
        await this.ctx.storage.sync();
        return json({ id: event.id, seq: old.seq, duplicate: true });
      }
      const stored = {
        ...event,
        actor: { id: actor.id, name: actor.name },
        receivedAt: Date.now(),
      };
      const row = this.ctx.storage.sql
        .exec<{ seq: number }>(
          'INSERT INTO events(event_id,fingerprint,body) VALUES(?,?,?) RETURNING seq',
          event.id,
          fingerprint,
          JSON.stringify(stored),
        )
        .one();
      await this.ctx.storage.sync();
      this.ctx.waitUntil(this.broadcast({ type: 'events.available', head: row.seq }));
      return json({ id: event.id, seq: row.seq, duplicate: false });
    });
  }
  head() {
    return this.ctx.storage.sql
      .exec<{ head: number }>('SELECT COALESCE(MAX(seq),0) AS head FROM events')
      .one().head;
  }
  async allowed(ws: WebSocket) {
    const a = ws.deserializeAttachment() as SocketIdentity;
    if (!a || a.expiresAt < Date.now()) return false;
    const row = await this.env.DB.prepare(
      'SELECT 1 FROM project_members m JOIN sessions s ON s.user_id=m.user_id WHERE m.project_id=? AND m.user_id=? AND s.token_hash=? AND s.expires_at>?',
    )
      .bind(a.project, a.user, a.session, Date.now())
      .first();
    return !!row;
  }
  async broadcast(message: unknown) {
    await Promise.all(
      this.ctx.getWebSockets().map(async (ws) => {
        try {
          if (!(await this.allowed(ws))) ws.close(1008, 'Access expired');
          else ws.send(JSON.stringify(message));
        } catch {
          try {
            ws.close(1011, 'Connection failed');
          } catch {}
        }
      }),
    );
  }
  async broadcastPresence() {
    const sockets = await Promise.all(
      this.ctx.getWebSockets().map(async (ws) => {
        try {
          if (await this.allowed(ws)) return ws;
          ws.close(1008, 'Access expired');
        } catch {
          try {
            ws.close(1011, 'Connection failed');
          } catch {}
        }
        return null;
      }),
    );
    const users = [
      ...new Set(
        sockets
          .filter((ws): ws is WebSocket => ws !== null)
          .map((ws) => (ws.deserializeAttachment() as SocketIdentity).user),
      ),
    ];
    await this.broadcast({ type: 'presence', users });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > 100 || !(await this.allowed(ws))) {
      ws.close(1008, 'Invalid client');
      return;
    }
    if (message === 'ping') ws.send(JSON.stringify({ type: 'pong', head: this.head() }));
  }
  async webSocketClose() {
    await this.broadcastPresence();
  }
  webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, 'Socket error');
    } catch {}
  }
}
