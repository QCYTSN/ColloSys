/** Product destinations only. The auth callback itself uses a separate, exact allowlist. */
export function applicationDestination(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(raw))
    return '/projects';
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(decoded)) return '/projects';
    const url = new URL(raw, 'https://collosys.invalid');
    if (
      url.origin !== 'https://collosys.invalid' ||
      /^\/(?:login|signup|auth|forgot-password|reset-password)(?:\/|$)/i.test(
        decodeURIComponent(url.pathname),
      )
    )
      return '/projects';
    if (url.pathname === '/') return '/projects';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/projects';
  }
}

export type StartupPhase =
  'initializing' | 'restoring' | 'authenticated' | 'signed-out' | 'recoverable-error' | 'offline';
export type IdentityProvider = 'github' | 'google';
export const OAUTH_PENDING_KEY = 'collosys.oauth.pending.v1';
let desktopAttempt: string | null = null;
export const setDesktopAttempt = (id: string | null) => {
  desktopAttempt = id;
};
export const isCurrentDesktopAttempt = (id: unknown) =>
  typeof id === 'string' && id === desktopAttempt;
export const AUTH_GENERATION_KEY = 'collosys.auth.generation.v1';
export const AUTH_BLOCKED_KEY = 'collosys.auth.signed-out.v1';
export const AUTH_GENERATION_EVENT = 'collosys:auth-generation';
export const sessionBlocked = () => localStorage.getItem(AUTH_BLOCKED_KEY) === '1';
export function beginExplicitSignIn() {
  localStorage.removeItem(AUTH_BLOCKED_KEY);
  window.dispatchEvent(new Event(AUTH_GENERATION_EVENT));
}
export function subscribeAuthPolicy(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === AUTH_GENERATION_KEY || event.key === AUTH_BLOCKED_KEY)
      listener();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(AUTH_GENERATION_EVENT, listener);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(AUTH_GENERATION_EVENT, listener);
  };
}
export function authGeneration(): string {
  return localStorage.getItem(AUTH_GENERATION_KEY) ?? '';
}
export function invalidateAuthRequests(): string {
  // Fail closed if the cross-window fence cannot be persisted.
  const generation = crypto.randomUUID();
  localStorage.setItem(AUTH_BLOCKED_KEY, '1');
  localStorage.setItem(AUTH_GENERATION_KEY, generation);
  window.dispatchEvent(new Event(AUTH_GENERATION_EVENT));
  return generation;
}

/** Reject a response that belonged to an earlier sign-in/logout lifetime. */
export async function fencedAuthCall<T>(
  call: () => Promise<T>,
  readGeneration = authGeneration,
): Promise<T> {
  const generation = readGeneration();
  const result = await call();
  if (generation !== readGeneration())
    throw new Error('This sign-in request has ended. Start again.');
  return result;
}
