import fs from 'node:fs/promises';
import { assertNoLinks, readCheckedFile } from './checked-file';
import { createHash, randomUUID } from 'node:crypto';
import { redact, type ClientEvent } from '../../shared/src/protocol';
import { Store } from './store';
import { defaultRetention, diskBytes } from './retention';

export type CodexMessage = {
  sessionId: string;
  messageId: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
};
// Codex rollout JSONL is the real integration boundary. Only authored user/assistant
// messages are shared; tool arguments, reasoning, environment context and instructions are omitted.
export function parseCodexLog(text: string, expectedRoot: string): CodexMessage[] {
  let sessionId = '',
    cwd = '';
  const messages: CodexMessage[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let row: any;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    if (row.type === 'session_meta') {
      const id = row.payload?.id;
      sessionId = typeof id === 'string' && id.length <= 160 ? id : '';
      cwd = typeof row.payload?.cwd === 'string' ? row.payload.cwd : '';
      continue;
    }
    if (row.type === 'turn_context') {
      // A resumed session can move between projects. Its initial cwd is not
      // evidence that later turns still belong to the configured root.
      cwd = typeof row.payload?.cwd === 'string' ? row.payload.cwd : '';
      continue;
    }
    if (!sessionId || normalize(cwd) !== normalize(expectedRoot)) continue;
    const p = row.payload;
    // response_item is canonical; event_msg mirrors the same text and is not ingested again.
    if (
      row.type !== 'response_item' ||
      p?.type !== 'message' ||
      !['user', 'assistant'].includes(p.role)
    )
      continue;
    if (p.role === 'assistant' && p.channel && !['final', 'commentary'].includes(p.channel))
      continue;
    if (!Array.isArray(p.content)) continue;
    const content = p.content
      .filter(
        (b: any) =>
          b && ['input_text', 'output_text', 'text'].includes(b.type) && typeof b.text === 'string',
      )
      .map((b: { text: string }) => b.text)
      .join('\n')
      .trim();
    if (
      !content ||
      /^\s*<(?:environment_context|instructions|permissions|user_instructions|system_reminder|codex_internal_context)\b/i.test(
        content,
      ) ||
      content.startsWith('# AGENTS.md instructions')
    )
      continue;
    const messageId = createHash('sha256').update(`${sessionId}:${i}:${lines[i]}`).digest('hex');
    messages.push({
      sessionId,
      messageId,
      role: p.role,
      text: redact(content.slice(0, 45000)),
      timestamp: Date.parse(row.timestamp) || Date.now(),
    });
  }
  return messages;
}
function normalize(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/\/$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
export async function collectCodex(file: string, root: string, workspaceId: string, store: Store) {
  await assertNoLinks(file);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error('Codex log must be an explicitly selected regular file');
  if (stat.size > 32 * 1024 * 1024) throw new Error('Codex log exceeds the 32 MiB prototype limit');
  const identity = { file, size: stat.size, mtime: stat.mtimeMs, ino: stat.ino };
  if (JSON.stringify(store.setting('codexSourceVersion', null)) === JSON.stringify(identity))
    return 0;
  const policy = store.setting('retention', defaultRetention);
  if ((await diskBytes(store.directory)) + stat.size * 2 + 65536 > policy.maxDiskMiB * 1024 * 1024)
    throw new Error('Storage quota reached; new Agent messages were not captured');
  const messages = parseCodexLog(
    (await readCheckedFile(file, 32 * 1024 * 1024)).bytes.toString('utf8'),
    root,
  );
  let added = 0;
  for (const message of messages) {
    const event: ClientEvent = {
      version: 1,
      id: randomUUID(),
      workspaceId,
      occurredAt: message.timestamp,
      kind: 'agent.message',
      payload: {
        adapter: 'codex',
        sessionId: message.sessionId,
        messageId: message.messageId,
        role: message.role,
        text: message.text,
        checkpointId: store.latest()?.id ?? null,
        association: 'observed-nearby',
      },
    };
    if (store.agentEvent(event, message.messageId)) added++;
  }
  store.set('codexSourceVersion', identity);
  return added;
}

export async function inspectCodexSource(file: string, root: string) {
  await assertNoLinks(file);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024)
    throw new Error('Select a regular Codex JSONL file smaller than 32 MiB');
  const text = (await readCheckedFile(file, 32 * 1024 * 1024)).bytes.toString('utf8'),
    messages = parseCodexLog(text, root);
  if (!messages.length)
    throw new Error('This log contains no authored messages for the configured project directory');
  return {
    file,
    messages,
    summary: {
      sessions: [...new Set(messages.map((m) => m.sessionId))],
      userMessages: messages.filter((m) => m.role === 'user').length,
      assistantMessages: messages.filter((m) => m.role === 'assistant').length,
      bytes: stat.size,
    },
  };
}
