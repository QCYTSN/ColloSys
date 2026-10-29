import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useAuthToken } from '@convex-dev/auth/react';
import { useConvex, useConvexAuth } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { useRouter } from 'next/navigation';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { AppLoader } from './ProductLoader';
import {
  applicationDestination,
  authGeneration,
  sessionBlocked,
  subscribeAuthPolicy,
  type StartupPhase,
} from './productAuthPolicy';
import { clearProductSession, useProductSignOut, VERIFIED_DEVICE_KEY } from './ProductSignOut';

type Session =
  | {
      status: 'verified';
      userId: string;
      expiresAt: number;
      accountLabel: string;
      email: string | null;
    }
  | { status: 'signed-out' | 'revoked' };
const sessionQuery = makeFunctionReference<'query', Record<string, never>, Session>(
  'colloAuthSession:current',
);
type Startup = {
  phase: StartupPhase;
  canRead: boolean;
  offlineAvailable: boolean;
  continueOffline: () => void;
  retry: () => void;
  accountLabel?: string;
  accountEmail?: string | null;
};
const StartupContext = createContext<Startup | null>(null);
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
function tokenExpiry(token: string): number {
  try {
    return (
      Number(JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).exp) *
        1000 || 0
    );
  } catch {
    return 0;
  }
}
export function ProductStartupProvider({ children }: { children: ReactNode }) {
  const client = useConvex(),
    auth = useConvexAuth(),
    token = useAuthToken();
  const blocked = useSyncExternalStore(subscribeAuthPolicy, sessionBlocked, () => true);
  const connected = useSyncExternalStore(
    (cb) => client.subscribeToConnectionState(cb),
    () => client.connectionState().isWebSocketConnected,
    () => false,
  );
  const session = useQueryNoThrow(sessionQuery, auth.isAuthenticated ? {} : 'skip');
  const [slow, setSlow] = useState(false),
    [offlineAvailable, setOfflineAvailable] = useState(false),
    [offlineAccepted, setOfflineAccepted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const verifiedUntil = Math.min(
    token ? tokenExpiry(token) : 0,
    session.data?.status === 'verified' ? session.data.expiresAt : Infinity,
  );
  useEffect(() => {
    setClock(Date.now());
    if (!verifiedUntil) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.max(0, Math.min(2_147_483_647, verifiedUntil - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [verifiedUntil]);
  const locallyValid = verifiedUntil > clock;
  const rejected = connected && !auth.isLoading && !auth.isAuthenticated && !!token;
  useEffect(() => {
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [token, attempt]);
  useEffect(() => {
    let alive = true;
    const generation = authGeneration();
    setOfflineAvailable(false);
    setOfflineAccepted(false);
    if (token)
      void digest(token).then((hash) => {
        if (!alive || generation !== authGeneration()) return;
        try {
          const previous = JSON.parse(localStorage.getItem(VERIFIED_DEVICE_KEY) || 'null');
          setOfflineAvailable(
            previous?.version === 1 &&
              previous.tokenHash === hash &&
              previous.generation === generation &&
              previous.expiresAt > Date.now() &&
              tokenExpiry(token) > Date.now(),
          );
        } catch {
          /* Damaged preference is not an offline identity. */
        }
      });
    return () => {
      alive = false;
    };
  }, [token]);
  useEffect(() => {
    let alive = true;
    const generation = authGeneration();
    if (session.data?.status === 'verified' && token) {
      const verified = session.data;
      void digest(token).then((hash) => {
        if (!alive || generation !== authGeneration()) return;
        try {
          localStorage.setItem(
            VERIFIED_DEVICE_KEY,
            JSON.stringify({
              version: 1,
              tokenHash: hash,
              userId: verified.userId,
              expiresAt: Math.min(verified.expiresAt, tokenExpiry(token)),
              generation,
            }),
          );
          setOfflineAvailable(true);
        } catch {
          /* Online use remains available without offline storage. */
        }
      });
    }
    if (session.data?.status === 'revoked' || rejected) void clearProductSession().catch(() => {});
    return () => {
      alive = false;
    };
  }, [session.data, token, rejected]);
  let phase: StartupPhase = 'initializing';
  if (
    blocked ||
    rejected ||
    session.data?.status === 'revoked' ||
    session.data?.status === 'signed-out'
  )
    phase = 'signed-out';
  else if (session.data?.status === 'verified' && auth.isAuthenticated && token && locallyValid)
    phase = connected ? 'authenticated' : 'offline';
  else if (!token && !auth.isLoading) phase = 'signed-out';
  else if (!connected && slow) phase = 'offline';
  else if (session.error || slow) phase = 'recoverable-error';
  else if (token || auth.isLoading) phase = 'restoring';
  const canRead =
    phase === 'authenticated' ||
    (phase === 'offline' &&
      !!token &&
      locallyValid &&
      (session.data?.status === 'verified' || (offlineAvailable && offlineAccepted)));
  const retry = () => {
    setAttempt((v) => v + 1);
    session.retry();
  };
  return (
    <StartupContext.Provider
      value={{
        phase,
        canRead,
        offlineAvailable: offlineAvailable && locallyValid,
        continueOffline: () => setOfflineAccepted(true),
        retry,
        ...(session.data?.status === 'verified'
          ? { accountLabel: session.data.accountLabel, accountEmail: session.data.email }
          : {}),
      }}
    >
      {children}
    </StartupContext.Provider>
  );
}
export function useProductStartup() {
  const state = useContext(StartupContext);
  if (!state) throw new Error('ColloSys startup provider is missing');
  return state;
}
export function StartupRecovery() {
  const startup = useProductStartup(),
    signOut = useProductSignOut();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (startup.phase !== 'offline' && startup.phase !== 'recoverable-error')
    return (
      <AppLoader
        label={startup.phase === 'restoring' ? 'Restoring your sign-in' : 'Starting ColloSys'}
      />
    );
  return (
    <main className="collo-startup-recovery">
      <div>
        <img src="/collo-brand/mark-64.png" width="40" height="40" alt="" />
        <h1>
          {startup.phase === 'offline'
            ? 'Your service is out of reach'
            : 'Sign-in recovery needs another try'}
        </h1>
        <p>
          Your directories and checkpoints remain on this device. Reconnect to verify your account
          and synchronize.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="collo-recovery-actions">
          <button onClick={startup.retry}>Try again</button>
          {startup.offlineAvailable && (
            <button onClick={startup.continueOffline}>Read saved work offline</button>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not clear sign-in.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out on this device
          </button>
        </div>
        {startup.offlineAvailable && (
          <small>
            Offline access uses the last verified identity on this device. Membership and shared
            changes require the service.
          </small>
        )}
      </div>
    </main>
  );
}
export function ProductAuthGuard({
  children,
  guestOk,
  blankSignedOut,
}: {
  children: ReactNode;
  guestOk?: boolean;
  blankSignedOut?: boolean;
}) {
  const startup = useProductStartup(),
    router = useRouter();
  useEffect(() => {
    if (!guestOk && !blankSignedOut && startup.phase === 'signed-out')
      router.replace(
        `/login?return_to=${encodeURIComponent(applicationDestination(location.pathname + location.search + location.hash))}`,
      );
  }, [startup.phase, guestOk, blankSignedOut, router]);
  if (guestOk || startup.canRead) return <>{children}</>;
  return blankSignedOut ? null : <StartupRecovery />;
}
export function ProductEntry() {
  const startup = useProductStartup(),
    router = useRouter();
  useEffect(() => {
    if (startup.canRead) router.replace('/projects');
    else if (startup.phase === 'signed-out')
      router.replace(`/login?return_to=${encodeURIComponent(applicationDestination('/'))}`);
  }, [startup.canRead, startup.phase, router]);
  return <StartupRecovery />;
}
