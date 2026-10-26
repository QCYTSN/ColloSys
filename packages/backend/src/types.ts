import type { ProjectRoom } from './index';
export interface Env {
  DB: D1Database;
  PROJECTS: DurableObjectNamespace<ProjectRoom>;
  BACKUPS: R2Bucket;
  ASSETS?: Fetcher;
  AUTH_MODE: string;
  AUTH_PEPPER?: string;
  BACKUP_LOCATION?: string;
}
export type Actor = { id: string; name: string; tokenHash: string; expiresAt: number };
