// Full upstream reference, isolated from ColloSys accounts and workspaces.
// No fixture seeding, cloud deployment, email or model credentials.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as connectSocket } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acquireApplicationLock } from './codecast-runtime-lock.mjs';
import { buildFingerprint } from './codecast-build-inputs.mjs';
import { readProductOAuthSettings, oauthEnvironmentNames, oauthNetworkHosts } from './product-oauth-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appMode = process.argv.includes('--app');
if (appMode) {
  await acquireApplicationLock();
  await import('./codecast-prepare.mjs');
}
const upstream = path.join(
  root,
  appMode ? '.local/codecast-app/source' : 'third_party/codecast/upstream',
);
const data = path.join(root, appMode ? '.local/codecast-app' : '.local/codecast-reference');
const runtime = path.join(root, '.local/codecast-runtime');
const webPort = appMode ? 3407 : 3297;
const backendPort = webPort + 1,
  sitePort = webPort + 2,
  proxyPort = webPort + 3;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const siteUrl = `http://127.0.0.1:${sitePort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
await mkdir(data, { recursive: true });
const executable = path.join(runtime, 'bin/convex-local-backend.exe');
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !/^(CONVEX_|VITE_|AUTH_|JWT_|JWKS|RESEND_|SENTRY_|POSTHOG_|VERCEL|OPENAI_|ANTHROPIC_|GOOGLE_|GITHUB_|AWS_|R2_|CF_|CLOUDFLARE_)/i.test(
        key,
      ),
  ),
);
Object.assign(env, {
  CI: '1',
  SENTRY_DSN: '',
  DISABLE_BEACON: 'true',
  DATABASE_UDF_USER_TIMEOUT_SECONDS: '30',
  ISOLATE_ANALYZE_USER_TIMEOUT_SECONDS: '120',
});
let secret;
try {
  secret = (await readFile(path.join(data, 'instance-secret'), 'utf8')).trim();
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  secret = randomBytes(32).toString('hex');
  await writeFile(path.join(data, 'instance-secret'), secret, { flag: 'wx', mode: 0o600 });
}
const instance = appMode ? 'collosys-codecast-app' : 'collosys-codecast-reference';
const key = spawnSync(
  executable,
  ['keygen', 'admin-key', '--instance-name', instance, '--instance-secret', secret],
  { env, encoding: 'utf8', windowsHide: true },
);
if (key.status !== 0) throw new Error(`Local key generation failed: ${key.stderr}`);
const adminKey = key.stdout.trim();
const children = [];
const oauthChanges = appMode ? await readProductOAuthSettings(data) : [];
let oauthHosts = new Set();
// The reference needs no external action fetches. Block them before any
// upstream schedules or UI actions can turn into external requests.
const actionProxy = createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url);
  } catch {}
  if (url?.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && oauthHosts.has(url.hostname)) {
    const upstreamRequest = httpsRequest(url, { method: req.method, headers: { ...req.headers, host: url.host } }, response => {
      res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
    });
    upstreamRequest.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    upstreamRequest.setTimeout(15000, () => upstreamRequest.destroy()); req.pipe(upstreamRequest); return;
  }
  // Convex also routes JWT discovery through this proxy. Only its own local
  // public identity documents are needed; arbitrary local URLs stay blocked.
  if (
    req.method === 'GET' &&
    url?.origin === siteUrl &&
    ['/.well-known/openid-configuration', '/.well-known/jwks.json'].includes(url.pathname) &&
    !url.search &&
    !url.username &&
    !url.password
  ) {
    const upstreamRequest = httpRequest(
      url,
      { method: 'GET', headers: { Accept: 'application/json' } },
      (upstreamResponse) => {
        res.writeHead(upstreamResponse.statusCode || 502, { 'Content-Type': 'application/json' });
        upstreamResponse.pipe(res);
      },
    );
    upstreamRequest.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    upstreamRequest.setTimeout(5000, () => upstreamRequest.destroy());
    upstreamRequest.end();
    return;
  }
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('External actions are disabled in the local reference.');
});
actionProxy.on('connect', (req, socket, head) => {
  const match = /^([a-z0-9.-]+):443$/.exec(req.url || '');
  if (!match || !oauthHosts.has(match[1])) { socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n'); return; }
  const upstreamSocket = connectSocket({ host: match[1], port: 443 }, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstreamSocket.write(head);
    socket.pipe(upstreamSocket); upstreamSocket.pipe(socket);
  });
  upstreamSocket.setTimeout(20000, () => upstreamSocket.destroy());
  upstreamSocket.on('error', () => socket.destroy()); socket.on('error', () => upstreamSocket.destroy());
  socket.on('close', () => upstreamSocket.destroy());
});
function start(command, args, cwd, childEnv, name) {
  const output = createWriteStream(path.join(data, `${name}.log`), { flags: 'a' });
  const child = spawn(command, args, {
    cwd,
    env: childEnv,
    windowsHide: name !== 'desktop',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(output);
  child.stderr.pipe(output);
  child.on('error', (e) => {
    console.error(`${name}: ${e.message}`);
  });
  children.push(child);
  return child;
}
function stop() {
  for (const child of children) if (child.exitCode === null && !child.killed) child.kill();
  actionProxy.close();
}
process.once('SIGINT', () => {
  stop();
  process.exit();
});
process.once('SIGTERM', () => {
  stop();
  process.exit();
});
process.once('exit', stop);
async function waitFor(url, child, limit = 180_000) {
  const until = Date.now() + limit;
  while (Date.now() < until) {
    if (child.exitCode !== null)
      throw new Error(`Process stopped with ${child.exitCode}; inspect ${data}`);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Local service did not become ready: ${url}`);
}
try {
  await new Promise((resolve, reject) => {
    actionProxy.once('error', reject);
    actionProxy.listen(proxyPort, '127.0.0.1', resolve);
  });
  if (appMode && process.argv.includes('--built')) {
    let fingerprint;
    try {
      fingerprint = JSON.parse(
        await readFile(path.join(root, 'dist/codecast-app/collo-build.json'), 'utf8'),
      ).fingerprint;
    } catch {}
    if (fingerprint !== (await buildFingerprint())) {
      console.log('Building the complete Codecast application for the current integration.');
      const build = start(
        process.execPath,
        [path.join(root, 'scripts/codecast-build.mjs'), '--prepared'],
        root,
        env,
        'build',
      );
      if ((await new Promise((resolve) => build.once('exit', resolve))) !== 0)
        throw new Error('Application build failed; see build.log');
    }
  }
  try {
    await fetch(`${backendUrl}/instance_name`, { signal: AbortSignal.timeout(750) });
    throw new Error('Reference backend port already in use');
  } catch (e) {
    if (e.message === 'Reference backend port already in use') throw e;
  }
  const backend = start(
    executable,
    [
      '--interface',
      '127.0.0.1',
      '--port',
      String(backendPort),
      '--site-proxy-port',
      String(sitePort),
      '--disable-beacon',
      '--convex-http-proxy',
      `http://127.0.0.1:${proxyPort}`,
      '--instance-name',
      instance,
      '--instance-secret',
      secret,
      '--convex-origin',
      backendUrl,
      '--convex-site',
      siteUrl,
      '--local-storage',
      path.join(data, 'storage'),
      path.join(data, 'database.sqlite3'),
    ],
    data,
    env,
    'backend',
  );
  await waitFor(`${backendUrl}/instance_name`, backend);
  const envFile = path.join(data, 'local.env');
  await writeFile(
    envFile,
    `CONVEX_SELF_HOSTED_URL=${backendUrl}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}\n`,
    { mode: 0o600 },
  );
  // Auth keys are created once per isolated reference database.
  const { ConvexHttpClient } = await import(
    pathToFileURL(
      path.join(upstream, 'packages/convex/node_modules/convex/dist/esm/browser/index.js'),
    ).href
  );
  const client = new ConvexHttpClient(backendUrl);
  client.setAdminAuth(adminKey);
  const existing = await Promise.all(
    ['JWT_PRIVATE_KEY', 'JWKS'].map((name) =>
      client.query('_system/cli/queryEnvironmentVariables:get', { name }),
    ),
  );
  const changes = [{ name: 'SITE_URL', value: webUrl }, ...oauthChanges];
  if (existing.some((value) => !value)) {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = pair.publicKey.export({ format: 'jwk' });
    Object.assign(jwk, { use: 'sig', alg: 'RS256' });
    changes.push(
      {
        name: 'JWT_PRIVATE_KEY',
        value: pair.privateKey
          .export({ format: 'pem', type: 'pkcs8' })
          .toString()
          .trim()
          .replaceAll('\n', ' '),
      },
      { name: 'JWKS', value: JSON.stringify({ keys: [jwk] }) },
    );
  }
  const configured = await fetch(`${backendUrl}/api/update_environment_variables`, {
    method: 'POST',
    headers: { Authorization: `Convex ${adminKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes }),
  });
  if (!configured.ok) throw new Error(`Local auth configuration failed: ${configured.status}`);
  const configuredOAuth = await Promise.all(oauthEnvironmentNames.map(name => client.query('_system/cli/queryEnvironmentVariables:get', { name })));
  oauthHosts = oauthNetworkHosts({ github: !!configuredOAuth[0] && !!configuredOAuth[1], google: !!configuredOAuth[2] && !!configuredOAuth[3] });
  // Existing email recovery remains opt-in through its backend-only setting.
  if (await client.query('_system/cli/queryEnvironmentVariables:get', { name: 'RESEND_API_KEY' })) oauthHosts.add('api.resend.com');
  // Values never enter renderer env, output, diagnostic JSON or command args.
  console.log(`ColloSys sign-in configuration: GitHub ${configuredOAuth[0] && configuredOAuth[1] ? 'available' : 'not configured'}; Google ${configuredOAuth[2] && configuredOAuth[3] ? 'available' : 'not configured'}.`);
  console.log('Preparing full upstream functions on the isolated loopback backend.');
  const cli = path.join(upstream, 'packages/convex/node_modules/convex/bin/main.js');
  const push = start(
    process.execPath,
    [
      cli,
      'dev',
      '--env-file',
      envFile,
      '--once',
      '--codegen',
      'disable',
      '--typecheck',
      'disable',
      '--tail-logs',
      'disable',
    ],
    path.join(upstream, 'packages/convex'),
    env,
    'functions',
  );
  const exitCode = await new Promise((resolve) => push.once('exit', resolve));
  if (exitCode !== 0)
    throw new Error(`Local function initialization failed (${exitCode}); see functions.log`);
  if (appMode) {
    const manager = start(
      process.execPath,
      ['--import', 'tsx', path.join(root, 'scripts/codecast-manager.ts')],
      root,
      { ...env, COLLOSYS_CODECAST_SITE: siteUrl },
      'manager',
    );
    await waitFor('http://127.0.0.1:3411/health', manager);
  }
  const web = start(
    process.execPath,
    [
      path.join(upstream, 'packages/web/node_modules/vite/bin/vite.js'),
      ...(process.argv.includes('--built')
        ? ['preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort']
        : []),
      '--config',
      path.join(root, 'third_party/codecast/collo/vite.config.ts'),
    ],
    path.join(upstream, 'packages/web'),
    { ...env, COLLOSYS_CODECAST_BACKEND: backendUrl, COLLOSYS_CODECAST_APP: appMode ? '1' : '' },
    'web',
  );
  await waitFor(`${webUrl}/login`, web);
  await writeFile(
    path.join(data, 'ready.json'),
    JSON.stringify(
      {
        webUrl,
        backendUrl,
        siteUrl,
        upstreamCommit: '5dfb04f516122fe4f59a61137219b5a4e2e1f9f8',
        referenceOnly: !appMode,
        seeded: false,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `${appMode ? 'ColloSys Codecast application' : 'Full upstream reference'} ready: ${webUrl}/login (no seeded data)`,
  );
  if (appMode && process.argv.includes('--desktop')) {
    const desktopEnv = { ...env };
    delete desktopEnv.ELECTRON_RUN_AS_NODE;
    const desktop = start(
      path.join(root, 'node_modules/electron/dist/electron.exe'),
      [path.join(root, 'integrations/codecast/desktop/main.cjs')],
      root,
      desktopEnv,
      'desktop',
    );
    const desktopCode = await new Promise((resolve, reject) => {
      desktop.once('exit', resolve);
      desktop.once('error', reject);
    });
    if (desktopCode) throw new Error(`Desktop window stopped (${desktopCode}); see desktop.log`);
    console.log("Desktop closed; stopping this application's local services.");
  } else {
    if (appMode && process.argv.includes('--open') && process.platform === 'win32') {
      // Read the launcher URL locally; do not put the pairing secret in logs.
      const script = `$launcher = Get-Content -LiteralPath '${path.join(data, 'launcher.json').replaceAll("'", "''")}' -Raw | ConvertFrom-Json; Start-Process $launcher.url`;
      const browser = spawn(
        'powershell.exe',
        ['-NoProfile', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        { windowsHide: true, stdio: 'ignore' },
      );
      browser.unref();
    }
    await new Promise((resolve) => web.once('exit', resolve));
  }
} finally {
  stop();
}
