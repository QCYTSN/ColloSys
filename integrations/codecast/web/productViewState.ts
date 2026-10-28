import { useInboxStore } from '../store/inboxStore';
import { authPrincipal } from '../lib/authPrincipal';
// Ephemeral presentation hints in the existing store. No messages, permissions,
// project records or authorization decisions are persisted here.
export function viewKey(project: string, object: string) {
  return `${authPrincipal.epoch()}:${project}:${object}`;
}
export function readView<T>(key: string): T | undefined {
  return useInboxStore.getState().colloViewState[key] as T | undefined;
}
export function writeView<T>(key: string, value: T) {
  if (!key.startsWith(`${authPrincipal.epoch()}:`)) return;
  useInboxStore.setState((s) => {
    const entries = Object.entries(s.colloViewState)
      .filter(([k]) => k !== key && k.startsWith(`${authPrincipal.epoch()}:`))
      .slice(-79);
    return { colloViewState: { ...Object.fromEntries(entries), [key]: value } };
  });
}
export function clearProjectViews(project: string) {
  useInboxStore.setState((s) => ({
    colloViewState: Object.fromEntries(
      Object.entries(s.colloViewState).filter(
        ([k]) => !k.startsWith(`${authPrincipal.epoch()}:${project}:`),
      ),
    ),
  }));
}
