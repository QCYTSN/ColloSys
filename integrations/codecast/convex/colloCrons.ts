import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

// Only maintenance needed by the internal collaboration product is registered.
// Original hosted-agent, model, email and external polling schedules remain in
// the pinned source; enabling them needs a separate feature and budget review.
export const collaborationCrons = cronJobs();
collaborationCrons.interval('expire desktop sign-in requests', { minutes: 15 }, (internal as any).colloAuthRelay.sweep, {});
collaborationCrons.interval(
  'recover pending sync delivery',
  { minutes: 1 },
  (internal as any).syncOutbox.recover,
  {},
);
collaborationCrons.interval(
  'prune conversation events',
  { hours: 6 },
  (internal as any).conversationEvents.prune,
  {},
);
collaborationCrons.interval(
  'prune resolved pending_permissions',
  { hours: 1 },
  internal.permissions.prunePendingPermissions,
);
collaborationCrons.interval(
  'prune expired ip_rate_limits windows',
  { hours: 1 },
  internal.ipRateLimit.pruneIpRateLimits,
);
// This function scans a rolling two-hour band, so keep its hourly cadence.
collaborationCrons.interval(
  'gc abandoned empty conversations',
  { hours: 1 },
  internal.cleanup.gcEmptyConversations,
  {},
);
collaborationCrons.interval(
  'sweep expired cli auth relays',
  { minutes: 15 },
  internal.cliAuth.sweepExpired,
  {},
);
// Preserve the upstream's retention window and backup exclusion hours.
collaborationCrons.cron(
  'prune sync log actions',
  '45 2-22 * * *',
  internal.syncLogPrune.pruneSyncActions,
  {},
);
collaborationCrons.interval(
  'collect orphaned ColloSys backup bytes',
  { hours: 1 },
  (internal as any).colloBackups.collectOrphans,
  {},
);

export default collaborationCrons;
