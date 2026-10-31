// Prints capability and origin metadata only. Never prints client IDs, secrets or tokens.
import fs from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';
const env = parseEnv(await fs.readFile('.local/codecast-app/local.env', 'utf8'));
if (env.CONVEX_SELF_HOSTED_URL !== 'http://127.0.0.1:3408')
  throw new Error('This check targets only the local product backend.');
const client = new ConvexHttpClient(env.CONVEX_SELF_HOSTED_URL);
const config = await client.query('auth:signInProviders', {});
const result = {
  github: config.github
    ? 'configured; real authorization still requires verification'
    : 'not configured',
  google: config.google
    ? 'configured; real authorization still requires verification'
    : 'not configured',
  password: config.password,
  origins: config.diagnostics
    ? { product: config.diagnostics.siteOrigin, callbacks: config.diagnostics.callbackOrigin }
    : null,
  missing: config.diagnostics?.missing || [],
  handoff: 'docs/product-ui/auth-completion/OAUTH_HANDOFF.md',
};
console.log(JSON.stringify(result, null, 2));
if (!config.github || !config.google) process.exitCode = 2;
