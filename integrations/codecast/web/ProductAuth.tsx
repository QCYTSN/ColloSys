import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeSlash, ArrowRight } from '@phosphor-icons/react';
import { Logo } from './ProductLogo';
import { AppLoader } from './ProductLoader';
import { useProductStartup, StartupRecovery } from './ProductStartup';
import { applicationDestination } from './productAuthPolicy';
import { ProductOAuthButtons } from './ProductOAuth';
import { useAuthTransaction } from './useAuthTransaction';
import { claimAuthNavigation } from './authTransaction';
import { useProductEmailAuth } from './useProductEmailAuth';
import { ProductAuthScene, type AuthSceneState } from './ProductAuthScene';
import { useResetRequest, useResetConfirm } from '../hooks/useEmailAuth';
import { makeFunctionReference } from 'convex/server';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { EmailVerificationForm } from '../components/EmailVerificationForm';
import { Button } from '../components/ui/button';
import { useProductSignOut } from './ProductSignOut';

function AuthSurface({
  children,
  state = 'idle',
}: {
  children: ReactNode;
  state?: AuthSceneState;
}) {
  const [focus, setFocus] = useState<AuthSceneState>('idle');
  const focusedState = (target: EventTarget | null): AuthSceneState => {
    if (!(target instanceof HTMLInputElement)) return 'idle';
    return /password/i.test(target.name || target.id) ? 'password-focused' : 'input-focused';
  };
  return (
    <main className="collo-auth-layout">
      <section className="collo-auth-visual">
        <header className="collo-auth-brand">
          <Logo />
        </header>
        <div className="collo-auth-art-stage">
          <div className="collo-auth-art-group">
            <ProductAuthScene state={state === 'idle' ? focus : state} />
            <div className="collo-auth-scene-caption">
              <h2>
                Separate paths.
                <br />
                Shared direction.
              </h2>
            </div>
          </div>
        </div>
      </section>
      <section
        className="collo-auth-work"
        onFocusCapture={(event) => setFocus(focusedState(event.target))}
        onBlurCapture={(event) => setFocus(focusedState(event.relatedTarget))}
      >
        <div className="collo-auth-content">{children}</div>
        <footer>
          <span>Your files stay in your own directory.</span>
        </footer>
      </section>
    </main>
  );
}

