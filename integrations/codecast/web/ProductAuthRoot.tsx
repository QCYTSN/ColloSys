import { useMemo, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { ConvexProviderWithAuth, type ConvexReactClient } from 'convex/react';
import { ConvexHttpClient } from 'convex/browser';
import { AuthPrincipalBoundary } from '@platform/auth/web';
// This adapter uses the exact installed SDK module shared by useAuthActions.
// It adds a request fence; it does not issue tokens or maintain another account store.
import { AuthProvider, useAuth } from '@collosys/auth-runtime';
import { authPrincipal } from '../lib/authPrincipal';
import { durableAuthStorage } from '../lib/durableAuthStorage';
import { installAuthPrincipalBoundary } from '../store/principalBoundary';
import { CONVEX_URL, AUTH_JWT_STORAGE_KEY, AUTH_REFRESH_TOKEN_STORAGE_KEY } from '../lib/localAuth';
import {
  AUTH_GENERATION_EVENT,
  AUTH_GENERATION_KEY,
  OAUTH_PENDING_KEY,
  authGeneration,
  fencedAuthCall,
  isCurrentDesktopAttempt,
  sessionBlocked,
  beginExplicitSignIn,
} from './productAuthPolicy';
import { ProductStartupProvider } from './ProductStartup';

if (!import.meta.hot?.data?.principalBoundaryInstalled) {
  installAuthPrincipalBoundary();
  if (import.meta.hot) import.meta.hot.data.principalBoundaryInstalled = true;
}
function subscribeGeneration(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === AUTH_GENERATION_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(AUTH_GENERATION_EVENT, listener);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(AUTH_GENERATION_EVENT, listener);
  };
}
// The SDK awaits between JWT and refresh-token writes. Fence both, including
// a logout between those awaits and remounts caused by the JWT's new principal.
const responseGenerations = new Map<
  string,
  { generation: string; epoch: number; token?: string }
>();
function rememberResponse(result: any, generation: string, epoch: number) {
  for (const value of [result?.tokens?.token, result?.tokens?.refreshToken, result?.verifier]) {
    if (typeof value === 'string')
      responseGenerations.set(value, { generation, epoch, token: result?.tokens?.token });
  }
  while (responseGenerations.size > 64)
    responseGenerations.delete(responseGenerations.keys().next().value!);
}
function FencedProvider({ client, children }: { client: ConvexReactClient; children: ReactNode }) {
  const owner = useMemo(() => ({ epoch: authPrincipal.epoch(), generation: authGeneration() }), []);
  const authClient = useMemo(() => {
    const http = new ConvexHttpClient(CONVEX_URL);
    const invoke = async (call: () => Promise<any>, args?: any, callback = false) => {
      const generation = authGeneration();
      const epoch = authPrincipal.epoch();
      const exchangingCode = !args?.provider && typeof args?.params?.code === 'string';
      const validate = () => {
        authPrincipal.check();
        if (
          epoch !== authPrincipal.epoch() ||
          epoch !== owner.epoch ||
          generation !== owner.generation
        )
          throw new Error('The active account changed. Start sign-in again.');
        if (
          args?.provider === 'collosys-desktop-v1' &&
          !isCurrentDesktopAttempt(args.params?.attemptId)
        )
          throw new Error('Desktop sign-in was cancelled.');
        if (exchangingCode) {
          const pending = JSON.parse(sessionStorage.getItem(OAUTH_PENDING_KEY) || 'null');
          if (!pending || pending.generation !== generation || pending.expiresAt <= Date.now())
            throw new Error('This sign-in callback is no longer valid. Start again.');
        }
      };
      try {
        validate();
        // Only an explicit provider operation can reopen a logged-out device.
        // Refresh/callback traffic cannot resurrect an old durable token.
        if (args?.provider && !callback) beginExplicitSignIn();
        const result = await fencedAuthCall(call);
        validate();
        rememberResponse(result, generation, epoch);
        return result;
      } catch (error) {
        if (!exchangingCode) throw error;
        // SDK 0.0.79 does not catch the automatic URL-code promise. Complete
        // that attempt as signed out so the product can display its recovery
        // route rather than remain in SDK initialization forever. Stale-owner
        // removals are fenced below and cannot erase another account.
        if (owner.generation === authGeneration() && owner.epoch === authPrincipal.epoch())
          sessionStorage.removeItem(OAUTH_PENDING_KEY);
        return { tokens: null };
      }
    };
    return {
      authenticatedCall: (action, args) => invoke(() => client.action(action, args), args),
      unauthenticatedCall: (action, args) => invoke(() => http.action(action, args), args, true),
      verbose: false,
    } satisfies ComponentProps<typeof AuthProvider>['client'];
  }, [client, owner]);
  const storage = useMemo(
    () => ({
      getItem(key: string) {
        if (
          sessionBlocked() ||
          owner.generation !== authGeneration() ||
          owner.epoch !== authPrincipal.epoch()
        )
          return null;
        return durableAuthStorage.getItem(key);
      },
      removeItem(key: string) {
        authPrincipal.check();
        if (owner.generation !== authGeneration() || owner.epoch !== authPrincipal.epoch()) return;
        durableAuthStorage.removeItem(key);
      },
      setItem(key: string, value: string) {
        const response = responseGenerations.get(value);
        authPrincipal.check();
        if (sessionBlocked() || !response || response.generation !== authGeneration())
          throw new Error('Sign-in was cancelled.');
        if (
          key === AUTH_REFRESH_TOKEN_STORAGE_KEY
            ? localStorage.getItem(AUTH_JWT_STORAGE_KEY) !== response.token
            : response.epoch !== authPrincipal.epoch()
        )
          throw new Error('The active account changed.');
        durableAuthStorage.setItem(key, value);
      },
    }),
    [owner],
  );
  return (
    <AuthProvider
      client={authClient}
      storage={storage}
      storageNamespace={CONVEX_URL}
      replaceURL={(url) => window.history.replaceState({}, '', url)}
    >
      <ConvexProviderWithAuth client={client} useAuth={useAuth}>
        <ProductStartupProvider>{children}</ProductStartupProvider>
      </ConvexProviderWithAuth>
    </AuthProvider>
  );
}
export function ProductAuthRoot(props: { client: ConvexReactClient; children: ReactNode }) {
  const generation = useSyncExternalStore(subscribeGeneration, authGeneration, () => '');
  return (
    <AuthPrincipalBoundary tracker={authPrincipal}>
      <FencedProvider key={generation} {...props} />
    </AuthPrincipalBoundary>
  );
}
