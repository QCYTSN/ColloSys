import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { ConvexError } from 'convex/values';
import { eventSchema } from './colloProtocol';
import { serveBackups } from './colloBackupHttp';

const hash = async (s: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
export const serve = httpAction(async (ctx, request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  try {
    const backupResponse = await serveBackups(ctx, request);
    if (backupResponse) return backupResponse;
    const path = new URL(request.url).pathname;
    if (path === '/api/me' && request.method === 'GET')
      return json(await ctx.runQuery((internal as any).collo.me, {}));
    const match = path.match(
      /^\/api\/projects\/([a-zA-Z0-9_-]+)\/(members|devices|workspaces|events)$/,
    );
    if (!match) return json({ error: 'Not found' }, 404);
    const [, projectId, route] = match;
    if (route === 'members' && request.method === 'GET')
      return json(await ctx.runQuery((internal as any).collo.members, { projectId }));
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    // Bound streamed input too: a missing Content-Length is not an exception.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 512 * 1024) {
          await reader.cancel();
          return json({ error: 'Request too large' }, 413);
        }
        chunks.push(value);
      }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body))
      return json({ error: 'Expected a JSON object' }, 400);
    if (route === 'devices') {
      if (typeof body.workspaceId !== 'string') return json({ error: 'Workspace required' }, 400);
      const token =
        'collo_' +
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
      const result = await ctx.runMutation((internal as any).collo.issue, {
        projectId,
        workspaceId: body.workspaceId,
        hash: await hash(token),
      });
      return json({ ...result, token });
    }
    const token = request.headers.get('X-ColloSys-Device') || '';
    if (!/^collo_[a-f0-9]{64}$/.test(token))
      return json({ error: 'Device credential required' }, 401);
    const digest = await hash(token);
    if (route === 'workspaces')
      return json(
        await ctx.runMutation((internal as any).collo.register, {
          projectId,
          hash: digest,
          id: body.id,
          label: body.label,
        }),
      );
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) return json({ error: 'Invalid versioned event' }, 400);
    if (parsed.data.kind === 'checkpoint') {
      const upgrade = await ctx.runMutation((internal as any).colloCheckpoints.prepare, {
        projectId,
        hash: digest,
        checkpointId: parsed.data.payload.checkpointId,
      });
      if (!upgrade.valid)
        return json(
          { error: 'Persisted checkpoint has duplicate paths; capture a fresh checkpoint' },
          409,
        );
      if (!upgrade.ready)
        return json({ error: 'Checkpoint integrity upgrade in progress; retry delivery' }, 503);
    }
    return json(
      await ctx.runMutation((internal as any).collo.ingest, {
        projectId,
        hash: digest,
        raw: parsed.data,
        fingerprint: await hash(JSON.stringify(parsed.data)),
      }),
    );
  } catch (error) {
    const data = error instanceof ConvexError ? (error.data as any) : null;
    return json(
      { error: data?.message || 'Local collaboration request failed' },
      typeof data?.status === 'number' ? data.status : 500,
    );
  }
});
