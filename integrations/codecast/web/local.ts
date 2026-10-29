// Only a launcher-issued browser pairing can reach the local file manager.
const manager = 'http://127.0.0.1:3411';
export const LOCAL_INSPECTION_INTERVAL_MS = 30_000;
export async function chooseDirectory(token: string | null | undefined) {
  const desktop = window.__COLLOSYS_DESKTOP__;
  return desktop?.call
    ? desktop.call('chooseDirectory')
    : localRequest<{ path: string | null }>(token, '/api/roots/choose', {});
}
export function rememberPairing() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const pair = fragment.get('pair');
  if (pair && /^[a-f0-9]{64}$/.test(pair)) {
    sessionStorage.setItem('collo.pair', pair);
    history.replaceState(null, '', location.pathname + location.search);
  }
}
export function isPaired() {
  rememberPairing();
  return !!sessionStorage.getItem('collo.pair');
}
export async function localRequest<T = unknown>(
  token: string | null | undefined,
  route: string,
  body?: unknown,
  endpoint = manager,
): Promise<T> {
  if (!token) throw new Error('Sign in to manage your local directory.');
  rememberPairing();
  const response = await fetch(endpoint + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(endpoint === manager
        ? { 'X-ColloSys-Pairing': sessionStorage.getItem('collo.pair') || '' }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(125000),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Local request failed'), {data:{status:response.status}});
  return data;
}
