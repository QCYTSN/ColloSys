import { useEffect, useRef, useState } from 'react';
import {
  acquireAuthAttempt,
  isCurrentAuthAttempt,
  transitionAuthAttempt,
  claimAuthNavigation,
  type AuthAttempt,
} from './authTransaction';
import { ProviderHelp, useProviderCapabilities } from './ProductProviderStatus';
import type { useAuthTransaction } from './useAuthTransaction';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvex, useMutation } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import {
  GithubLogo,
  GoogleLogo,
  ArrowSquareOut,
  X,
  ArrowClockwise,
  Check,
} from '@phosphor-icons/react';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { useProductStartup, StartupRecovery } from './ProductStartup';
import {
  applicationDestination,
  authGeneration,
  OAUTH_PENDING_KEY,
  setDesktopAttempt,
  type IdentityProvider,
} from './productAuthPolicy';
import { AppLoader } from './ProductLoader';
import { Logo } from './ProductLogo';
import { Button } from '../components/ui/button';
import type {} from './ProductDesktopBridge';

const providersQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  { github: boolean; google: boolean }
>('auth:signInProviders');
const createAttempt = makeFunctionReference<
  'mutation',
  { attemptId: string; claimHash: string; provider: IdentityProvider },
  { expiresAt: number }
>('colloAuthRelay:create');
const cancelAttempt = makeFunctionReference<
  'mutation',
  { attemptId: string; claimSecret: string },
  null
>('colloAuthRelay:cancel');
const authorizeAttempt = makeFunctionReference<'mutation', { attemptId: string }, null>(
  'colloAuthRelay:authorize',
);
type AttemptStatus = {
  status: 'missing' | 'pending' | 'authorized' | 'cancelled' | 'consumed' | 'expired';
  provider?: IdentityProvider;
  expiresAt?: number;
};
const statusQuery = makeFunctionReference<'query', { attemptId: string }, AttemptStatus>(
  'colloAuthRelay:status',
);
export type OAuthPhase =
  'idle' | 'starting' | 'waiting' | 'success' | 'cancelled' | 'timeout' | 'unavailable' | 'error';
type Pending = {
  version: 1;
  provider: IdentityProvider;
  generation: string;
  expiresAt: number;
  destination: string;
  attemptId?: string;
};
function pendingSignIn(): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(OAUTH_PENDING_KEY) || 'null');
    return value?.version === 1 ? value : null;
  } catch {
    return null;
  }
}
function beginBrowserSignIn(provider: IdentityProvider, destination: string, attemptId?: string) {
  const pending: Pending = {
    version: 1,
    provider,
    destination: applicationDestination(destination),
    generation: authGeneration(),
    expiresAt: Date.now() + 5 * 60_000,
    ...(attemptId ? { attemptId } : {}),
  };
  sessionStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify(pending));
  return attemptId ? `/auth/desktop?attempt=${encodeURIComponent(attemptId)}` : '/auth/complete';
}
const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
const hashSecret = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');

