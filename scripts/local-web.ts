import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import { within } from '../packages/connector/src/files';
export async function serveWeb(directory: string, backend: string, port = 5173) {
  const server = http.createServer(async (req, res) => {
    try {
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? '')) {
        res.writeHead(403).end();
        return;
      }
      const origin = req.headers.origin;
      if (origin && !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin)) {
        res.writeHead(403).end();
        return;
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        const headers: Record<string, string> = {};
        for (const name of ['authorization', 'content-type'])
          if (req.headers[name]) headers[name] = String(req.headers[name]);
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 24 * 1024 * 1024) {
            res.writeHead(413).end();
            return;
          }
          chunks.push(chunk);
        }
        const response = await fetch(backend + url.pathname + url.search, {
          method: req.method,
          headers,
          body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks),
          signal: AbortSignal.timeout(60000),
        });
        res.statusCode = response.status;
        for (const name of ['content-type', 'cache-control', 'x-backup-digest'])
          if (response.headers.has(name)) res.setHeader(name, response.headers.get(name)!);
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, ''),
        file = path.resolve(directory, relative || 'index.html');
      if (!within(directory, file)) {
        res.writeHead(403).end();
        return;
      }
      let data: Buffer;
      try {
        data = await fs.readFile(file);
      } catch {
        data = await fs.readFile(path.join(directory, 'index.html'));
      }
      res.setHeader(
        'Content-Type',
        (
          {
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.html': 'text/html',
          } as Record<string, string>
        )[path.extname(file)] ?? 'text/html',
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:*; img-src 'self' data:; frame-ancestors 'none'",
      );
      res.end(data);
    } catch {
      res
        .writeHead(502, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'Local server could not complete the request' }));
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? '') ||
      !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(req.headers.origin ?? '') ||
      !/^\/api\/projects\/[a-zA-Z0-9_-]+\/live\?/.test(req.url ?? '')
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      const target = new WebSocket(backend.replace(/^http/, 'ws') + req.url);
      const queue: WebSocket.RawData[] = [];
      client.on('message', (data) => {
        if (target.readyState === WebSocket.OPEN) target.send(data.toString());
        else if (queue.length < 5) queue.push(data);
        else client.close(1008);
      });
      target.on('open', () => {
        for (const data of queue) target.send(data.toString());
      });
      target.on('message', (data) => {
        if (client.readyState === WebSocket.OPEN) client.send(data.toString());
      });
      target.on('error', () => client.close(1011));
      client.on('error', () => target.close());
      client.on('close', () => target.close());
      target.on('close', () => client.close());
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    stop: async () => {
      for (const client of wss.clients) client.terminate();
      wss.close();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
