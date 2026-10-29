import { useEffect, useRef, useState } from 'react';
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
  onPhase,
}: {
  destination: string;
  onPhase?: (phase: OAuthPhase) => void;
}) {
  const providers = useQueryNoThrow(providersQuery, {}),
    client = useConvex(),
    { signIn } = useAuthActions(),
    startup = useProductStartup();
  // Dev-only visual inspection of real component states; never enabled in a
  // production build and never issues an identity or claim.
  const preview = import.meta.env.DEV
    ? new URLSearchParams(location.search).get('_colloAuthPreview')
    : null;
  const previewPhase = ['waiting', 'error', 'timeout'].includes(preview || '')
    ? (preview as OAuthPhase)
    : null;
  const [phase, setPhase] = useState<OAuthPhase>(previewPhase ?? 'idle'),
    [selected, setSelected] = useState<IdentityProvider | null>(previewPhase ? 'github' : null),
    [message, setMessage] = useState(
      previewPhase === 'waiting'
        ? 'Finish signing in in your browser, then approve this desktop window.'
        : previewPhase
          ? 'The sign-in request could not finish. Please try again.'
          : '',
    );
  const attempt = useRef<{
    attemptId: string;
    claimSecret: string;
    expiresAt: number;
    claiming: boolean;
  } | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null),
    mounted = useRef(true),
    launching = useRef(false);
  const status = useQueryNoThrow(statusQuery, attemptId ? { attemptId } : 'skip');
  useEffect(() => {
    onPhase?.(phase);
  }, [phase, onPhase]);
  const cancel = (next: OAuthPhase = 'cancelled') => {
    const old = attempt.current;
    attempt.current = null;
    setDesktopAttempt(null);
    setAttemptId(null);
    launching.current = false;
    if (old)
      void client
        .mutation(cancelAttempt, { attemptId: old.attemptId, claimSecret: old.claimSecret })
        .catch(() => {});
    setPhase(next);
    setMessage(
      next === 'timeout'
        ? 'The sign-in request expired. Start a new request when you are ready.'
        : 'Sign-in cancelled. Your form is still here.',
    );
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const old = attempt.current;
      setDesktopAttempt(null);
      if (old && !old.claiming)
        void client
          .mutation(cancelAttempt, { attemptId: old.attemptId, claimSecret: old.claimSecret })
          .catch(() => {});
    };
  }, [client]);
  useEffect(() => {
    const current = attempt.current;
    if (!current) return;
    const timer = setTimeout(() => cancel('timeout'), Math.max(0, current.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [attemptId]);
  useEffect(() => {
    const current = attempt.current;
    if (status.data?.status === 'authorized' && current && !current.claiming) {
      current.claiming = true;
      void signIn('collosys-desktop-v1', {
        attemptId: current.attemptId,
        claimSecret: current.claimSecret,
      }).catch(() => {
        if (!mounted.current || attempt.current !== current) return;
        setPhase('error');
        setMessage('ColloSys could not finish this sign-in. Start a new request.');
        setDesktopAttempt(null);
        attempt.current = null;
        setAttemptId(null);
      });
    } else if (status.data?.status === 'cancelled' || status.data?.status === 'expired')
      cancel(status.data.status === 'expired' ? 'timeout' : 'cancelled');
  }, [status.data, signIn]);
  useEffect(() => {
    if (startup.phase === 'authenticated' && attempt.current?.claiming) {
      setPhase('success');
      setMessage('Signed in to ColloSys. Opening your workspace…');
    }
  }, [startup.phase]);
  const launch = async (provider: IdentityProvider) => {
    if (launching.current || phase === 'waiting' || phase === 'starting') return;
    launching.current = true;
    setSelected(provider);
    setMessage('');
    if (!providers.data?.[provider]) {
      setPhase(providers.error ? 'error' : 'unavailable');
      setMessage(
        providers.error
          ? 'The service could not check sign-in configuration. Retry or use email.'
          : `${provider === 'github' ? 'GitHub' : 'Google'} sign-in is not configured for this ColloSys service. The service owner needs to add the OAuth client ID and secret. Email sign-in remains available.`,
      );
      launching.current = false;
      return;
    }
    setPhase('starting');
    try {
      const desktop = window.__COLLOSYS_DESKTOP__;
      if (desktop) {
        const id = crypto.randomUUID(),
          claimSecret = randomSecret();
        const created = await client.mutation(createAttempt, {
          attemptId: id,
          claimHash: await hashSecret(claimSecret),
          provider,
        });
        if (!mounted.current) {
          void client.mutation(cancelAttempt, { attemptId: id, claimSecret });
          return;
        }
        attempt.current = {
          attemptId: id,
          claimSecret,
          expiresAt: created.expiresAt,
          claiming: false,
        };
        setDesktopAttempt(id);
        setAttemptId(id);
        await desktop.beginSignIn({ version: 1, attemptId: id, provider });
        if (attempt.current?.attemptId !== id) return;
        setPhase('waiting');
        setMessage('Finish signing in in your browser, then approve this desktop window.');
      } else {
        const redirectTo = beginBrowserSignIn(provider, destination);
        await signIn(provider, { redirectTo });
      }
    } catch {
      if (!mounted.current) return;
      const old = attempt.current;
      attempt.current = null;
      setDesktopAttempt(null);
      setAttemptId(null);
      if (old)
        void client
          .mutation(cancelAttempt, { attemptId: old.attemptId, claimSecret: old.claimSecret })
          .catch(() => {});
      setPhase('error');
      setMessage('Sign-in could not start. Check your connection and try again.');
    } finally {
      launching.current = false;
    }
  };
  const busy = phase === 'starting' || phase === 'waiting' || phase === 'success';
  return (
    <div className="collo-oauth" data-phase={phase}>
      {previewPhase && <p role="note">Development state preview · no authentication performed</p>}
      <div className="collo-oauth-providers">
        {(['github', 'google'] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={busy || (!providers.data && !providers.error)}
            onClick={() => void launch(provider)}
            aria-describedby={selected === provider && message ? 'oauth-status' : undefined}
          >
            {provider === 'github' ? (
              <GithubLogo size={20} weight="fill" />
            ) : (
              <GoogleLogo size={20} weight="bold" />
            )}
            <span>
              {selected === provider && phase === 'starting'
                ? 'Opening…'
                : provider === 'github'
                  ? 'GitHub'
                  : 'Google'}
            </span>
            {selected === provider && phase === 'waiting' && <ArrowSquareOut size={15} />}
          </button>
        ))}
      </div>
      {phase !== 'idle' && (
        <div
          id="oauth-status"
          role={['error', 'unavailable', 'timeout'].includes(phase) ? 'alert' : 'status'}
          className="collo-oauth-status"
        >
          <p>{message || 'Starting secure sign-in…'}</p>
          {phase === 'waiting' && (
            <button type="button" onClick={() => cancel()}>
              <X size={14} />
              Cancel sign-in
            </button>
          )}
          {['error', 'unavailable', 'timeout', 'cancelled'].includes(phase) && (
            <button
              type="button"
              onClick={() => {
                providers.retry();
                setPhase('idle');
                setMessage('');
              }}
            >
              <ArrowClockwise size={14} />
              Check again
            </button>
          )}
        </div>
      )}
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
    window.location.replace(applicationDestination(pending.destination));
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
                  setBusy(true);
                  setError('');
                  try {
                    await signIn(provider, {
                      redirectTo: beginBrowserSignIn(provider, '/projects', attemptId),
                    });
                  } catch {
                    setError('Sign-in could not start. Try again from ColloSys.');
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
