import { z } from 'zod';
import { idSchema } from '../../shared/src/protocol';
import { body, HttpError, json } from './http';
import type { Env, Actor } from './types';
const LIMIT = 24 * 1024 * 1024;
export async function backups(
  req: Request,
  env: Env,
  actor: Actor,
  project: string,
): Promise<Response | null> {
  const p = new URL(req.url).pathname.split('/').filter(Boolean);
  if (p[3] !== 'backups') return null;
  if (!env.BACKUPS) throw new HttpError(503, 'Backup storage is not configured');
  if (p.length === 4 && req.method === 'GET')
    return json({
      location: env.BACKUP_LOCATION ?? 'local-object-storage',
      backups: (
        await env.DB.prepare(
          'SELECT id,checkpoint_id,size,digest,status,created_at FROM backup_objects WHERE project_id=? AND user_id=? ORDER BY created_at DESC LIMIT 500',
        )
          .bind(project, actor.id)
          .all()
      ).results,
    });
  if (p.length === 4 && req.method === 'POST') {
    const input = z
      .object({
        id: idSchema,
        checkpointId: idSchema,
        size: z.number().int().min(48).max(LIMIT),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(await body(req, 2048));
    const prior = await env.DB.prepare('SELECT * FROM backup_objects WHERE id=?')
      .bind(input.id)
      .first<{
        project_id: string;
        user_id: string;
        digest: string;
        size: number;
        checkpoint_id: string;
      }>();
    if (prior) {
      if (
        prior.project_id !== project ||
        prior.user_id !== actor.id ||
        prior.digest !== input.digest ||
        prior.size !== input.size ||
        prior.checkpoint_id !== input.checkpointId
      )
        throw new HttpError(409, 'Backup ID conflict');
    } else
      await env.DB.prepare('INSERT INTO backup_objects VALUES(?,?,?,?,?,?,?,?)')
        .bind(
          input.id,
          project,
          actor.id,
          input.checkpointId,
          input.size,
          input.digest,
          'pending',
          Date.now(),
        )
        .run();
    return json({ id: input.id });
  }
  const id = idSchema.parse(p[4]);
  const record = await env.DB.prepare(
    'SELECT b.*,g.generation FROM backup_objects b JOIN backup_generations g ON g.id=b.id WHERE b.id=? AND b.project_id=? AND b.user_id=?',
  )
    .bind(id, project, actor.id)
    .first<{ size: number; digest: string; status: string; generation: string }>();
  if (!record) throw new HttpError(404, 'Backup not found');
  const key = `${project}/${actor.id}/${id}${record.generation === 'legacy' ? '' : '/' + record.generation}`;
  if (req.method === 'PUT') {
    if (Number(req.headers.get('Content-Length')) !== record.size)
      throw new HttpError(400, 'Backup size mismatch');
    const reader = req.body?.getReader();
    if (!reader) throw new HttpError(400, 'Backup body missing');
    const data = new Uint8Array(record.size);
    let offset = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > data.length) {
        await reader.cancel();
        throw new HttpError(413, 'Backup too large');
      }
      data.set(value, offset);
      offset += value.length;
    }
    if (offset !== data.length) throw new HttpError(400, 'Incomplete backup');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('');
    if (digest !== record.digest) throw new HttpError(400, 'Backup digest mismatch');
    await env.BACKUPS.put(key, data, {
      httpMetadata: { contentType: 'application/octet-stream' },
      sha256: record.digest,
    });
    const updated = await env.DB.prepare(
      "UPDATE backup_objects SET status='complete' WHERE id=? AND project_id=? AND user_id=? AND digest=? AND size=? AND EXISTS(SELECT 1 FROM backup_generations WHERE id=? AND generation=?)",
    )
      .bind(id, project, actor.id, record.digest, record.size, id, record.generation)
      .run();
    if (!updated.meta.changes) {
      await env.BACKUPS.delete(key);
      throw new HttpError(409, 'Backup was deleted during upload');
    }
    return json({ id, verified: true, location: env.BACKUP_LOCATION ?? 'local-object-storage' });
  }
  if (req.method === 'GET') {
    if (record.status !== 'complete') throw new HttpError(409, 'Backup upload is incomplete');
    const object = await env.BACKUPS.get(key);
    if (!object) throw new HttpError(404, 'Backup object missing');
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(record.size),
        'Cache-Control': 'no-store',
        'X-Backup-Digest': record.digest,
      },
    });
  }
  if (req.method === 'DELETE') {
    await env.DB.prepare(
      'DELETE FROM backup_objects WHERE id=? AND project_id=? AND user_id=? AND EXISTS(SELECT 1 FROM backup_generations WHERE id=? AND generation=?)',
    )
      .bind(id, project, actor.id, id, record.generation)
      .run();
    await env.BACKUPS.delete(key);
    return json({ ok: true });
  }
  throw new HttpError(405, 'Method not allowed');
}
