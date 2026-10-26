import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Checkpoint, ClientEvent } from '../../shared/src/protocol';
import type { Manifest } from './files';

export type LocalCheckpoint = Checkpoint & { manifest: Manifest };
export type Recovery = {
  id: string;
  backupId: string;
  checkpointId: string | null;
  directory: string;
  status: 'extracting' | 'ready';
  createdAt: number;
  expiresAt: number;
  manifest: Record<string, { hash: string; size: number }>;
};
export class Store {
  db: DatabaseSync;
  constructor(public directory: string) {
    fs.mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, 'connector.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS checkpoints(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,event TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,error TEXT);
      CREATE TABLE IF NOT EXISTS delivered(id TEXT PRIMARY KEY,event TEXT NOT NULL,seq INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agent_seen(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS previews(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS recoveries(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS checkpoint_deletions(id TEXT PRIMARY KEY);
    `);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  checkpoint(cp: LocalCheckpoint, events: ClientEvent[]) {
    this.transaction(() => {
      this.db
        .prepare('INSERT INTO checkpoints VALUES(?,?,?)')
        .run(cp.id, cp.createdAt, JSON.stringify(cp));
      for (const e of events) this.enqueue(e);
    });
  }
  enqueue(event: ClientEvent) {
    this.db
      .prepare('INSERT OR IGNORE INTO outbox(id,event) VALUES(?,?)')
      .run(event.id, JSON.stringify(event));
  }
  agentEvent(event: ClientEvent, seenId: string) {
    return this.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM agent_seen WHERE id=?').get(seenId)) return false;
      this.enqueue(event);
      this.db.prepare('INSERT INTO agent_seen VALUES(?)').run(seenId);
      return true;
    });
  }
  latest(): LocalCheckpoint | null {
    const row = this.db
      .prepare('SELECT data FROM checkpoints ORDER BY created_at DESC,rowid DESC LIMIT 1')
      .get() as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  get(id: string): LocalCheckpoint | null {
    const row = this.db.prepare('SELECT data FROM checkpoints WHERE id=?').get(id) as
      { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  list(): Checkpoint[] {
    return (
      this.db
        .prepare('SELECT data FROM checkpoints ORDER BY created_at DESC,rowid DESC LIMIT 200')
        .all() as { data: string }[]
    ).map((r) => {
      const { manifest, ...cp } = JSON.parse(r.data) as LocalCheckpoint;
      return cp;
    });
  }
  pending() {
    return this.db.prepare('SELECT * FROM outbox ORDER BY rowid LIMIT 30').all() as {
      id: string;
      event: string;
      attempts: number;
      next_at: number;
      error: string | null;
    }[];
  }
  acknowledge(id: string, seq: number) {
    this.transaction(() => {
      const row = this.db.prepare('SELECT event FROM outbox WHERE id=?').get(id) as
        { event: string } | undefined;
      if (!row) return;
      this.db.prepare('INSERT OR REPLACE INTO delivered VALUES(?,?,?)').run(id, row.event, seq);
      this.db.prepare('DELETE FROM outbox WHERE id=?').run(id);
    });
  }
  failure(id: string, attempts: number, error: string) {
    this.db
      .prepare('UPDATE outbox SET attempts=?,next_at=?,error=? WHERE id=?')
      .run(
        attempts,
        Date.now() + Math.min(30000, 1000 * 2 ** Math.min(attempts, 5)),
        error.slice(0, 200),
        id,
      );
  }
  retryNow() {
    this.db.prepare('UPDATE outbox SET next_at=0').run();
  }
  count() {
    return (this.db.prepare('SELECT COUNT(*) n FROM outbox').get() as { n: number }).n;
  }
  setting<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as
      { value: string } | undefined;
    return row ? JSON.parse(row.value) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        'INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value));
  }
  savePreview(id: string, value: unknown) {
    this.db.prepare('INSERT INTO previews VALUES(?,?)').run(id, JSON.stringify(value));
  }
  preview<T>(id: string): T | null {
    const row = this.db.prepare('SELECT data FROM previews WHERE id=?').get(id) as
      { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  consumePreview(id: string) {
    const preview = this.preview<Record<string, unknown>>(id);
    if (preview)
      this.db
        .prepare('UPDATE previews SET data=? WHERE id=?')
        .run(JSON.stringify({ ...preview, expiresAt: 0 }), id);
  }
  saveRecovery(recovery: Recovery) {
    this.db
      .prepare(
        'INSERT INTO recoveries VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(recovery.id, JSON.stringify(recovery));
  }
  recovery(id: string): Recovery | null {
    const row = this.db.prepare('SELECT data FROM recoveries WHERE id=?').get(id) as
      { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  recoveries(): Recovery[] {
    return (this.db.prepare('SELECT data FROM recoveries').all() as { data: string }[]).map((row) =>
      JSON.parse(row.data),
    );
  }
  close() {
    this.db.close();
  }
}
