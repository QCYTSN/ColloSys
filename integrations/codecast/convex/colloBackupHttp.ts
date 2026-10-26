import { internal } from './_generated/api';
import type { ActionCtx } from './_generated/server';
import { BACKUP_LIMIT, BACKUP_CHUNK, BACKUP_TYPE } from './colloBackups';
import { fail } from './colloAccess';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
export async function readBounded(request: Request, limit: number) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit))
    return fail(413, 'Request too large');
  const reader = request.body?.getReader(),
    bytes = new Uint8Array(limit);
  let size = 0;
  if (reader)
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.byteLength > limit) {
        await reader.cancel();
        return fail(413, 'Request too large');
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  return bytes.subarray(0, size);
}
export const sha256 = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');

export async function serveBackups(ctx: ActionCtx, request: Request): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(
    /^\/api\/projects\/([a-zA-Z0-9_-]+)\/backups(?:\/([a-zA-Z0-9_-]+))?$/,
  );
  if (!match) return null;
  const [, projectId, id] = match;
  const token = request.headers.get('X-ColloSys-Device');
  if (token !== null && !/^collo_[a-f0-9]{64}$/.test(token))
    return fail(401, 'Invalid device credential');
  const scope = {
    projectId,
    ...(token ? { hash: await sha256(new TextEncoder().encode(token)) } : {}),
  };
  const api = (internal as any).colloBackups;
  if (!id && request.method === 'GET') return json(await ctx.runQuery(api.listInternal, scope));
  if (!id && request.method === 'POST') {
    // Authenticate before reading even the small manifest body.
    await ctx.runQuery(api.listInternal, scope);
    let manifest: any;
    try {
      manifest = JSON.parse(new TextDecoder().decode(await readBounded(request, 2048)));
    } catch {
      return fail(400, 'Invalid backup manifest');
    }
    if (
      !manifest ||
      Array.isArray(manifest) ||
      Object.keys(manifest).sort().join(',') !== 'checkpointId,digest,id,size' ||
      typeof manifest.id !== 'string' ||
      typeof manifest.checkpointId !== 'string' ||
      typeof manifest.digest !== 'string' ||
      typeof manifest.size !== 'number'
    )
      return fail(400, 'Invalid backup manifest');
    if (scope.hash) {
      const upgraded = await ctx.runMutation((internal as any).colloCheckpoints.prepare, {
        ...scope,
        checkpointId: manifest.checkpointId,
      });
      if (!upgraded.valid) return fail(409, 'Checkpoint integrity check failed');
      if (!upgraded.ready)
        return fail(503, 'Checkpoint integrity upgrade in progress; retry backup');
    }
    return json(await ctx.runMutation(api.reserve, { ...scope, ...manifest }));
  }
  if (!id) return json({ error: 'Method not allowed' }, 405);
  const args = { ...scope, id };
  if (request.method === 'DELETE') return json(await ctx.runMutation(api.remove, args));
  if (request.method !== 'GET' && request.method !== 'PUT')
    return json({ error: 'Method not allowed' }, 405);
  const row = await ctx.runQuery(api.lookup, args);
  if (request.method === 'GET') {
    if (row.status !== 'complete' || !row.storageIds?.length)
      return fail(409, 'Backup upload is incomplete');
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (index >= row.storageIds.length) {
          controller.close();
          return;
        }
        try {
          const blob = await ctx.storage.get(row.storageIds[index++]);
          if (!blob) return fail(404, 'Backup object missing');
          const current = await ctx.runQuery(api.lookup, args);
          if (current._id !== row._id || current.status !== 'complete')
            return fail(409, 'Backup changed during download');
          controller.enqueue(new Uint8Array(await blob.arrayBuffer()));
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(row.size),
        'X-Backup-Digest': row.digest,
        'Cache-Control': 'no-store',
      },
    });
  }
  const bytes = await readBounded(request, Math.min(BACKUP_LIMIT, row.size));
  if (bytes.length !== row.size || (await sha256(bytes)) !== row.digest)
    return fail(400, 'Backup size or digest mismatch');
  if (new TextDecoder().decode(bytes.subarray(0, 9)) !== 'COLLOSYS1')
    return fail(400, 'Expected an encrypted checkpoint');
  // A repeated identical upload can acknowledge only after renewed authorization.
  const current = await ctx.runQuery(api.lookup, args);
  if (current._id !== row._id || (current.status === 'pending' && current.expiresAt <= Date.now()))
    return fail(409, 'Backup reservation expired or was replaced');
  if (current.status === 'complete')
    return json({ id, verified: true, location: 'local-convex-storage', remote: false });
  const storageIds = [];
  try {
    for (let offset = 0; offset < bytes.length; offset += BACKUP_CHUNK)
      storageIds.push(
        await ctx.storage.store(
          new Blob([bytes.subarray(offset, offset + BACKUP_CHUNK) as Uint8Array<ArrayBuffer>], {
            type: BACKUP_TYPE,
          }),
        ),
      );
    return json(await ctx.runMutation(api.commit, { ...args, reservation: row._id, storageIds }));
  } catch (error) {
    for (const storageId of storageIds) await ctx.storage.delete(storageId);
    throw error;
  }
}
