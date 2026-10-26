import { z } from 'zod';
import { taskInput, taskUpdate, commentInput, handoffInput } from '../../shared/src/collaboration';
import { idSchema, redact } from '../../shared/src/protocol';
import { body, HttpError, json } from './http';
import type { Env, Actor } from './types';
export async function collaboration(
  req: Request,
  env: Env,
  actor: Actor,
  project: string,
  role: string,
): Promise<Response | null> {
  const p = new URL(req.url).pathname.split('/').filter(Boolean),
    section = p[3];
  if (!['collaboration', 'tasks', 'comments', 'handoffs'].includes(section)) return null;
  if (req.method === 'GET') {
    const before = z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .parse(new URL(req.url).searchParams.get('before') ?? Number.MAX_SAFE_INTEGER);
    const sections = section === 'collaboration' ? ['tasks', 'comments', 'handoffs'] : [section];
    const result: Record<string, unknown> = {},
      next: Record<string, number | null> = {};
    for (const table of sections) {
      // rowid is an immutable insertion cursor: task edits cannot move an older row past it.
      const page = await env.DB.prepare(
        table === 'comments'
          ? 'SELECT c.*,c.rowid AS history_cursor,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.project_id=? AND c.rowid<? ORDER BY c.rowid DESC LIMIT 51'
          : `SELECT *,rowid AS history_cursor FROM ${table} WHERE project_id=? AND rowid<? ORDER BY rowid DESC LIMIT 51`,
      )
        .bind(project, before)
        .all<any>();
      const items = page.results.slice(0, 50);
      next[table] = page.results.length > 50 ? items.at(-1).history_cursor : null;
      result[table] = items.map(({ history_cursor, ...item }: any) => item);
    }
    return json({ ...result, next });
  }
  if (role === 'viewer') throw new HttpError(403, 'Viewer access is read only');
  const member = async (user: string | null) => {
    if (
      user &&
      !(await env.DB.prepare(
        "SELECT 1 FROM project_members WHERE project_id=? AND user_id=? AND role!='viewer'",
      )
        .bind(project, user)
        .first())
    )
      throw new HttpError(400, 'Recipient must be a project editor');
  };
  const task = async (id: string | null) => {
    if (
      id &&
      !(await env.DB.prepare('SELECT 1 FROM tasks WHERE id=? AND project_id=?')
        .bind(id, project)
        .first())
    )
      throw new HttpError(400, 'Task is outside this project');
  };
  const input = await body(req, 32000),
    id = crypto.randomUUID();
  const access =
    "EXISTS(SELECT 1 FROM project_members m JOIN sessions s ON s.user_id=m.user_id WHERE m.project_id=? AND m.user_id=? AND m.role IN ('owner','editor') AND s.token_hash=? AND s.expires_at>?)";
  const publish = async (sql: string, values: (string | number | null)[]) => {
    const result = await env.DB.prepare(sql)
      .bind(...values, project, actor.id, actor.tokenHash, Date.now())
      .run();
    if (!result.meta.changes) {
      const allowed = await env.DB.prepare(`SELECT 1 WHERE ${access}`)
        .bind(project, actor.id, actor.tokenHash, Date.now())
        .first();
      if (!allowed) throw new HttpError(403, 'Project publishing access expired');
      throw new HttpError(409, 'The write was not committed; refresh and retry');
    }
    return result;
  };
  if (section === 'tasks' && req.method === 'POST') {
    const data = taskInput.parse(input);
    await member(data.assignee);
    await publish(
      `INSERT INTO tasks(id,project_id,title,description,assignee,created_by,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${access}`,
      [
        id,
        project,
        redact(data.title),
        redact(data.description),
        data.assignee,
        actor.id,
        Date.now(),
      ],
    );
    return json({ id }, 201);
  }
  if (section === 'tasks' && p[4] && req.method === 'PATCH') {
    const data = taskUpdate.parse(input);
    await member(data.assignee);
    const result = await publish(
      `UPDATE tasks SET title=?,description=?,assignee=?,status=?,version=version+1,updated_at=? WHERE id=? AND project_id=? AND version=? AND ${access}`,
      [
        redact(data.title),
        redact(data.description),
        data.assignee,
        data.status,
        Date.now(),
        idSchema.parse(p[4]),
        project,
        data.version,
      ],
    );
    if (!result.meta.changes) throw new HttpError(409, 'Task changed; refresh before saving');
    return json({ ok: true });
  }
  if (section === 'comments' && req.method === 'POST') {
    const data = commentInput.parse(input);
    await task(data.taskId);
    await publish(`INSERT INTO comments SELECT ?,?,?,?,?,? WHERE ${access}`, [
      id,
      project,
      data.taskId,
      actor.id,
      redact(data.text),
      Date.now(),
    ]);
    return json({ id }, 201);
  }
  if (section === 'handoffs' && req.method === 'POST') {
    const data = handoffInput.parse(input);
    await member(data.toUser);
    await task(data.taskId);
    if (data.toUser === actor.id) throw new HttpError(400, 'Choose another member');
    if (data.eventId) {
      const ref = await env.PROJECTS.getByName(project).fetch(
        new Request('https://room/reference?id=' + encodeURIComponent(data.eventId)),
      );
      if (!ref.ok) throw new HttpError(400, 'Referenced activity is unavailable in this project');
    }
    await publish(`INSERT INTO handoffs SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${access}`, [
      id,
      project,
      actor.id,
      data.toUser,
      redact(data.title),
      redact(data.context),
      redact(data.nextSteps),
      data.eventId,
      data.taskId,
      'pending',
      Date.now(),
    ]);
    return json({ id }, 201);
  }
  if (section === 'handoffs' && req.method === 'PATCH' && p[4]) {
    const data = z
      .object({ status: z.enum(['accepted', 'declined']) })
      .strict()
      .parse(input);
    const result = await publish(
      `UPDATE handoffs SET status=? WHERE id=? AND project_id=? AND to_user=? AND status='pending' AND ${access}`,
      [data.status, idSchema.parse(p[4]), project, actor.id],
    );
    if (!result.meta.changes)
      throw new HttpError(409, 'Only the recipient may respond to a pending handoff');
    return json({ ok: true });
  }
  throw new HttpError(404, 'Collaboration operation not found');
}
