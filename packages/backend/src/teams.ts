import { z } from 'zod';
import { idSchema } from '../../shared/src/protocol';
import { body, hash, HttpError, json } from './http';
import type { Env, Actor } from './types';
async function changeAccess(
  env: Env,
  project: string,
  actor: Actor,
  user: string,
  role: string | null,
) {
  const response = await env.PROJECTS.get(env.PROJECTS.idFromName(project)).fetch(
    new Request('https://room/access', {
      method: 'POST',
      body: JSON.stringify({ project, actor, user, role }),
    }),
  );
  if (!response.ok) throw new HttpError(response.status, 'Project access update failed');
}
async function teamRole(env: Env, team: string, user: string, owner = false) {
  const row = await env.DB.prepare('SELECT role FROM team_members WHERE team_id=? AND user_id=?')
    .bind(team, user)
    .first<{ role: string }>();
  if (!row || (owner && row.role !== 'owner'))
    throw new HttpError(403, 'Team access is not allowed');
  return row;
}
export async function teams(req: Request, env: Env, actor: Actor): Promise<Response | null> {
  const p = new URL(req.url).pathname.split('/').filter(Boolean),
    method = req.method;
  if (p[1] === 'invitations' && p[2] === 'accept' && method === 'POST') {
    const input = z
        .object({ token: z.string().min(32).max(100) })
        .strict()
        .parse(await body(req, 1024)),
      tokenHash = await hash(input.token);
    const invite = await env.DB.prepare(
      'SELECT * FROM invitations WHERE token_hash=? AND expires_at>? AND claimed_by IS NULL',
    )
      .bind(tokenHash, Date.now())
      .first<{ team_id: string; project_id: string | null; role: string }>();
    if (!invite) throw new HttpError(410, 'Invitation expired, revoked or already used');
    const statements = [
      env.DB.prepare(
        'UPDATE invitations SET claimed_by=? WHERE token_hash=? AND claimed_by IS NULL AND expires_at>?',
      ).bind(actor.id, tokenHash, Date.now()),
      env.DB.prepare(
        "INSERT OR IGNORE INTO team_members SELECT team_id,?,'member' FROM invitations WHERE token_hash=? AND claimed_by=?",
      ).bind(actor.id, tokenHash, actor.id),
    ];
    if (invite.project_id)
      statements.push(
        env.DB.prepare(
          'INSERT OR IGNORE INTO project_members SELECT project_id,?,role FROM invitations WHERE token_hash=? AND claimed_by=?',
        ).bind(actor.id, tokenHash, actor.id),
      );
    const results = await env.DB.batch(statements);
    if (!results[0].meta.changes) throw new HttpError(409, 'Invitation already used');
    return json({ teamId: invite.team_id, projectId: invite.project_id });
  }
  if (p[1] !== 'teams') return null;
  if (p.length === 2 && method === 'GET')
    return json({
      teams: (
        await env.DB.prepare(
          'SELECT t.*,m.role FROM teams t JOIN team_members m ON t.id=m.team_id WHERE m.user_id=?',
        )
          .bind(actor.id)
          .all()
      ).results,
    });
  if (p.length === 2 && method === 'POST') {
    const { name } = z
        .object({ name: z.string().trim().min(1).max(80) })
        .strict()
        .parse(await body(req, 2048)),
      id = crypto.randomUUID();
    const count = await env.DB.prepare(
      "SELECT COUNT(*) n FROM team_members WHERE user_id=? AND role='owner'",
    )
      .bind(actor.id)
      .first<{ n: number }>();
    if (count!.n >= 20) throw new HttpError(409, 'Team limit reached');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO teams VALUES(?,?)').bind(id, name),
      env.DB.prepare("INSERT INTO team_members VALUES(?,?,'owner')").bind(id, actor.id),
    ]);
    return json({ id, name }, 201);
  }
  const team = idSchema.parse(p[2]);
  await teamRole(env, team, actor.id, method !== 'GET');
  if (p.length === 3 && method === 'GET')
    return json({
      members: (
        await env.DB.prepare(
          'SELECT u.id,u.name,m.role FROM team_members m JOIN users u ON u.id=m.user_id WHERE team_id=?',
        )
          .bind(team)
          .all()
      ).results,
      projects: (
        await env.DB.prepare(
          'SELECT p.id,p.name FROM projects p JOIN project_members m ON m.project_id=p.id WHERE p.team_id=? AND m.user_id=?',
        )
          .bind(team, actor.id)
          .all()
      ).results,
      invitations: (
        await env.DB.prepare(
          'SELECT id,project_id,role,expires_at,claimed_by FROM invitations WHERE team_id=? ORDER BY expires_at DESC LIMIT 100',
        )
          .bind(team)
          .all()
      ).results,
    });
  if (p[3] === 'projects' && method === 'POST') {
    const { name } = z
        .object({ name: z.string().trim().min(1).max(80) })
        .strict()
        .parse(await body(req, 2048)),
      id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO projects VALUES(?,?,?)').bind(id, team, name),
      env.DB.prepare("INSERT INTO project_members VALUES(?,?,'owner')").bind(id, actor.id),
    ]);
    return json({ id, name }, 201);
  }
  if (p[3] === 'invitations' && method === 'POST' && p.length === 4) {
    const input = z
      .object({ projectId: idSchema.nullable(), role: z.enum(['editor', 'viewer']) })
      .strict()
      .parse(await body(req, 2048));
    if (
      input.projectId &&
      !(await env.DB.prepare('SELECT 1 FROM projects WHERE id=? AND team_id=?')
        .bind(input.projectId, team)
        .first())
    )
      throw new HttpError(400, 'Project is outside this team');
    const id = crypto.randomUUID(),
      token = crypto.randomUUID() + crypto.randomUUID(),
      expiresAt = Date.now() + 86400000;
    await env.DB.prepare('INSERT INTO invitations VALUES(?,?,?,?,?,?,?,NULL)')
      .bind(id, await hash(token), team, input.projectId, input.role, actor.id, expiresAt)
      .run();
    return json({ id, token, expiresAt }, 201);
  }
  if (p[3] === 'invitations' && p[4] && method === 'DELETE') {
    await env.DB.prepare('UPDATE invitations SET expires_at=0 WHERE id=? AND team_id=?')
      .bind(idSchema.parse(p[4]), team)
      .run();
    return json({ ok: true });
  }
  if (p[3] === 'members' && p[4] && method === 'DELETE') {
    const user = idSchema.parse(p[4]);
    const role = await env.DB.prepare('SELECT role FROM team_members WHERE team_id=? AND user_id=?')
      .bind(team, user)
      .first<{ role: string }>();
    if (role?.role === 'owner') throw new HttpError(409, 'Team owner cannot be removed');
    const projects = await env.DB.prepare('SELECT id FROM projects WHERE team_id=?')
      .bind(team)
      .all<{ id: string }>();
    // A concurrent grant cannot outlive the team membership it selects.
    await env.DB.batch([
      env.DB.prepare(
        'DELETE FROM project_members WHERE user_id=? AND project_id IN (SELECT id FROM projects WHERE team_id=?)',
      ).bind(user, team),
      env.DB.prepare('DELETE FROM team_members WHERE team_id=? AND user_id=?').bind(team, user),
    ]);
    for (const project of projects.results) {
      const response = await env.PROJECTS.get(env.PROJECTS.idFromName(project.id)).fetch(
        new Request('https://room/authorization-barrier', { method: 'POST' }),
      );
      if (!response.ok)
        throw new HttpError(503, 'Membership removed; retry to finish revoking in-flight writes');
    }
    return json({ ok: true });
  }
  if (p[3] === 'project-access' && method === 'POST') {
    const input = z
      .object({
        projectId: idSchema,
        userId: idSchema,
        role: z.enum(['editor', 'viewer']).nullable(),
      })
      .strict()
      .parse(await body(req, 2048));
    await teamRole(env, team, input.userId);
    if (
      !(await env.DB.prepare('SELECT 1 FROM projects WHERE id=? AND team_id=?')
        .bind(input.projectId, team)
        .first())
    )
      throw new HttpError(404, 'Project not found');
    const member = await env.DB.prepare(
      'SELECT role FROM project_members WHERE project_id=? AND user_id=?',
    )
      .bind(input.projectId, input.userId)
      .first<{ role: string }>();
    if (member?.role === 'owner')
      throw new HttpError(409, 'Project owner access cannot be changed');
    await changeAccess(env, input.projectId, actor, input.userId, input.role);
    return json({ ok: true });
  }
  throw new HttpError(404, 'Team operation not found');
}
