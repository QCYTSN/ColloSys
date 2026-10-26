import { MAX_EVENT_BYTES } from '../../shared/src/protocol';
export const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
export function loopback(host: string) {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(host);
}
export async function body(req: Request, limit = MAX_EVENT_BYTES): Promise<unknown> {
  if (Number(req.headers.get('Content-Length') ?? 0) > limit)
    throw new HttpError(413, 'Message is too large');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'JSON body is required');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, 'Message is too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
