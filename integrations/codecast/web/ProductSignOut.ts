import { useCallback } from 'react';
import { ConvexHttpClient } from 'convex/browser';
import { AUTH_JWT_STORAGE_KEY, AUTH_STORAGE_KEYS, CONVEX_URL } from '../lib/localAuth';
import { purgeDurableAuthValues } from '../lib/durableAuthStorage';
import { clearProtectedInboxMemory } from '../store/inboxStore';
import { purgeLocalCache } from '../store/idbCache';
import { invalidateAuthRequests } from './productAuthPolicy';

export const VERIFIED_DEVICE_KEY = 'collosys.verified-device.v1';
export async function clearProductSession() {
  invalidateAuthRequests();
  localStorage.removeItem(VERIFIED_DEVICE_KEY);
  clearProtectedInboxMemory();
  // Purge marks all four keys removed synchronously before its IDB await.
  await purgeDurableAuthValues(AUTH_STORAGE_KEYS);
  await purgeLocalCache();
}
export function useProductSignOut() {
  return useCallback(async () => {
    const token = localStorage.getItem(AUTH_JWT_STORAGE_KEY);
    const client = new ConvexHttpClient(CONVEX_URL);
    if (token) client.setAuth(token);
    // Revoke the captured session, never a newly signed-in account. Begin the
    // request before clearing auth, but don't wait for the network to hide UI.
    const revoked = token
      ? client.action('auth:signOut' as any, {}).then(
          () => true,
          () => false,
        )
      : Promise.resolve(true);
    await clearProductSession();
    const ok = await Promise.race([
      revoked,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
    ]);
    if (!ok)
      throw new Error(
        'Signed out on this device. The service could not confirm revocation of the previous session; reconnect and revoke it from account settings.',
      );
  }, []);
}
