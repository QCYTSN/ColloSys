import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationDestination,
  fencedAuthCall,
} from '../integrations/codecast/web/productAuthPolicy';
import {
  assertProjectIdentity,
  readProjectIdentity,
  foundationProjectIdentity,
} from '../integrations/codecast/product-contracts';
import { readAppearance } from '../integrations/codecast/web/appearance-runtime.mjs';

test('return destinations reject external, encoded separators, controls and authentication loops', () => {
  for (const value of [
    'https://evil.invalid/',
    '//evil.invalid',
    '/\\evil.invalid',
    '/%2f/evil.invalid',
    '/%5cevil.invalid',
    '/%00/projects',
    '/login?return_to=/projects',
    '/signup',
    '/auth/complete',
    '/reset-password',
    '/%6cogin',
    '/a\nb',
  ])
    assert.equal(applicationDestination(value), '/projects', value);
  assert.equal(
    applicationDestination('/projects/pj-demo?tab=sessions&workspace=test#message-12'),
    '/projects/pj-demo?tab=sessions&workspace=test#message-12',
  );
});
test('a late authentication response cannot pass a logout generation', async () => {
  let generation = 'first';
  let resolve!: (value: string) => void;
  const pending = fencedAuthCall(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
    () => generation,
  );
  generation = 'signed-out';
  resolve('late-session');
  await assert.rejects(pending, /ended/);
  assert.equal(
    await fencedAuthCall(
      async () => 'current-session',
      () => generation,
    ),
    'current-session',
  );
});
test('project metadata migration preserves known legacy values and validates stable choices', () => {
  assert.deepEqual(readProjectIdentity({ icon: 'rocket', color: 'green' }), {
    version: 1,
    icon: 'rocket',
    tone: 'moss',
  });
  const legacy = { icon: 'legacy-unknown', color: '#unknown' };
  assert.deepEqual(readProjectIdentity(legacy), { version: 1, icon: 'folder', tone: 'iris' });
  assert.deepEqual(legacy, { icon: 'legacy-unknown', color: '#unknown' });
  assert.throws(() => assertProjectIdentity({ version: 1, icon: '<svg/>', tone: 'iris' }));
  assert.throws(() => assertProjectIdentity({ version: 2, icon: 'folder', tone: 'iris' }));
  assert.deepEqual(foundationProjectIdentity({ version: 1, icon: 'leaf', tone: 'moss' }), {
    icon: 'leaf',
    color: 'green',
  });
});
test('device preference migration is repeatable, interruption-safe and new-key-first', () => {
  const values = new Map([['codecast-theme', 'dark']]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.deepEqual(readAppearance(storage), { version: 1, mode: 'dark', accent: 'forest' });
  const selected = { version: 1, mode: 'system', accent: 'moss' };
  storage.setItem('collosys.appearance.v1', JSON.stringify(selected));
  values.delete('collosys.migration.appearance.v1');
  assert.deepEqual(readAppearance(storage), selected);
  assert.deepEqual(readAppearance(storage), selected);
  assert.equal(values.get('codecast-theme'), 'dark');
  for (const accent of ['iris', 'clay', 'moss', 'blue']) {
    const prior = { version: 1, mode: 'light', accent };
    storage.setItem('collosys.appearance.v1', JSON.stringify(prior));
    assert.deepEqual(readAppearance(storage), prior, 'Existing accent must not be overwritten');
  }
  const interrupted = {
    getItem: (key: string) => (key === 'codecast-theme' ? 'light' : null),
    setItem: () => {
      throw new Error('disk unavailable');
    },
  };
  assert.deepEqual(readAppearance(interrupted), { version: 1, mode: 'system', accent: 'forest' });
});
