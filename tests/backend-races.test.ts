import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { accounts, changePassword } from '../packages/backend/src/accounts';
import { hash } from '../packages/backend/src/http';
import type { Env } from '../packages/backend/src/types';

test('password change prevents a previously started old-password login from issuing a new session', async () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001.sql', '0002.sql'])
    db.exec(fs.readFileSync(`packages/backend/migrations/${file}`, 'utf8'));
  let pause = false,
    observed!: () => void,
    release!: () => void;
  const selected = new Promise<void>((r) => (observed = r)),
    gate = new Promise<void>((r) => (release = r));
  class Statement {
    values: SQLInputValue[] = [];
    constructor(public sql: string) {}
    bind(...values: SQLInputValue[]) {
      this.values = values;
      return this;
    }
    async first() {
      const row = db.prepare(this.sql).get(...this.values) ?? null;
      if (pause && this.sql.startsWith('SELECT c.*,u.name')) {
        pause = false;
        observed();
        await gate;
      }
      return row;
    }
    async run() {
      return { meta: { changes: Number(db.prepare(this.sql).run(...this.values).changes) } };
    }
  }
  const env = {
    AUTH_MODE: 'production',
    AUTH_PEPPER: 'TEST_ONLY_PEPPER_'.repeat(4),
    DB: {
      prepare: (sql: string) => new Statement(sql),
      batch: async (statements: Statement[]) => {
        db.exec('BEGIN');
        try {
          const result = [];
          for (const s of statements) result.push(await s.run());
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
  } as unknown as Env;
  const request = (route: string, data: unknown) =>
    new Request('http://127.0.0.1' + route, { method: 'POST', body: JSON.stringify(data) });
  const password = 'TEST-only-original-password';
  try {
    const registered = (await (await accounts(
      request('/api/auth/register', { username: 'race_fixture', password }),
      env,
    ))!.json()) as { token: string; user: { id: string; name: string }; expiresAt: number };
    pause = true;
    const pending = accounts(
      request('/api/auth/login', { username: 'race_fixture', password }),
      env,
    );
    await selected;
    const changed = await changePassword(
      request('/api/auth/password', { currentPassword: password, password: password + '-new' }),
      env,
      {
        ...registered.user,
        tokenHash: await hash(registered.token),
        expiresAt: registered.expiresAt,
      },
    );
    assert.equal(changed.status, 200);
    const rejected = assert.rejects(pending, /Credentials changed/);
    release();
    await rejected;
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get()!.n, 0);
    assert.equal(
      (await accounts(
        request('/api/auth/login', { username: 'race_fixture', password: password + '-new' }),
        env,
      ))!.status,
      200,
    );
  } finally {
    release();
    db.close();
  }
});
