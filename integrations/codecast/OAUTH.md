# ColloSys sign-in configuration

The existing Convex Auth service owns password, GitHub and Google accounts and issues the same ColloSys sessions. Provider ID + provider subject identifies an account. An email collision does **not** merge accounts automatically; sign in with the original method. Account settings now supports explicit provider linking after recent verification of an existing method. The originating authenticated session owns the target account; the system browser cannot replace it.

## Local development and the current Windows product

1. The service owner creates a GitHub **OAuth App** and a Google OAuth **Web application** client. The desktop delegates to this web service in the system browser; it is not a Google installed-app client and does not embed provider pages.
2. Register the exact callbacks:
   - GitHub: `http://127.0.0.1:3409/api/auth/callback/github`
   - Google: `http://127.0.0.1:3409/api/auth/callback/google`
   - Application / JavaScript origin where requested: `http://127.0.0.1:3407`. Add intended test users in the Google consent configuration while it is in testing. Both loopback services must be running on the browser's machine.
3. Copy `integrations/codecast/oauth.env.example` to the ignored `.local/codecast-app/oauth.env`. Fill `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. These are backend values, never `VITE_*`, renderer arguments or packaged resources. Do not commit or share that file. An explicitly empty value removes that backend setting; an omitted value preserves existing backend configuration.
4. Close ColloSys and run `npm start` (native production) or `npm run codecast:app` (browser development). The launcher prints only configured/not-configured booleans. It enables backend outbound HTTPS only for configured provider hosts. Email/password remains available.
5. Run `npm run auth:check` (exit 2 means configuration is incomplete), then `npm run auth:verify -- --provider=github` and `npm run auth:verify -- --provider=google` for a visible, isolated browser round trip. These browser checks do not certify the native handoff or account-link flow. Verify each provider in the normal native window using an actual account: new sign-in, existing provider identity, cancellation, desktop approval, return to the requested project, sign-out and reopening. No provider client has been registered/configured by this implementation.

Browser OAuth returns to `/auth/complete`; the saved, validated application destination then opens. Desktop creates an expiring request with a secret held only by its renderer, opens `/auth/desktop?attempt=<request ID>`, requires fresh provider authentication plus explicit account approval, and atomically claims the result. That URL contains neither a bearer token nor a claim secret. The original Convex Auth code exchange verifies state/PKCE, and Google also uses an OIDC nonce. The product fence rejects callbacks after local sign-out or cancellation.

## Future hosted service (not deployed)

Set the same four secrets in the Convex backend environment. Set `SITE_URL` to the HTTPS product origin and configure the Convex Auth issuer/JWKS using that deployment's `CONVEX_SITE_URL`. Register `<CONVEX_SITE_URL>/api/auth/callback/github` and `/google` with the providers, and the product HTTPS origin with Google where required. Use separate provider clients for production. Do not reuse local HTTP addresses as production callbacks.

The current native launcher intentionally accepts only its loopback product service. A hosted desktop service needs an explicit deployment/configuration change and a new origin-policy review; filling these four variables alone does not deploy a team backend. Provider secrets in a shared production installation belong on the service, never in distributed desktop files.

## Current verification boundary

No GitHub or Google credentials are available in this workspace. Missing configuration, real password sessions, relay security and controlled failure tests are separate from a real provider end-to-end test. Email delivery/reset also requires the existing service's mail configuration; no messages or invitations are sent by these tests.

## Account linking contract

Settings → Profile & appearance → Login methods lists the current account’s password and provider mappings. Reverify the current password (SDK hash/rate limiting, no extra session) or an already-linked provider. Link starts an expiring session-bound request; the provider profile is staged after the SDK validates state/PKCE/nonce. Confirm the displayed identity in the original window. Final mutation checks session, challenge, generation, expiry, recent original-method proof and provider-subject uniqueness again. No users/projects are copied or merged. Unlink requires recent verification and another enabled login method.

The owned adapter wraps the pinned Convex Auth 0.0.79 internal registered store handler only for bound linking verifiers. Other account and token operations are forwarded intact. SDK upgrades must run `npm run test:account-links` against the prepared local service. That controlled test refuses to overwrite configured provider credentials, temporarily installs unused TEST settings, injects only post-provider proof, exercises real mappings/sessions, and restores settings in `finally`. It is not external OAuth evidence. Current user direction: finish implementation first; real authorization remains pending configuration.
