import fs from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Env } from '../packages/backend/src/types';
export function sqliteEnv() {
  const db = new DatabaseSync(':memory:');
  const migrate = (name: string) => db.exec(fs.readFileSync('packages/backend/' + name, 'utf8'));
  migrate('migrations/0001.sql');
  migrate('migrations/0002.sql');
  migrate('seed-demo.sql');
  class Statement {
    values: SQLInputValue[] = [];
    constructor(public sql: string) {}
    bind(...values: SQLInputValue[]) {
      this.values = values;
      return this;
    }
    async first() {
      return db.prepare(this.sql).get(...this.values) ?? null;
    }
    async all() {
      return { results: db.prepare(this.sql).all(...this.values) };
    }
    async run() {
      return { meta: { changes: Number(db.prepare(this.sql).run(...this.values).changes) } };
    }
  }
  const env = {
    DB: {
      prepare: (sql: string) => new Statement(sql),
      batch: async (statements: Statement[]) => {
        db.exec('BEGIN');
        try {
          const result = [];
          for (const statement of statements) result.push(await statement.run());
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
  } as unknown as Env;
  return { db, migrate, env };
}
