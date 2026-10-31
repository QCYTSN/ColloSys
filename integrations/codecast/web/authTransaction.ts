import { authGeneration } from './productAuthPolicy';

export type AuthMethod = 'password' | 'github' | 'google';
export type AuthPhase =
  | 'idle'
  | 'initiating'
  | 'awaiting-provider'
  | 'submitting'
  | 'establishing-session'
  | 'succeeded'
  | 'cancelled'
  | 'failed'
  | 'expired';
export type AuthAttempt = {
  attemptId: string;
  method: AuthMethod;
  generation: string;
  phase: AuthPhase;
  owner: string;
};
const listeners = new Set<() => void>();
let current: AuthAttempt | null = null;
const active = new Set<AuthPhase>([
  'initiating',
  'awaiting-provider',
  'submitting',
  'establishing-session',
]);
export const authAttemptBusy = (value: AuthAttempt | null) =>
  !!value && active.has(value.phase) && value.generation === authGeneration();
export const getAuthAttempt = () => current;
export const subscribeAuthAttempt = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const publish = (value: AuthAttempt) => {
  current = value;
  for (const fn of listeners) fn();
};
export function acquireAuthAttempt(method: AuthMethod, owner: string): AuthAttempt | null {
  if (authAttemptBusy(current)) return null;
  const value: AuthAttempt = {
    attemptId: crypto.randomUUID(),
    method,
    owner,
    generation: authGeneration(),
    phase: 'initiating',
  };
  publish(value); // Synchronous lock, before the first await or React render.
  return value;
}
export function isCurrentAuthAttempt(value: Pick<AuthAttempt, 'attemptId' | 'generation'> | null) {
  return (
    !!value &&
    current?.attemptId === value.attemptId &&
    value.generation === authGeneration() &&
    !['cancelled', 'failed', 'expired'].includes(current.phase)
  );
}
export function transitionAuthAttempt(value: AuthAttempt, phase: AuthPhase) {
  // Success is terminal for presentation. The SDK may still finish the same
  // response's fenced refresh-token write, so it remains a valid response owner.
  if (isCurrentAuthAttempt(value) && current?.phase !== 'succeeded')
    publish({ ...current!, phase });
}
export function adoptAuthAttempt(owner: string) {
  if (authAttemptBusy(current)) publish({ ...current!, owner });
}
export function releaseAuthOwner(owner: string) {
  // A verified JWT can remount the principal boundary. Its same-route form
  // adopts the transaction in a layout effect before this microtask runs.
  queueMicrotask(() => {
    if (current?.owner === owner && authAttemptBusy(current))
      publish({ ...current, phase: 'cancelled' });
  });
}
let navigation: string | null = null;
export function claimAuthNavigation(destination: string) {
  const key = `${authGeneration()}\n${destination}`;
  if (navigation === key) return false;
  navigation = key;
  if (current && isCurrentAuthAttempt(current)) transitionAuthAttempt(current, 'succeeded');
  return true;
}
