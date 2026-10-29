import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeSlash, ArrowRight } from '@phosphor-icons/react';
import { Logo } from './ProductLogo';
import { AppLoader } from './ProductLoader';
import { useProductStartup, StartupRecovery } from './ProductStartup';
import { applicationDestination } from './productAuthPolicy';
import { ProductOAuthButtons, type OAuthPhase } from './ProductOAuth';
import { ProductAuthScene } from './ProductAuthScene';
import { useEmailAuth, useResetRequest, useResetConfirm } from '../hooks/useEmailAuth';
import { makeFunctionReference } from 'convex/server';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { EmailVerificationForm } from '../components/EmailVerificationForm';
import { Button } from '../components/ui/button';
import { useProductSignOut } from './ProductSignOut';

function AuthSurface({ children, state = 'idle' }: { children: ReactNode; state?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <main className="collo-auth-layout">
      <section className="collo-auth-visual">
        <header className="collo-auth-brand">
          <Logo />
          <span className="collo-auth-edition">A space to work together</span>
        </header>
        <ProductAuthScene state={state === 'idle' && focused ? 'focused' : state} />
        <div className="collo-auth-scene-caption">
          <span className="collo-auth-kicker">A LITTLE CONTEXT GOES A LONG WAY</span>
          <h2>
            Independent work.
            <br />
            Shared understanding.
          </h2>
          <p>
            Keep the conversation, the changes
            <br />
            and the next step together.
          </p>
        </div>
        <span className="collo-auth-scene-foot">Made for small teams doing thoughtful work.</span>
      </section>
      <section
        className="collo-auth-work"
        onFocusCapture={(event) => {
          if ((event.target as HTMLElement).tagName === 'INPUT') setFocused(true);
        }}
        onBlurCapture={() => setFocused(false)}
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
  const auth = useEmailAuth(flow, redirectTo);
  const recovering = params.get('recover') === '1';
  const signOut = useProductSignOut();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const signup = flow === 'signUp';
  const [visible, setVisible] = useState(false);
  const [oauthPhase, setOAuthPhase] = useState<OAuthPhase>('idle');
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (auth.error) errorRef.current?.focus();
  }, [auth.error]);
  useEffect(() => {
    if (!recovering && startup.canRead) router.replace(redirectTo);
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
  if (startup.phase !== 'signed-out') return <StartupRecovery />;
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
    <AuthSurface state={oauthPhase}>
      <div className="collo-auth-step" key={flow}>
        <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p>
          {params.get('reason') === 'session_expired'
            ? 'Your session expired. Sign in to continue where you left off.'
            : signup
              ? 'A place to keep your team in context.'
              : 'Sign in to pick up where your team left off.'}
        </p>
        <ProductOAuthButtons destination={redirectTo} onPhase={setOAuthPhase} />
        <div className="collo-auth-divider">
          <span>or continue with email</span>
        </div>
        <form onSubmit={auth.submit} aria-busy={auth.loading}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
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
          <Button
            type="submit"
            disabled={auth.loading || oauthPhase === 'starting' || oauthPhase === 'waiting'}
            className="collo-auth-submit"
          >
            {auth.loading
              ? signup
                ? 'Creating account…'
                : 'Signing in…'
              : signup
                ? 'Create account'
                : 'Sign In'}
            {!auth.loading && <ArrowRight size={17} />}
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
