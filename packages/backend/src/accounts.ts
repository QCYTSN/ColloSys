import { scryptSync } from 'node:crypto';
import { z } from 'zod';
import { body, hash, HttpError, json, loopback } from './http';
import type { Env, Actor } from './types';
const loginInput = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9_.-]{2,39}$/),
    password: z.string().min(12).max(128),
  })
  .strict();
async function verifier(password: string, salt: string, env: Env) {
  // A server-held pepper protects a stolen database. It must be backed up separately.
  const pepper =
    env.AUTH_PEPPER ??
    (env.AUTH_MODE === 'development' ? 'local-development-pepper-not-for-production' : '');
  if (pepper.length < 32)
    throw new HttpError(503, 'Configure AUTH_PEPPER before enabling accounts');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const prehash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(password));
  return scryptSync(new Uint8Array(prehash), salt, 32, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  }).toString('hex');
}
function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function limit(env: Env, key: string, max: number) {
  const window = Math.floor(Date.now() / 900000);
  const row = await env.DB.prepare(
    'INSERT INTO auth_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN auth_limits.window=excluded.window THEN auth_limits.count+1 ELSE 1 END RETURNING count',
  )
    .bind(await hash(key), window)
    .first<{ count: number }>();
  if (row!.count > max) throw new HttpError(429, 'Too many attempts; retry in 15 minutes');
  await env.DB.prepare('DELETE FROM auth_limits WHERE window<?')
    .bind(window - 2)
    .run();
}
export async function issueSession(
  env: Env,
  user: { id: string; name: string },
  expectedVerifier?: string,
) {
  const token = crypto.randomUUID() + crypto.randomUUID(),
    expiresAt = Date.now() + 7 * 86400000;
  const tokenHash = await hash(token);
  const result = expectedVerifier
    ? await env.DB.prepare(
        'INSERT INTO sessions SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM credentials WHERE user_id=? AND verifier=?)',
      )
        .bind(tokenHash, user.id, expiresAt, user.id, expectedVerifier)
        .run()
    : await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)')
        .bind(tokenHash, user.id, expiresAt)
        .run();
  if (!result.meta.changes) throw new HttpError(401, 'Credentials changed; sign in again');
  return { token, user, expiresAt };
}
export async function accounts(req: Request, env: Env): Promise<Response | null> {
  const url = new URL(req.url);
  if (!['/api/auth/register', '/api/auth/login'].includes(url.pathname) || req.method !== 'POST')
    return null;
  if (!loopback(url.hostname) && url.protocol !== 'https:')
    throw new HttpError(403, 'HTTPS is required');
  await limit(env, `ip:${req.headers.get('CF-Connecting-IP') ?? 'local'}`, 100);
  const raw = await body(req, 4096);
  const input = loginInput.extend({ name: z.string().trim().min(1).max(80).optional() }).parse(raw);
  await limit(env, `account:${input.username}`, 10);
  if (url.pathname.endsWith('register')) {
    const salt = crypto.randomUUID(),
      id = crypto.randomUUID();
    const value = await verifier(input.password, salt, env);
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO users VALUES(?,?)').bind(id, input.name ?? input.username),
        env.DB.prepare('INSERT INTO credentials VALUES(?,?,?,?)').bind(
          id,
          input.username,
          salt,
          value,
        ),
      ]);
    } catch (e) {
      if (String(e).includes('UNIQUE')) throw new HttpError(409, 'Username unavailable');
      throw e;
    }
    return json(await issueSession(env, { id, name: input.name ?? input.username }), 201);
  }
  const found = await env.DB.prepare(
    'SELECT c.*,u.name FROM credentials c JOIN users u ON u.id=c.user_id WHERE username=?',
  )
    .bind(input.username)
    .first<{ user_id: string; name: string; salt: string; verifier: string }>();
  const value = await verifier(input.password, found?.salt ?? 'invalid-account-salt', env);
  if (!found || !equal(value, found.verifier))
    throw new HttpError(401, 'Username or password is incorrect');
  return json(await issueSession(env, { id: found.user_id, name: found.name }, found.verifier));
}
export async function changePassword(req: Request, env: Env, actor: Actor) {
  const input = z
    .object({ currentPassword: z.string().max(128), password: z.string().min(12).max(128) })
    .strict()
    .parse(await body(req, 4096));
  await limit(env, `password:${actor.id}`, 10);
  const current = await env.DB.prepare('SELECT salt,verifier FROM credentials WHERE user_id=?')
    .bind(actor.id)
    .first<{ salt: string; verifier: string }>();
  if (
    !current ||
    !equal(await verifier(input.currentPassword, current.salt, env), current.verifier)
  )
    throw new HttpError(401, 'Current password is incorrect');
  const salt = crypto.randomUUID(),
    value = await verifier(input.password, salt, env);
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE credentials SET salt=?,verifier=? WHERE user_id=? AND verifier=?').bind(
      salt,
      value,
      actor.id,
      current.verifier,
    ),
    env.DB.prepare(
      'DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM credentials WHERE user_id=? AND verifier=?)',
    ).bind(actor.id, actor.id, value),
  ]);
  if (!results[0].meta.changes) throw new HttpError(409, 'Credentials changed; sign in again');
  return json({ ok: true, signInAgain: true });
}
