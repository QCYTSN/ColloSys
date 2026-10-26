// A provider quota response may be HTML or plain text rather than our JSON.
// Respect Retry-After, and avoid a tight retry loop when a free plan is paused.
export function retryAfterTime(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const until = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(value);
  return Number.isFinite(until) && until > now ? Math.min(until, now + 86400_000) : 0;
}

export function deliveryRetryTime(attempts: number, status?: number, retryAfter = 0): number {
  const now = Date.now();
  const quota = status === 402 || status === 429;
  const denied = status === 401 || status === 403;
  const delay = Math.min(quota ? 3600_000 : 300_000, 1000 * 2 ** Math.min(attempts, 12));
  return Math.max(now + Math.max(delay, quota ? 60_000 : denied ? 300_000 : 0), retryAfter);
}
