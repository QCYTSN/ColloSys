# ColloSys sign-in configuration

The existing Convex Auth service owns password, GitHub and Google accounts and issues the same ColloSys sessions. Provider ID + provider subject identifies an account. An email collision does **not** merge accounts automatically; sign in with the original method. Explicit provider linking is not implemented in this release.

## Local development and the current Windows product

1. The service owner creates a GitHub **OAuth App** and a Google OAuth **Web application** client. The desktop delegates to this web service in the system browser; it is not a Google installed-app client and does not embed provider pages.
2. Register the exact callbacks:
   - GitHub: `http://127.0.0.1:3409/api/auth/callback/github`
   - Google: `http://127.0.0.1:3409/api/auth/callback/google`
   - Application / JavaScript origin where requested: `http://127.0.0.1:3407`. Add intended test users in the Google consent configuration while it is in testing. Both loopback services must be running on the browser's machine.
3. Copy `integrations/codecast/oauth.env.example` to the ignored `.local/codecast-app/oauth.env`. Fill `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. These are backend values, never `VITE_*`, renderer arguments or packaged resources. Do not commit or share that file. An explicitly empty value removes that backend setting; an omitted value preserves existing backend configuration.
4. Close ColloSys and run `npm start` (native production) or `npm run codecast:app` (browser development). The launcher prints only configured/not-configured booleans. It enables backend outbound HTTPS only for configured provider hosts. Email/password remains available.
5. Verify each provider using an actual account: new sign-in, existing provider identity, cancellation, desktop approval, return to the requested project, sign-out and reopening. No provider client has been registered/configured by this implementation.

Browser OAuth returns to `/auth/complete`; the saved, validated application destination then opens. Desktop creates an expiring request with a secret held only by its renderer, opens `/auth/desktop?attempt=<request ID>`, requires fresh provider authentication plus explicit account approval, and atomically claims the result. That URL contains neither a bearer token nor a claim secret. The original Convex Auth code exchange verifies state/PKCE, and Google also uses an OIDC nonce. The product fence rejects callbacks after local sign-out or cancellation.

## Future hosted service (not deployed)

Set the same four secrets in the Convex backend environment. Set `SITE_URL` to the HTTPS product origin and configure the Convex Auth issuer/JWKS using that deployment's `CONVEX_SITE_URL`. Register `<CONVEX_SITE_URL>/api/auth/callback/github` and `/google` with the providers, and the product HTTPS origin with Google where required. Use separate provider clients for production. Do not reuse local HTTP addresses as production callbacks.

The current native launcher intentionally accepts only its loopback product service. A hosted desktop service needs an explicit deployment/configuration change and a new origin-policy review; filling these four variables alone does not deploy a team backend. Provider secrets in a shared production installation belong on the service, never in distributed desktop files.

## Current verification boundary

No GitHub or Google credentials are available in this workspace. Missing configuration, real password sessions, relay security and controlled failure tests are separate from a real provider end-to-end test. Email delivery/reset also requires the existing service's mail configuration; no messages or invitations are sent by these tests.
