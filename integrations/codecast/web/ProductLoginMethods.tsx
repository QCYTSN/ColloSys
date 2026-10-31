import { useEffect, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { ConvexError } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { GithubLogo, GoogleLogo, EnvelopeSimple } from '@phosphor-icons/react';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { ProviderHelp, useProviderCapabilities } from './ProductProviderStatus';
import { authGeneration, type IdentityProvider } from './productAuthPolicy';
import { Logo } from './ProductLogo';

type Method = { accountId: string; provider: string; label: string; available: boolean };
type Request = {
  attemptId: string;
  challenge: string;
  generation: string;
  expiresAt: number;
  provider: IdentityProvider;
  purpose: 'link' | 'reauthenticate';
};
type LinkStatus = {
  status: string;
  provider?: IdentityProvider;
  purpose?: string;
  expiresAt?: number;
  label?: string;
  subject?: string;
  error?: string;
};
const ref = (name: string) => makeFunctionReference<any, any, any>(`colloAccountLinks:${name}`);
const secret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
const accountError = (cause: unknown, fallback: string) =>
  cause instanceof ConvexError && typeof cause.data === 'string' ? cause.data : fallback;
const requestArgs = (r: Request) => ({
  attemptId: r.attemptId,
  challenge: r.challenge,
  generation: r.generation,
});

export function ProductLoginMethods() {
  const client = useConvex(),
    providers = useProviderCapabilities();
  const methods = useQueryNoThrow(ref('methods'), {}, { breakAfterMs: 8000 });
  const data = methods.data as { reverifiedUntil: number; methods: Method[] } | undefined;
  const [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [pending, setPending] = useState<Request | null>(null),
    [remove, setRemove] = useState<Method | null>(null),
    [clock, setClock] = useState(Date.now);
  const lock = useRef(false),
    alive = useRef(true),
    current = useRef<Request | null>(null);
  const status = useQueryNoThrow(ref('mine'), pending ? requestArgs(pending) : 'skip', {
    breakAfterMs: 8000,
  });
  const state = status.data as LinkStatus | undefined;
  const live = (generation: string) => alive.current && authGeneration() === generation;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const old = current.current;
      if (old) void client.mutation(ref('cancel'), requestArgs(old)).catch(() => {});
    };
  }, [client]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.max(0, pending.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pending]);
  const cancel = async () => {
    const old = current.current;
    current.current = null;
    setPending(null);
    if (old) await client.mutation(ref('cancel'), requestArgs(old)).catch(() => {});
    setMessage('Request cancelled. Your login methods have not changed.');
  };
  const start = async (provider: IdentityProvider, purpose: Request['purpose']) => {
    if (lock.current || current.current || providers.state(provider) !== 'ready') return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const generation = authGeneration(),
      challenge = secret(),
      attemptId = crypto.randomUUID();
    try {
      const created = await client.mutation(ref('create'), {
        attemptId,
        provider,
        purpose,
        generation,
        challengeHash: await digest(challenge),
      });
      const next: Request = {
        attemptId,
        provider,
        purpose,
        generation,
        challenge,
        expiresAt: created.expiresAt,
      };
      if (!live(generation)) {
        void client.mutation(ref('cancel'), requestArgs(next)).catch(() => {});
        return;
      }
      current.current = next;
      setPending(next);
      setClock(Date.now());
      if (window.__COLLOSYS_DESKTOP__)
        await window.__COLLOSYS_DESKTOP__.beginSignIn({
          version: 1,
          attemptId,
          provider,
          purpose: 'link',
        });
      else {
        const opened = window.open(
          `/auth/link?attempt=${encodeURIComponent(attemptId)}`,
          '_blank',
          'noopener,noreferrer',
        );
        /* An explicit continue link below also works if the browser blocks a popup. */ void opened;
      }
    } catch (cause) {
      if (live(generation)) {
        setError(
          accountError(
            cause,
            'Could not begin this account request. Check your connection and retry.',
          ),
        );
        const old = current.current;
        current.current = null;
        setPending(null);
        if (old) void client.mutation(ref('cancel'), requestArgs(old)).catch(() => {});
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const confirm = async () => {
    const old = current.current;
    if (!old || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await client.mutation(ref('confirm'), requestArgs(old));
      if (!live(old.generation) || current.current !== old) return;
      current.current = null;
      setPending(null);
      setMessage(
        old.purpose === 'link'
          ? 'Login method linked to this account.'
          : 'Identity verified. You can now manage your login methods.',
      );
      methods.retry();
    } catch (cause) {
      if (live(old.generation))
        setError(
          accountError(cause, 'Could not confirm this request. Check your connection and retry.'),
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const disabled = busy || !!pending;
  return (
    <section className="collo-login-methods" aria-label="Login methods">
      <h2>Login methods</h2>
      <p>Link another way to sign in to this same account. Your projects and data stay together.</p>
      {methods.error ? (
        <p role="alert">
          Login methods could not be loaded.{' '}
          <button type="button" onClick={methods.retry}>
            Retry
          </button>
        </p>
      ) : !data ? (
        <p role="status">Checking your login methods…</p>
      ) : (
        <>
          {(['password', 'github', 'google'] as const).map((provider) => {
            const method = data.methods.find((m) => m.provider === provider),
              Icon =
                provider === 'github'
                  ? GithubLogo
                  : provider === 'google'
                    ? GoogleLogo
                    : EnvelopeSimple;
            return (
              <div className="collo-login-method" key={provider}>
                <Icon size={20} />
                <div>
                  <h3>
                    {provider === 'password'
                      ? 'Email and password'
                      : provider === 'github'
                        ? 'GitHub'
                        : 'Google'}
                  </h3>
                  <p>
                    {method ? method.label : 'Not linked'}
                    {provider !== 'password' && providers.state(provider) === 'unconfigured'
                      ? ' · Not enabled on this service'
                      : ''}
                  </p>
                </div>
                {provider === 'password' ? (
                  <span>{method?.available ? 'Set up' : 'Not set up'}</span>
                ) : (
                  <div className="collo-login-method-actions">
                    <Button
                      variant="outline"
                      disabled={disabled || providers.state(provider) !== 'ready'}
                      onClick={() => void start(provider, method ? 'reauthenticate' : 'link')}
                    >
                      {method ? 'Reverify' : 'Link'}
                    </Button>
                    {method && (
                      <Button variant="ghost" disabled={disabled} onClick={() => setRemove(method)}>
                        Unlink
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {data.methods.some((m) => m.provider === 'password' && m.available) && (
            <form
              className="collo-method-reverify"
              onSubmit={async (event) => {
                event.preventDefault();
                if (lock.current || current.current) return;
                lock.current = true;
                setBusy(true);
                setError('');
                const generation = authGeneration();
                const submitted = password;
                setPassword('');
                try {
                  await client.action(ref('reverifyPassword'), { password: submitted, generation });
                  if (live(generation)) {
                    setMessage('Identity verified for the next five minutes.');
                    methods.retry();
                  }
                } catch {
                  if (live(generation))
                    setError('Verification failed. Check your current password and try again.');
                } finally {
                  lock.current = false;
                  if (alive.current) setBusy(false);
                }
              }}
            >
              <label htmlFor="collo-current-password">
                Verify your current password before changing login methods
              </label>
              <div>
                <input
                  id="collo-current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={disabled}
                />
                <Button type="submit" disabled={disabled}>
                  Verify
                </Button>
              </div>
            </form>
          )}
          <div className="collo-method-service">
            <ProviderHelp config={providers.data} />
            <button type="button" disabled={disabled} onClick={providers.retry}>
              Refresh service check
            </button>
          </div>
        </>
      )}
      {pending && (
        <div className="collo-method-pending" role="status">
          {state?.status === 'verified' ? (
            <>
              <strong>
                Confirm this {pending.provider === 'github' ? 'GitHub' : 'Google'} identity
              </strong>
              <p>
                {state.label}
                <br />
                <small>Provider ID: {state.subject}</small>
              </p>
              <p>
                {pending.purpose === 'link'
                  ? 'This adds a login method to the account open in this window. No other account data will be moved.'
                  : 'Confirm that this is your existing linked identity.'}
              </p>
              <Button disabled={busy} onClick={() => void confirm()}>
                {pending.purpose === 'link' ? 'Confirm link' : 'Confirm verification'}
              </Button>
            </>
          ) : (
            <p>
              {clock >= pending.expiresAt
                ? 'This request expired. Cancel it and start again.'
                : state?.error || status.error
                  ? 'The request could not finish. Cancel and retry.'
                  : 'Continue in your browser, then return here to confirm the verified identity.'}
            </p>
          )}
          {state?.error && <p role="alert">{state.error}</p>}
          {!window.__COLLOSYS_DESKTOP__ &&
            !['verified', 'failed', 'completed'].includes(state?.status || '') && (
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={`/auth/link?attempt=${encodeURIComponent(pending.attemptId)}`}
              >
                Open authorization page
              </a>
            )}
          <Button variant="ghost" disabled={busy} onClick={() => void cancel()}>
            Cancel request
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="collo-method-error">
          {error}
        </p>
      )}
      <Dialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open && !busy) setRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink {remove?.provider === 'github' ? 'GitHub' : 'Google'}?</DialogTitle>
            <DialogDescription>
              You must have verified an existing method recently and keep another available way to
              sign in.
            </DialogDescription>
          </DialogHeader>
          <p>{remove?.label}</p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              if (!remove || lock.current) return;
              lock.current = true;
              setBusy(true);
              setError('');
              const generation = authGeneration();
              try {
                await client.mutation(ref('unlink'), { accountId: remove.accountId, generation });
                if (live(generation)) {
                  setRemove(null);
                  setMessage('Login method unlinked. Other account data is unchanged.');
                  methods.retry();
                }
              } catch (cause) {
                if (live(generation)) {
                  setRemove(null);
                  setError(
                    accountError(
                      cause,
                      'Could not unlink this method. Verify your identity and retry.',
                    ),
                  );
                }
              } finally {
                lock.current = false;
                if (alive.current) setBusy(false);
              }
            }}
          >
            Unlink login method
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setRemove(null)}>
            Keep linked
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ProductLinkAuthorize() {
  const attemptId = new URLSearchParams(location.search).get('attempt') || '',
    valid = /^[a-f0-9-]{36}$/.test(attemptId);
  const client = useConvex(),
    status = useQueryNoThrow(ref('browserStatus'), valid ? { attemptId } : 'skip', {
      breakAfterMs: 8000,
    });
  const state = status.data as LinkStatus | undefined;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    lock = useRef(false);
  const failed =
    !valid || ['missing', 'cancelled', 'expired', 'failed'].includes(state?.status || '');
  return (
    <main className="collo-startup-recovery">
      <div>
        <Logo />
        <h1>
          {state?.status === 'verified' || state?.status === 'completed'
            ? 'Return to ColloSys'
            : 'Verify a login method'}
        </h1>
        <p>
          {failed
            ? 'This account request has ended. Start again in account settings.'
            : state?.status === 'awaiting-provider'
              ? 'Authorization has not completed. If you cancelled or returned without approval, cancel this request in ColloSys and start again.'
              : state?.status === 'verified' || state?.status === 'completed'
                ? 'The provider identity was verified. Confirm it in the ColloSys window that started this request. This browser’s account has not been changed.'
                : 'Continue only if you started this request in ColloSys account settings. The target account is fixed by that window; the account signed in to this browser does not replace it.'}
        </p>
        {error && <p role="alert">{error}</p>}
        {state?.status === 'pending' && (
          <Button
            disabled={busy}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              try {
                const result = await client.mutation(ref('beginProvider'), { attemptId });
                window.location.assign(result.redirect);
              } catch {
                setError(
                  'Authorization could not start. Cancel this request in ColloSys and try again.',
                );
                setBusy(false);
                lock.current = false;
              }
            }}
          >
            Continue with {state.provider === 'github' ? 'GitHub' : 'Google'}
          </Button>
        )}
        {!state && !failed && <p role="status">Checking the account request…</p>}
        {status.error && <Button onClick={status.retry}>Retry check</Button>}
      </div>
    </main>
  );
}
