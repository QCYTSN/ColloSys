// Offline source audit. This is not provider billing telemetry or a promise of $0.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { patches } from '../integrations/codecast/patches.mjs';
import { LOCAL_INSPECTION_INTERVAL_MS } from '../integrations/codecast/web/local.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = path.join(root, 'third_party/codecast/upstream/packages/convex');

export async function scheduleManifest(adapted) {
  let contents = await fs.readFile(path.join(upstream, 'convex/crons.ts'), 'utf8');
  contents = contents.replaceAll('\r\n', '\n');
  if (adapted)
    for (const patch of patches.filter((p) => p.file === 'packages/convex/convex/crons.ts')) {
      if (contents.split(patch.before).length !== 2) throw new Error('Cron patch anchor changed');
      contents = contents.replace(patch.before, patch.after);
    }
  // Bundle the actual upstream registry/Convex SDK, never fake their registration.
  // Only the registry and generated API references are imported; no functions run.
  const result = await build({
    stdin: { contents, resolveDir: path.join(upstream, 'convex'), loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'owned-cron-imports',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/colloCrons$/ }, () => ({
            path: path.join(root, 'integrations/codecast/convex/colloCrons.ts'),
          }));
          builder.onResolve({ filter: /^\.\/_generated\/api$/ }, () => ({
            path: path.join(upstream, 'convex/_generated/api.js'),
          }));
          builder.onResolve({ filter: /^convex\/server$/ }, () => ({
            path: path.join(upstream, 'node_modules/convex/dist/esm/server/index.js'),
          }));
        },
      },
    ],
  });
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
  );
  return JSON.parse(module.default.export());
}

export function monthlyScheduleInvocations(manifest, days = 30) {
  let total = 0;
  for (const { schedule } of Object.values(manifest)) {
    if (schedule.type === 'interval') {
      const seconds =
        schedule.seconds ?? (schedule.minutes ?? 0) * 60 + (schedule.hours ?? 0) * 3600;
      if (!(seconds > 0)) throw new Error('Unknown interval');
      total += Math.ceil((days * 86400) / seconds);
    } else if (schedule.type === 'cron') {
      const [minute, hour, day, month, week] = schedule.cron.split(' ');
      if (day !== '*' || month !== '*' || week !== '*')
        throw new Error('Budget audit must be updated for non-daily cron expressions');
      const slots = (field, maximum) => {
        if (field === '*') return maximum;
        if (/^\d+$/.test(field)) return 1;
        const range = /^(\d+)-(\d+)$/.exec(field);
        if (range) return Number(range[2]) - Number(range[1]) + 1;
        throw new Error('Budget audit must be updated for this cron expression');
      };
      total += slots(minute, 60) * slots(hour, 24) * days;
    } else throw new Error('Budget audit must be updated for this schedule type');
  }
  return total;
}

export async function budgetReport() {
  const [original, current] = await Promise.all([scheduleManifest(false), scheduleManifest(true)]);
  // Explicit scenario, not a capacity claim. HTTP handlers also execute their
  // auth query; this counts outgoing checks, not all billed function invocations.
  const seconds = 10 * 8 * 3600 * 22;
  return {
    verifiedPricingDate: '2026-10-25',
    mode: 'offline-source-estimate',
    schedules: {
      original: {
        jobs: Object.keys(original).length,
        monthlyEntries: monthlyScheduleInvocations(original),
      },
      current: {
        jobs: Object.keys(current).length,
        monthlyEntries: monthlyScheduleInvocations(current),
      },
      functions: Object.values(current).map((job) => job.name),
      excludes: 'Nested calls, scheduled follow-ups, mutations and reactive queries',
    },
    idleLocalInspection: {
      scenario: { members: 10, hoursPerDay: 8, days: 22 },
      oldBackendIdentityRequests: (seconds / 2.5) * 2,
      currentBackendIdentityRequests: seconds / (LOCAL_INSPECTION_INTERVAL_MS / 1000),
      excludes:
        'New checkpoints, manual refresh, first load, restore and all other application requests',
      authChecksCached: false,
    },
    provider: {
      core: 'Convex Free (hard resource caps)',
      edge: 'Cloudflare static assets only if needed',
      r2: 'optional; not enabled',
    },
    limits: {
      convexFunctionCallsPerMonth: 1_000_000,
      convexDatabaseBytes: 500_000_000,
      convexDatabaseIoBytesPerMonth: 1_000_000_000,
      convexFileBytes: 1_000_000_000,
      convexEgressBytesPerMonth: 1_000_000_000,
    },
    cloudReady: false,
    remaining: [
      'Remote endpoint/build/CSP/desktop/manager configuration remains loopback-only',
      'Restrict production signup and audit non-cron hosted automation entrypoints',
      'Measure actual native queries, database I/O and retained bytes on the selected free account',
      'Add deployment-wide storage/traffic budgets before claiming ten-person cloud capacity',
      'Public deployment and subscriptions require a separate explicit user request',
    ],
    sources: [
      'https://docs.convex.dev/production/state/limits',
      'https://www.convex.dev/pricing',
      'https://developers.cloudflare.com/pages/functions/pricing/',
      'https://developers.cloudflare.com/r2/pricing/',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(JSON.stringify(await budgetReport(), null, 2));
