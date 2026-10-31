import { useSyncExternalStore } from 'react';
import { useConvex } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '../components/ui/dialog';
import type { IdentityProvider } from './productAuthPolicy';

export type ProviderCapability = 'checking' | 'ready' | 'unconfigured' | 'temporarily-unavailable';
type ProviderConfig = {
  github: boolean;
  google: boolean;
  password: boolean;
  diagnostics?: { missing: string[]; siteOrigin: string; callbackOrigin: string };
};
const providersQuery = makeFunctionReference<'query', Record<string, never>, ProviderConfig>(
  'auth:signInProviders',
);
export function useProviderCapabilities() {
  const client = useConvex();
  const connected = useSyncExternalStore(
    (fn) => client.subscribeToConnectionState(fn),
    () => client.connectionState().isWebSocketConnected,
    () => false,
  );
  const query = useQueryNoThrow(providersQuery, {}, { breakAfterMs: 8000 });
  const state = (provider: IdentityProvider): ProviderCapability =>
    query.error || (!connected && query.data)
      ? 'temporarily-unavailable'
      : !query.data
        ? 'checking'
        : query.data[provider]
          ? 'ready'
          : 'unconfigured';
  return { ...query, state };
}
export function ProviderHelp({ config }: { config?: ProviderConfig }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="collo-provider-help">
          Setup help
        </button>
      </DialogTrigger>
      <DialogContent className="collo-provider-help-dialog">
        <DialogHeader>
          <DialogTitle>Sign-in services</DialogTitle>
          <DialogDescription>
            The service owner enables GitHub and Google. Email sign-in remains available.
          </DialogDescription>
        </DialogHeader>
        <p>
          An unavailable provider is not a connected account. After the owner updates the service,
          use Refresh check without leaving your form.
        </p>
        <details>
          <summary>Service owner configuration</summary>
          <p>
            Use a GitHub OAuth App and a Google Web application client. Store client IDs and secrets
            on the backend. Never enter secrets in this form.
          </p>
          {config?.diagnostics ? (
            <>
              <p>
                Missing:{' '}
                {config.diagnostics.missing.join(', ') ||
                  'No required client settings are missing.'}
              </p>
              <p>Product: {config.diagnostics.siteOrigin}</p>
              <p>Callbacks:</p>
              <code>
                {config.diagnostics.callbackOrigin}/api/auth/callback/github
                <br />
                {config.diagnostics.callbackOrigin}/api/auth/callback/google
              </code>
            </>
          ) : (
            <p>Configuration details are temporarily unavailable. Retry the service check.</p>
          )}
          <p>
            Local owners can edit .local/codecast-app/oauth.env and restart npm start. Separate
            production clients use the deployed HTTPS callback origin.
          </p>
        </details>
      </DialogContent>
    </Dialog>
  );
}
