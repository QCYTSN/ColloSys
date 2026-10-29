import { useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useAuthPrincipal } from '../lib/authPrincipal';
import { useServerAuthState } from '../hooks/useServerAuthSettled';

// Only presentation survives a voluntary close. A principal change or explicit
// permission loss removes it during render, before any animation can paint.
export function useProductPresence<T>(value: T | null, allowed = true) {
  const { epoch, principalId } = useAuthPrincipal();
  const auth = useServerAuthState();
  const safe = allowed && !!principalId && !auth.identityLost;
  const held = useRef<{ epoch: number; value: T } | null>(null);
  const element = useRef<HTMLElement | null>(null);
  const [, update] = useState(0);
  const ref = useCallback((node: HTMLElement | null) => {
    element.current = node;
  }, []);
  if (!safe || held.current?.epoch !== epoch) held.current = null;
  if (safe && value !== null) held.current = { epoch, value };
  const exiting = safe && value === null && held.current !== null;
  useLayoutEffect(() => {
    if (!exiting) return;
    let active = true;
    const node = element.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => {
      if (!active) return;
      active = false;
      held.current = null;
      update((n) => n + 1);
    };
    // The animation on the real surface owns its lifetime. No second JS
    // duration can cut a longer CSS exit short. Reopening cancels this closure.
    const animations =
      node
        ?.getAnimations()
        .filter((a) => a.effect instanceof KeyframeEffect && a.effect.target === node) ?? [];
    if (reduced.matches || !animations.length) finish();
    else void Promise.allSettled(animations.map((a) => a.finished)).then(finish);
    const reducedChanged = () => {
      if (reduced.matches) finish();
    };
    reduced.addEventListener('change', reducedChanged);
    return () => {
      active = false;
      reduced.removeEventListener('change', reducedChanged);
    };
  }, [exiting, epoch, safe]);
  return {
    value: safe ? (value ?? held.current?.value ?? null) : null,
    phase: exiting ? 'closing' : 'open',
    ref,
  } as const;
}
