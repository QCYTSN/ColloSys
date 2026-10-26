import type { StoredEvent, FileChange } from './protocol';

export type ActivitySummary = {
  id: string;
  seq: number;
  workspaceId: string;
  occurredAt: number;
  actor: { id: string; name: string };
  kind: StoredEvent['kind'];
  title: string;
  preview: string;
  checkpointId: string | null;
  sessionId: string | null;
  fileCount: number;
  messageCount?: number;
};
export type HistoryPage = { items: ActivitySummary[]; head: number; next: number | null };
export type MessagePage = { items: StoredEvent[]; older: number | null; newer: number | null };
export type CheckpointFiles = {
  files: Omit<FileChange, 'patch'>[];
  next: string | null;
  receivedParts: number;
  expectedParts: number;
  receivedFiles: number;
  expectedFiles: number;
  complete: boolean;
};
