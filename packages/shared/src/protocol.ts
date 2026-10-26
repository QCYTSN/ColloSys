import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;
export const MAX_EVENT_BYTES = 512 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const idSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const relativePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !p.includes('\\') &&
      !p.includes(':') &&
      !/[\x00-\x1f\x7f]/.test(p) &&
      p.split('/').every((s) => s !== '.' && s !== '..' && !!s),
    'Expected a project-relative file path',
  );
export const fileChangeSchema = z
  .object({
    path: relativePathSchema,
    status: z.enum(['added', 'modified', 'deleted', 'excluded']),
    binary: z.boolean(),
    beforeHash: z.string().max(64).nullable(),
    afterHash: z.string().max(64).nullable(),
    size: z.number().int().nonnegative(),
    patch: z.string().max(48000),
    truncated: z.boolean(),
  })
  .strict();
export const checkpointPayloadSchema = z
  .object({
    checkpointId: idSchema,
    parentId: idSchema.nullable(),
    label: z.string().max(160),
    files: z.array(fileChangeSchema).max(200),
    totalFiles: z.number().int().nonnegative(),
    part: z.number().int().min(1),
    parts: z.number().int().min(1),
    source: z.literal('local'),
    backup: z.literal('local-only'),
  })
  .strict();
export const agentPayloadSchema = z
  .object({
    adapter: z.literal('codex'),
    sessionId: z.string().min(1).max(160),
    messageId: idSchema,
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1).max(48000),
    checkpointId: idSchema.nullable(),
    association: z.literal('observed-nearby'),
  })
  .strict();
const common = {
  version: z.literal(PROTOCOL_VERSION),
  id: idSchema,
  workspaceId: idSchema,
  occurredAt: z.number().int().positive(),
};
export const eventSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('checkpoint'), payload: checkpointPayloadSchema }).strict(),
  z.object({ ...common, kind: z.literal('agent.message'), payload: agentPayloadSchema }).strict(),
]);
export type ClientEvent = z.infer<typeof eventSchema>;
export type FileChange = z.infer<typeof fileChangeSchema>;
export type StoredEvent = ClientEvent & {
  seq: number;
  actor: { id: string; name: string };
  receivedAt: number;
};
export type Member = { id: string; name: string; role: string };
export type Workspace = {
  id: string;
  project_id: string;
  user_id: string;
  label: string;
  updated_at: number;
};
export type EventPage = { events: StoredEvent[]; cursor: number; hasMore: boolean };
export type Checkpoint = {
  integrity?: 'verified' | 'invalid';
  integrityError?: string;
  id: string;
  parentId: string | null;
  sha: string;
  createdAt: number;
  label: string;
  fileCount: number;
  eventCount: number;
  source: string;
};

export function redact(text: string): string {
  return text
    .replace(
      /((?:["']?)(?:api[_-]?key|access[_-]?token|secret|password)["']?\s*[=:]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi,
      '$1"[REDACTED]"',
    )
    .replace(
      /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g,
      '[REDACTED]',
    )
    .replace(
      /((?:api[_-]?key|access[_-]?token|secret|password)["']?\s*[=:]\s*["']?)[^\s"',;]+/gi,
      '$1[REDACTED]',
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{16,}/gi, 'Bearer [REDACTED]');
}

export function sensitivePath(p: string): boolean {
  const parts = p.toLowerCase().split('/');
  return (
    parts.some((part) =>
      [
        '.git',
        '.ssh',
        '.aws',
        '.azure',
        '.gnupg',
        '.codex',
        '.claude',
        '.collosys',
        '.npmrc',
        '.pypirc',
        '.netrc',
        '.git-credentials',
        'node_modules',
        '.local',
        '.wrangler',
        '.next',
        'dist',
        'build',
        'coverage',
        '__pycache__',
        '.venv',
        'venv',
      ].includes(part),
    ) ||
    parts.some((part) => /\.collosys-[a-f0-9-]+\.tmp$/.test(part)) ||
    parts.some(
      (part) =>
        part === '.env' ||
        part.startsWith('.env.') ||
        /\.(pem|key|p12|pfx|keystore)$/.test(part) ||
        /^(id_rsa|id_ed25519|credentials(?:\..*)?|secrets?(?:\..*)?)$/.test(part),
    )
  );
}
