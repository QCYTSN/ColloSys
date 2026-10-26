import { useEffect, useRef, useState } from 'react';
import { eventSchema, type StoredEvent, type EventPage } from '../../shared/src/protocol';
export type Auth = { token: string; user: { id: string; name: string } };
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  route: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(route, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(8000),
  });
  const data = (await response.json()) as any;
  if (!response.ok) {
    if (
      response.status === 401 &&
      data.code === 'SESSION_INVALID' &&
      route.startsWith('/api/') &&
      token
    )
      window.dispatchEvent(new CustomEvent('collosys:session-expired', { detail: token }));
    throw new ApiError(response.status, data.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}
export const post = (route: string, token: string, data: unknown) =>
  api(route, token, { method: 'POST', body: JSON.stringify(data) });
export const managerApi = (route: string, token: string, data?: unknown) =>
  api(`http://127.0.0.1:8790/api/${route}`, token, {
    method: data ? 'POST' : 'GET',
    headers: { 'X-ColloSys-Pairing': sessionStorage.getItem('collosys.pairing') ?? '' },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(125000),
  });
export function useProjectFeed(project: string | undefined, auth: Auth | null) {
  const [events, setEvents] = useState<StoredEvent[]>([]),
    [connection, setConnection] = useState('connecting'),
    [online, setOnline] = useState<string[]>([]),
    [error, setError] = useState<string | null>(null);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (!project || !auth) {
      setEvents([]);
      setOnline([]);
      setError(null);
      refresh.current = () => {};
      return;
    }
    let ended = false,
      socket: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout> | undefined,
      busy = false,
      again = false,
      cursor = 0,
      denied = false;
    let records: StoredEvent[] = [];
    const key = `collosys:v1:${auth.user.id}:${project}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (
        Array.isArray(saved?.events) &&
        saved.events.length <= 5000 &&
        Number.isSafeInteger(saved.cursor) &&
        saved.cursor >= 0
      ) {
        records = saved.events.map((value: StoredEvent) => {
          const { actor, seq, receivedAt, ...client } = value;
          if (
            !actor ||
            typeof actor.id !== 'string' ||
            typeof actor.name !== 'string' ||
            !Number.isSafeInteger(seq) ||
            seq < 1 ||
            seq > saved.cursor ||
            !Number.isFinite(receivedAt)
          )
            throw new Error('Invalid cached event');
          return { ...eventSchema.parse(client), actor, seq, receivedAt };
        });
        cursor = saved.cursor;
      }
    } catch {}
    setEvents(records);
    setConnection('connecting');
    setError(null);
    function failure(error: unknown) {
      if (ended) return;
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        denied = true;
        records = [];
        cursor = 0;
        setEvents([]);
        setOnline([]);
        setConnection('denied');
        try {
          localStorage.removeItem(key);
        } catch {}
        if (retry) clearTimeout(retry);
        socket?.close();
      }
      setError(error instanceof Error ? error.message : String(error));
    }
    async function catchUp() {
      if (ended || denied) return;
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        do {
          again = false;
          let more = true;
          while (more && !ended && !denied) {
            const page = await api<EventPage>(
              `/api/projects/${project}/events?after=${cursor}`,
              auth!.token,
            );
            if (ended || denied) return;
            const ids = new Set(records.map((e) => e.id));
            records = [...records, ...page.events.filter((e) => !ids.has(e.id))]
              .sort((a, b) => a.seq - b.seq)
              .slice(-5000);
            cursor = page.cursor;
            more = page.hasMore;
            setEvents([...records]);
            try {
              localStorage.setItem(key, JSON.stringify({ events: records, cursor }));
            } catch {}
          }
          if (!denied) setError(null);
        } while (again && !ended && !denied);
      } catch (e) {
        failure(e);
      } finally {
        busy = false;
      }
    }
    async function connect() {
      if (ended || denied) return;
      try {
        const { ticket } = await post(`/api/projects/${project}/ticket`, auth!.token, {});
        if (ended || denied) return;
        const url = new URL(`/api/projects/${project}/live`, location.href);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('ticket', ticket);
        socket = new WebSocket(url);
        socket.onopen = () => {
          if (ended || denied) {
            socket?.close();
            return;
          }
          setConnection('live');
          void catchUp();
        };
        socket.onmessage = (e) => {
          if (ended || denied) return;
          try {
            const message = JSON.parse(e.data);
            if (message.type === 'presence') setOnline(message.users);
            if (['events.available', 'ready', 'pong'].includes(message.type)) void catchUp();
          } catch {}
        };
        socket.onclose = () => {
          if (!ended && !denied) {
            setConnection('reconnecting');
            setOnline([]);
            retry = setTimeout(() => void connect(), 2000);
          }
        };
        socket.onerror = () => socket?.close();
      } catch (e) {
        failure(e);
        if (!ended && !denied) {
          setConnection('reconnecting');
          retry = setTimeout(() => void connect(), 3000);
        }
      }
    }
    refresh.current = () => void catchUp();
    void catchUp();
    void connect();
    const poll = setInterval(() => {
      void catchUp();
      if (!denied && socket?.readyState === WebSocket.OPEN) socket.send('ping');
    }, 10000);
    return () => {
      ended = true;
      clearInterval(poll);
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [project, auth?.token]);
  return { events, connection, online, error, refresh: () => refresh.current() };
}
