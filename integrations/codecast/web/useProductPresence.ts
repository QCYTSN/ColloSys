import { useLayoutEffect, useRef, useState } from 'react';
import { useAuthPrincipal } from '../lib/authPrincipal';
import { useServerAuthState } from '../hooks/useServerAuthSettled';

// Only presentation survives a voluntary close. A principal change or explicit
// permission loss removes it during render, before any animation can paint.
export function useProductPresence<T>(value: T | null, allowed = true) {
  const { epoch, principalId } = useAuthPrincipal();
  const auth = useServerAuthState();
  const safe = allowed && !!principalId && !auth.identityLost;
  const held = useRef<{ epoch: number; value: T } | null>(null);
  const [leaving, setLeaving] = useState(false);
  if (!safe || held.current?.epoch !== epoch) held.current = null;
  if (safe && value !== null) held.current = { epoch, value };
  const exiting = safe && value === null && held.current !== null;
  useLayoutEffect(() => {
    if (!exiting) {
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(
      () => {
        held.current = null;
        setLeaving(false);
      },
      reduced ? 0 : 180,
    );
    return () => window.clearTimeout(timer);
  }, [exiting, epoch, safe]);
  return {
    value: safe ? (value ?? held.current?.value ?? null) : null,
    phase: exiting || leaving ? 'closing' : 'open',
  } as const;
}
