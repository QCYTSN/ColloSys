import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { subscribeAuthPolicy } from './productAuthPolicy';
import {
  adoptAuthAttempt,
  authAttemptBusy,
  getAuthAttempt,
  releaseAuthOwner,
  subscribeAuthAttempt,
} from './authTransaction';

export function useAuthTransaction() {
  const owner = useRef(crypto.randomUUID()).current;
  const attempt = useSyncExternalStore(subscribeAuthAttempt, getAuthAttempt, () => null);
  useSyncExternalStore(
    subscribeAuthPolicy,
    () => localStorage.getItem('collosys.auth.generation.v1') ?? '',
    () => '',
  );
  useLayoutEffect(() => {
    adoptAuthAttempt(owner);
    return () => releaseAuthOwner(owner);
  }, [owner]);
  return { attempt, owner, busy: authAttemptBusy(attempt) };
}
