import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useConvexAuth } from 'convex/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeSlash, ArrowRight } from '@phosphor-icons/react';
import { Logo } from './ProductLogo';
import { AppLoader } from './ProductLoader';
import { useLocalAuth } from '../lib/localAuth';
import { useEmailAuth } from '../hooks/useEmailAuth';
import { EmailVerificationForm } from '../components/EmailVerificationForm';
import { Button } from '../components/ui/button';
import { useCodecastSignOut } from '../hooks/useCodecastSignOut';

function AuthSurface({ children }: { children: ReactNode }) {
  return (
    <main className="collo-auth-layout">
      <header className="collo-auth-brand">
        <Logo />
        <span className="collo-auth-edition">Team workspace</span>
      </header>
      <section className="collo-auth-work">
        <div className="collo-auth-content">
          <span className="collo-auth-kicker">YOUR WORK, IN CONTEXT</span>
          {children}
        </div>
        <footer>
          <strong>Independent directories. Shared understanding.</strong>
          <span>Conversations, checkpoints and handoffs, together.</span>
        </footer>
      </section>
    </main>
  );
}

function AuthForm({ flow }: { flow: 'signIn' | 'signUp' }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const localAuthed = useLocalAuth();
  const router = useRouter(),
    params = useSearchParams();
  const target = params.get('return_to');
  // Reject protocol-relative and backslash-normalized external destinations.
  const redirectTo =
    target?.startsWith('/') && !target.startsWith('//') && !target.includes('\\')
      ? target
      : '/projects';
  const auth = useEmailAuth(flow, redirectTo);
  const recovering = params.get('recover') === '1';
  const signOut = useCodecastSignOut();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const signup = flow === 'signUp';
  const [visible, setVisible] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (auth.error) errorRef.current?.focus();
  }, [auth.error]);
  useEffect(() => {
    if (!recovering && (localAuthed || (!isLoading && isAuthenticated))) router.replace(redirectTo);
  }, [localAuthed, isLoading, isAuthenticated, redirectTo, router, recovering]);
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
                } catch {
                  setRecoveryError(
                    'Sign-out did not finish. Try again to securely clear this session.',
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
  if (localAuthed || isLoading || isAuthenticated)
    return <AppLoader label="Restoring your workspace" />;
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
    <AuthSurface>
      <div className="collo-auth-step" key={flow}>
        <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p>
          {params.get('reason') === 'session_expired'
            ? 'Your session expired. Sign in to continue where you left off.'
            : signup
              ? 'A place to keep your team in context.'
              : 'Sign in to pick up where your team left off.'}
        </p>
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
          <Button type="submit" disabled={auth.loading} className="collo-auth-submit">
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
        <p className="collo-auth-switch">
          {signup ? 'Already have an account?' : 'New to ColloSys?'}{' '}
          <Link
            href={`${signup ? '/login' : '/signup'}?return_to=${encodeURIComponent(redirectTo)}`}
          >
            {signup ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
        {signup && (
          <p className="collo-auth-local">
            This account belongs to this ColloSys service. Email delivery is not configured.
          </p>
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