export function ProductOAuthButtons({
  destination,
  transaction,
}: {
  destination: string;
  transaction: ReturnType<typeof useAuthTransaction>;
}) {
  const providers = useProviderCapabilities(),
    client = useConvex(),
    { signIn } = useAuthActions();
  const [message, setMessage] = useState(''),
    [lastMethod, setLastMethod] = useState<IdentityProvider | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const active = useRef<{
    auth: AuthAttempt;
    attemptId: string;
    claimSecret: string;
    expiresAt: number;
    claiming: boolean;
  } | null>(null);
  const alive = useRef(true);
  const status = useQueryNoThrow(statusQuery, attemptId ? { attemptId } : 'skip', {
    breakAfterMs: 8000,
  });
  const attempt = transaction.attempt;
  const ours = attempt && attempt.method !== 'password';
  const phase = ours ? attempt.phase : 'idle';
  const dispose = (old: NonNullable<typeof active.current>) =>
    client
      .mutation(cancelAttempt, { attemptId: old.attemptId, claimSecret: old.claimSecret })
      .catch(() => {});
  const cancel = (expired = false) => {
    const current = active.current;
    if (current?.claiming) return; // An atomic claim cannot be undone; logout remains a separate operation.
    if (ours) transitionAuthAttempt(attempt, expired ? 'expired' : 'cancelled');
    active.current = null;
    setDesktopAttempt(null);
    setAttemptId(null);
    if (current) void dispose(current);
    setMessage(
      expired
        ? 'This request expired. Start again when ready.'
        : 'Sign-in cancelled. Your form is still here.',
    );
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const old = active.current;
      if (old && !old.claiming) void dispose(old);
    };
  }, [client]);
  useEffect(() => {
    const current = active.current;
    if (!current) return;
    const timer = setTimeout(() => cancel(true), Math.max(0, current.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [attemptId]);
  useEffect(() => {
    const current = active.current;
    if (!current || !isCurrentAuthAttempt(current.auth)) return;
    if (status.data?.status === 'authorized' && !current.claiming) {
      current.claiming = true;
      transitionAuthAttempt(current.auth, 'establishing-session');
      setMessage('Verifying your ColloSys session…');
      void signIn('collosys-desktop-v1', {
        attemptId: current.attemptId,
        claimSecret: current.claimSecret,
      }).catch(() => {
        if (!alive.current || !isCurrentAuthAttempt(current.auth)) return;
        transitionAuthAttempt(current.auth, 'failed');
        setMessage('Sign-in could not finish. Start a new request.');
        active.current = null;
        setAttemptId(null);
        setDesktopAttempt(null);
      });
    } else if (status.data?.status === 'cancelled' || status.data?.status === 'expired')
      cancel(status.data.status === 'expired');
  }, [status.data, signIn]);
  const launch = async (provider: IdentityProvider) => {
    if (providers.state(provider) !== 'ready') return;
    const auth = acquireAuthAttempt(provider, transaction.owner);
    if (!auth) return;
    setLastMethod(provider);
    setMessage('Opening secure sign-in…');
    try {
      const desktop = window.__COLLOSYS_DESKTOP__;
      if (desktop) {
        const claimSecret = randomSecret();
        const created = await client.mutation(createAttempt, {
          attemptId: auth.attemptId,
          claimHash: await hashSecret(claimSecret),
          provider,
        });
        const current = {
          auth,
          attemptId: auth.attemptId,
          claimSecret,
          expiresAt: created.expiresAt,
          claiming: false,
        };
        if (!alive.current || !isCurrentAuthAttempt(auth)) {
          void dispose(current);
          return;
        }
        active.current = current;
        setDesktopAttempt(auth.attemptId);
        setAttemptId(auth.attemptId);
        await desktop.beginSignIn({ version: 1, attemptId: auth.attemptId, provider });
        if (!alive.current || !isCurrentAuthAttempt(auth)) return;
        transitionAuthAttempt(auth, 'awaiting-provider');
        setMessage('Finish in your browser, then approve this window.');
      } else {
        const redirectTo = beginBrowserSignIn(provider, destination);
        await signIn(provider, { redirectTo });
      }
    } catch {
      if (!alive.current || !isCurrentAuthAttempt(auth)) return;
      const old = active.current;
      active.current = null;
      if (old) void dispose(old);
      setAttemptId(null);
      setDesktopAttempt(null);
      transitionAuthAttempt(auth, 'failed');
      setMessage('Sign-in could not start. Check your connection.');
    }
  };
  const capabilities = (['github', 'google'] as const).map((p) => providers.state(p));
  const checking = capabilities.includes('checking'),
    unavailable = capabilities.includes('temporarily-unavailable');
  const disabledNames = (['github', 'google'] as const)
    .filter((p) => providers.state(p) === 'unconfigured')
    .map((p) => (p === 'github' ? 'GitHub' : 'Google'));
  const text =
    ours && phase !== 'idle'
      ? message || 'Confirming your sign-in…'
      : checking
        ? 'Checking available sign-in services…'
        : unavailable
          ? 'Sign-in services could not be checked.'
          : disabledNames.length
            ? disabledNames.join(' and ') + ' sign-in is not enabled on this service.'
            : 'Sign in securely through your system browser.';
  return (
    <div className="collo-oauth" data-phase={phase}>
      <div className="collo-oauth-providers">
        {(['github', 'google'] as const).map((provider) => {
          const capability = providers.state(provider);
          return (
            <Button
              variant="outline"
              key={provider}
              type="button"
              disabled={transaction.busy || capability !== 'ready'}
              data-capability={capability}
              aria-describedby="oauth-status"
              onClick={() => void launch(provider)}
            >
              {provider === 'github' ? (
                <GithubLogo size={20} weight="fill" />
              ) : (
                <GoogleLogo size={20} weight="bold" />
              )}
              <span className="collo-provider-label">
                {provider === 'github' ? 'GitHub' : 'Google'}
                {capability === 'unconfigured' && <small>Not enabled</small>}
                {capability === 'checking' && <small>Checking…</small>}
                {capability === 'temporarily-unavailable' && <small>Unavailable</small>}
              </span>
            </Button>
          );
        })}
      </div>
      <div className="collo-oauth-status">
        <p id="oauth-status" role="status" aria-live="polite">
          {text}
        </p>
        {ours && ['initiating', 'awaiting-provider'].includes(phase) ? (
          <button type="button" onClick={() => cancel()}>
            Cancel
          </button>
        ) : ours &&
          ['failed', 'expired', 'cancelled'].includes(phase) &&
          lastMethod &&
          providers.state(lastMethod) === 'ready' ? (
          <button type="button" onClick={() => void launch(lastMethod)}>
            Retry
          </button>
        ) : (
          <button type="button" disabled={transaction.busy || checking} onClick={providers.retry}>
            {unavailable ? 'Retry check' : 'Refresh check'}
          </button>
        )}
      </div>
      <div className="collo-provider-help-anchor">
        <ProviderHelp config={providers.data} />
      </div>
    </div>
  );
}

export function ProductOAuthComplete() {
  const startup = useProductStartup(),
    pending = pendingSignIn();
  useEffect(() => {
    if (
      startup.phase !== 'authenticated' ||
      !pending ||
      pending.generation !== authGeneration() ||
      pending.expiresAt <= Date.now()
    )
      return;
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
    const destination = applicationDestination(pending.destination);
    if (claimAuthNavigation(destination)) window.location.replace(destination);
  }, [startup.phase]);
  if (startup.phase === 'restoring' || startup.phase === 'initializing')
    return <AppLoader label="Confirming your sign-in" />;
  if (startup.phase === 'offline' || startup.phase === 'recoverable-error')
    return <StartupRecovery />;
  if (
    startup.phase === 'authenticated' &&
    pending &&
    pending.generation === authGeneration() &&
    pending.expiresAt > Date.now()
  )
    return <AppLoader label="Opening your workspace" />;
  return (
    <main className="collo-startup-recovery">
      <div>
        <Logo />
        <h1>Sign-in did not finish</h1>
        <p>
          The request was cancelled, expired or could not be verified. Start a new sign-in request.
          If this email already belongs to an account, use its original login method, then link the
          provider in Settings → Login methods.
        </p>
        <a
          href={`/login?return_to=${encodeURIComponent(applicationDestination(pending?.destination))}`}
        >
          Return to sign in
        </a>
      </div>
    </main>
  );
}

export function ProductDesktopAuthorize() {
  const params = new URLSearchParams(location.search),
    attemptId = params.get('attempt') || '';
  const valid = /^[a-f0-9-]{36}$/.test(attemptId),
    startup = useProductStartup(),
    { signIn } = useAuthActions(),
    authorize = useMutation(authorizeAttempt);
  const status = useQueryNoThrow(statusQuery, valid ? { attemptId } : 'skip'),
    providers = useQueryNoThrow(providersQuery, {});
  const actionLock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [approved, setApproved] = useState(false);
  const pending = pendingSignIn();
  const provider = status.data?.provider;
  const fresh =
    pending?.attemptId === attemptId &&
    pending?.provider === provider &&
    pending.generation === authGeneration() &&
    pending.expiresAt > Date.now();
  return (
    <main className="collo-startup-recovery">
      <div>
        <Logo />
        <h1>{approved ? 'Desktop sign-in approved' : 'Connect your ColloSys window'}</h1>
        {approved ? (
          <p>
            <Check size={18} /> Return to the desktop window to finish. This page does not contain
            your desktop session token.
          </p>
        ) : !valid ||
          ['missing', 'expired', 'cancelled', 'consumed'].includes(status.data?.status || '') ? (
          <p>This request is no longer available. Start again from ColloSys.</p>
        ) : (
          <>
            <p>Only continue if you just started sign-in from ColloSys on this computer.</p>
            {startup.phase === 'authenticated' && (
              <p>
                Account: <strong>{startup.accountLabel}</strong>
                {startup.accountEmail && startup.accountLabel !== startup.accountEmail
                  ? ` (${startup.accountEmail})`
                  : ''}
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            {provider && startup.phase === 'authenticated' && fresh ? (
              <button
                disabled={busy}
                onClick={async () => {
                  if (actionLock.current) return;
                  actionLock.current = true;
                  setBusy(true);
                  try {
                    await authorize({ attemptId });
                    setApproved(true);
                    sessionStorage.removeItem(OAUTH_PENDING_KEY);
                  } catch {
                    setError(
                      'Approval failed. The request may have expired or the account changed.',
                    );
                  } finally {
                    actionLock.current = false;
                    setBusy(false);
                  }
                }}
              >
                Approve this desktop window
              </button>
            ) : provider ? (
              <button
                disabled={busy || !providers.data?.[provider]}
                onClick={async () => {
                  if (actionLock.current) return;
                  actionLock.current = true;
                  setBusy(true);
                  setError('');
                  try {
                    await signIn(provider, {
                      redirectTo: beginBrowserSignIn(provider, '/projects', attemptId),
                    });
                  } catch {
                    setError('Sign-in could not start. Try again from ColloSys.');
                    actionLock.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? 'Starting sign-in…'
                  : `Sign in with ${provider === 'github' ? 'GitHub' : 'Google'}`}
              </button>
            ) : (
              <p role="status">Checking the request…</p>
            )}
            {provider && providers.data && !providers.data[provider] && (
              <p role="alert">
                This provider is not configured on the service. Use email in the desktop window.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
