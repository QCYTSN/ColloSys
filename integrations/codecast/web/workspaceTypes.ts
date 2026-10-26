import type { Checkpoint, FileChange } from './protocol';

export type LocalDirectory = {
  workspaceId: string;
  projectId: string;
  label: string;
  root: string;
  url: string;
  running: boolean;
};
export type DirectoryStatus = {
  pending: number;
  offline: boolean;
  deliveryState: 'ready' | 'retrying' | 'reauth-required' | 'access-denied' | 'paused';
  deliveryError?: string | null;
  error?: string | null;
  agent: { adapter: string | null; source: string | null; error: string | null };
};
export type RestorePreview = {
  id: string;
  checkpointId: string;
  directory: string;
  expiresAt: number;
  files: FileChange[];
};
export type AgentPreview = {
  userMessages: number;
  assistantMessages: number;
  sessions: string[];
  bytes: number;
};
export type LocalHistory = { checkpoints: Checkpoint[] };
