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
  const idle = args === 'skip';
  const denied = auth.identityLost || (!idle && permissionFailure(result.error));
  if (previous.current.key !== key || denied || idle || !principal.principalId)
    previous.current = { key, data: undefined };
  else if (result.data !== undefined) previous.current = { key, data: result.data };
  const data =
    denied || idle || !principal.principalId ? undefined : (result.data ?? previous.current.data);
  const error = idle ? undefined : result.error;
  const status = denied
    ? 'access-denied'
    : idle
      ? 'idle'
      : error
        ? 'transient-error'
        : data === undefined
          ? 'loading'
          : 'valid';
  return { ...result, data, error, denied, status };
}
