import { useRef, useState, type FormEvent } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { acquireAuthAttempt, isCurrentAuthAttempt, transitionAuthAttempt } from './authTransaction';

export function useProductEmailAuth(flow: 'signIn' | 'signUp', owner: string) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(''),
    [pendingVerification, setPendingVerification] = useState(false);
  const { signIn } = useAuthActions();
  const last = useRef<ReturnType<typeof acquireAuthAttempt>>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const attempt = acquireAuthAttempt('password', owner);
    if (!attempt) return;
    last.current = attempt;
    setError('');
    if (flow === 'signUp' && password !== confirmPassword) {
      setError('Passwords do not match. Check the confirmation field.');
      transitionAuthAttempt(attempt, 'failed');
      return;
    }
    transitionAuthAttempt(attempt, 'submitting');
    try {
      const result = await signIn('password', { email, password, flow });
      if (!isCurrentAuthAttempt(attempt)) return;
      if (result?.signingIn === false) {
        setPendingVerification(true);
        transitionAuthAttempt(attempt, 'idle');
      } else transitionAuthAttempt(attempt, 'establishing-session');
      // Only the session-verified completion effect navigates.
    } catch (cause) {
      if (!isCurrentAuthAttempt(attempt)) return;
      const message = cause instanceof Error ? cause.message : '';
      setError(
        flow === 'signUp'
          ? /already|exists|registered/i.test(message)
            ? 'This email already has an account. Sign in with its original method, then link another login in account settings.'
            : 'Could not create the account. Check your connection and try again.'
          : /Invalid|credentials|not found/i.test(message)
            ? 'Invalid email or password. Check your details and try again.'
            : 'Sign-in could not finish. Check your connection and try again.',
      );
      transitionAuthAttempt(attempt, 'failed');
    }
  };
  return {
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    submit,
    pendingVerification,
    verified: () => {
      if (last.current) transitionAuthAttempt(last.current, 'establishing-session');
    },
    startOver: () => setPendingVerification(false),
  };
}
