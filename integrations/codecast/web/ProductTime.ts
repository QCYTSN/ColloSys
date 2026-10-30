// Same en-US/local-time presentation as pinned shared/time and timeline/Rail.
// Reuse ICU formatters instead of rebuilding them for every row on every click.
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const yearDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const fullDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
function format(formatter: Intl.DateTimeFormat, date: Date) {
  return Number.isNaN(date.getTime()) ? 'Invalid Date' : formatter.format(date);
}
export function formatShortDate(ts: number, now = Date.now()): string {
  const date = new Date(ts);
  return format(date.getFullYear() === new Date(now).getFullYear() ? shortDate : yearDate, date);
}
export function formatDateFull(ts: number): string {
  return format(fullDate, new Date(ts));
}
export function formatClockTime(ts: number): string {
  return format(clock, new Date(ts));
}