function AuthForm({ flow }: { flow: 'signIn' | 'signUp' }) {
  const startup = useProductStartup();
  const router = useRouter(),
    params = useSearchParams();
  const redirectTo = applicationDestination(params.get('return_to'));
  const transaction = useAuthTransaction();
  const auth = useProductEmailAuth(flow, transaction.owner);
  const recovering = params.get('recover') === '1';
  const signOut = useProductSignOut();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const signup = flow === 'signUp';
  const [visible, setVisible] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (auth.error) errorRef.current?.focus();
  }, [auth.error]);
  useEffect(() => {
    if (!recovering && startup.phase === 'authenticated' && claimAuthNavigation(redirectTo))
      router.replace(redirectTo);
  }, [startup.canRead, redirectTo, router, recovering]);
  if (recovering)
    return (
      <AuthSurface>
        <div className="collo-auth-step">
          <h1>Open your workspace again</h1>
          <p>
            Retry with your current account, or sign out before signing in again. Your local
            directories and checkpoints stay on this device.
          </p>
          {recoveryError && (
            <p role="alert" className="collo-auth-error">
              {recoveryError}
            </p>
          )}
          <div className="collo-auth-recovery-actions">
            <Button
              disabled={recoveryBusy}
              onClick={() =>
                window.location.assign(redirectTo.startsWith('/login') ? '/projects' : redirectTo)
              }
            >
              Retry workspace
            </Button>
            <Button
              variant="outline"
              disabled={recoveryBusy}
              onClick={async () => {
                setRecoveryBusy(true);
                setRecoveryError('');
                try {
                  await signOut();
                  window.location.replace('/login');
                } catch (error) {
                  setRecoveryError(
                    error instanceof Error
                      ? error.message
                      : 'Could not finish sign-out. Please try again.',
                  );
                  setRecoveryBusy(false);
                }
              }}
            >
              {recoveryBusy ? 'Signing out…' : 'Sign out and sign in again'}
            </Button>
          </div>
        </div>
      </AuthSurface>
    );
  // A verified ColloSys session is the only success fact. Navigation in the
  // existing effect/hook is immediate; the scene adds no celebration timer.
  if (startup.phase === 'authenticated')
    return (
      <AuthSurface state="success">
        <p role="status">Opening your workspace…</p>
      </AuthSurface>
    );
  const signingIn = transaction.busy;
  const authLoading = signingIn && transaction.attempt?.method === 'password';
  if (startup.phase !== 'signed-out' && !(signingIn && startup.phase === 'restoring'))
    return <StartupRecovery />;
  if (auth.pendingVerification)
    return (
      <AuthSurface>
        <EmailVerificationForm
          email={auth.email}
          onVerified={auth.verified}
          onBack={auth.startOver}
        />
      </AuthSurface>
    );
  return (
    <AuthSurface
      state={
        authLoading
          ? 'submitting'
          : transaction.attempt?.phase === 'awaiting-provider'
            ? 'oauth-waiting'
            : transaction.attempt?.phase === 'initiating'
              ? 'oauth-starting'
              : auth.error || ['failed', 'expired'].includes(transaction.attempt?.phase || '')
                ? 'recoverable-error'
                : 'idle'
      }
    >
      <div className="collo-auth-step" key={flow}>
        <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p>
          {params.get('reason') === 'session_expired'
            ? 'Your session expired. Sign in to continue where you left off.'
            : signup
              ? 'A place to keep your team in context.'
              : 'Sign in to pick up where your team left off.'}
        </p>
        <ProductOAuthButtons destination={redirectTo} transaction={transaction} />
        <div className="collo-auth-divider">
          <span>or continue with email</span>
        </div>
        <form onSubmit={auth.submit} aria-busy={transaction.busy}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            disabled={transaction.busy}
            value={auth.email}
            onChange={(e) => auth.setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-describedby={auth.error ? 'auth-error' : undefined}
          />
          <label htmlFor="password">Password</label>
          <div className="collo-password">
            <input
              id="password"
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              required
              minLength={signup ? 8 : undefined}
              disabled={transaction.busy}
              value={auth.password}
              onChange={(e) => auth.setPassword(e.target.value)}
              placeholder={signup ? 'At least 8 characters' : 'Enter your password'}
              aria-describedby={auth.error ? 'auth-error' : undefined}
            />
            <button
              type="button"
              className="collo-icon-button"
              aria-label={visible ? 'Hide password' : 'Show password'}
              aria-pressed={visible}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {signup && (
            <>
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                required
                disabled={transaction.busy}
                value={auth.confirmPassword}
                onChange={(e) => auth.setConfirmPassword(e.target.value)}
              />
            </>
          )}
          {auth.error && (
            <p
              id="auth-error"
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="collo-auth-error"
            >
              {auth.error}
            </p>
          )}
          <Button type="submit" disabled={transaction.busy} className="collo-auth-submit">
            {authLoading
              ? signup
                ? 'Creating account…'
                : 'Signing in…'
              : signup
                ? 'Create account'
                : 'Sign In'}
            {!authLoading && <ArrowRight size={17} />}
          </Button>
        </form>
        {!signup && (
          <p className="collo-auth-switch">
            <Link href={`/forgot-password?return_to=${encodeURIComponent(redirectTo)}`}>
              Forgot password?
            </Link>
          </p>
        )}
        <p className="collo-auth-switch">
          {signup ? 'Already have an account?' : 'New to ColloSys?'}{' '}
          <Link
            href={`${signup ? '/login' : '/signup'}?return_to=${encodeURIComponent(redirectTo)}`}
          >
            {signup ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
        {signup && (
          <p className="collo-auth-local">This account belongs to this ColloSys service.</p>
        )}
      </div>
    </AuthSurface>
  );
}
export function ProductLogin() {
  return (
    <Suspense fallback={<AppLoader />}>
      <AuthForm flow="signIn" />
    </Suspense>
  );
}
export function ProductSignup() {
  return (
    <Suspense fallback={<AppLoader />}>
      <AuthForm flow="signUp" />
    </Suspense>
  );
}

const recoveryConfig = makeFunctionReference<
  'query',
  Record<string, never>,
  { emailRecovery: boolean }
>('auth:signInProviders');
export function ProductForgotPassword() {
  const params = useSearchParams(),
    destination = applicationDestination(params.get('return_to'));
  const recovery = useResetRequest(),
    config = useQueryNoThrow(recoveryConfig, {});
  return (
    <AuthSurface>
      <div className="collo-auth-step">
        <h1>{recovery.sent ? 'Check your email' : 'Reset your password'}</h1>
        <p>
          {recovery.sent
            ? 'Use the code from this service to choose a new password.'
            : 'Keep your account and its work. Request a recovery code from your ColloSys service.'}
        </p>
        {!config.data?.emailRecovery && (
          <p role="alert" className="collo-auth-error">
            {config.error
              ? 'The service could not check email recovery. Try again when connected.'
              : config.data
                ? 'Email recovery is not configured for this service. Ask its owner to enable email delivery. No code has been sent.'
                : 'Checking email recovery…'}
          </p>
        )}
        {recovery.sent ? (
          <p className="collo-auth-switch">
            <Link
              href={`/reset-password?email=${encodeURIComponent(recovery.email)}&return_to=${encodeURIComponent(destination)}`}
            >
              Enter recovery code
            </Link>
          </p>
        ) : (
          <form onSubmit={recovery.submit}>
            <label htmlFor="recovery-email">Email</label>
            <input
              id="recovery-email"
              type="email"
              autoComplete="email"
              required
              value={recovery.email}
              onChange={(e) => recovery.setEmail(e.target.value)}
            />
            {recovery.error && (
              <p role="alert" className="collo-auth-error">
                {recovery.error}
              </p>
            )}
            <Button
              type="submit"
              className="collo-auth-submit"
              disabled={recovery.loading || !config.data?.emailRecovery}
            >
              {recovery.loading ? 'Requesting code…' : 'Send recovery code'}
            </Button>
          </form>
        )}
        <p className="collo-auth-switch">
          <Link href={`/login?return_to=${encodeURIComponent(destination)}`}>Back to sign in</Link>
        </p>
      </div>
    </AuthSurface>
  );
}
export function ProductResetPassword() {
  const params = useSearchParams(),
    destination = applicationDestination(params.get('return_to'));
  const recovery = useResetConfirm(params.get('email') || '', () => location.assign(destination));
  return (
    <AuthSurface>
      <div className="collo-auth-step">
        <h1>Choose a new password</h1>
        <p>Enter the recovery code sent by your ColloSys service.</p>
        <form onSubmit={recovery.submit}>
          <label htmlFor="recovery-code">Recovery code</label>
          <input
            id="recovery-code"
            autoComplete="one-time-code"
            required
            value={recovery.code}
            onChange={(e) => recovery.setCode(e.target.value)}
          />
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={recovery.newPassword}
            onChange={(e) => recovery.setNewPassword(e.target.value)}
          />
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={recovery.confirmPassword}
            onChange={(e) => recovery.setConfirmPassword(e.target.value)}
          />
          {recovery.error && (
            <p role="alert" className="collo-auth-error">
              {recovery.error}
            </p>
          )}
          <Button type="submit" className="collo-auth-submit" disabled={recovery.loading}>
            {recovery.loading ? 'Updating password…' : 'Update password'}
          </Button>
        </form>
        <p className="collo-auth-switch">
          <Link href={`/forgot-password?return_to=${encodeURIComponent(destination)}`}>
            Request another code
          </Link>
        </p>
      </div>
    </AuthSurface>
  );
}
