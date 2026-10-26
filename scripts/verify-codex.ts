import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCodexLog } from '../packages/connector/src/codex';
import { digest } from '../packages/connector/src/files';
// Read-only validation of an explicitly named real Codex log. No content is uploaded.
const [file, root] = process.argv.slice(2);
if (!file || !root)
  throw new Error('Usage: tsx scripts/verify-codex.ts <log.jsonl> <project-root>');
const text = await fs.readFile(file, 'utf8'),
  messages = parseCodexLog(text, path.resolve(root));
if (!messages.length) throw new Error('No user/assistant messages matched this project');
const report = {
  verifiedAt: new Date().toISOString(),
  adapter: 'codex-rollout-jsonl',
  sourceFile: path.resolve(file),
  projectRoot: path.resolve(root),
  sourceDigest: digest(text),
  sessions: [...new Set(messages.map((m) => m.sessionId))],
  userMessages: messages.filter((m) => m.role === 'user').length,
  assistantMessages: messages.filter((m) => m.role === 'assistant').length,
  privateReasoningExcluded: true,
  uploaded: false,
};
await fs.mkdir('.local/verification', { recursive: true });
await fs.writeFile('.local/verification/real-codex-source.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
