import { useRef } from 'react';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { getFunctionName } from 'convex/server';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { useAuthPrincipal } from '../lib/authPrincipal';
import { useServerAuthState } from '../hooks/useServerAuthSettled';
import { permissionFailure } from './collaborationModel';

// Same subscription and authorization, with a last successful view for a
// transient retry. Never reused across principals, query arguments or denial.
export function useProductQuery<Q extends FunctionReference<'query'>>(
  query: Q,
  args: FunctionArgs<Q> | 'skip',
) {
  const principal = useAuthPrincipal(),
    auth = useServerAuthState();
  const result = useQueryNoThrow(query, args);
  const key = `${principal.epoch}:${principal.principalId}:${getFunctionName(query)}:${JSON.stringify(args)}`;
  const previous = useRef<{ key: string; data: FunctionReturnType<Q> | undefined }>({
    key,
    data: undefined,
  });
  const denied =
    permissionFailure(result.error) ||
    auth.identityLost ||
    !principal.principalId ||
    args === 'skip';
  if (previous.current.key !== key || denied) previous.current = { key, data: undefined };
  else if (result.data !== undefined) previous.current = { key, data: result.data };
  return { ...result, data: denied ? undefined : (result.data ?? previous.current.data), denied };
}
