import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { transform } from 'esbuild';
if (!process.argv.includes('--worker')) {
  const checks = [];
  for (const zone of ['UTC', 'Asia/Shanghai', 'America/New_York']) {
    const result = execFileSync(process.execPath, ['tests/product-menu-time-format.mjs', '--worker'], { env: { ...process.env, TZ: zone }, windowsHide: true, encoding: 'utf8' });
    checks.push(JSON.parse(result));
  }
  await fs.writeFile('docs/product-ui/menu-motion/evidence/time-format-equivalence.json', JSON.stringify({ checks, method: 'Owned formatter compared byte-for-byte with the pinned original shared/time and Rail clock across separate timezone processes, years, DST boundaries, epoch and invalid dates.' }, null, 2));
  console.log('Time formatter equivalence passed in three timezones');
} else {
  const module = async file => {
    const { code } = await transform(await fs.readFile(file, 'utf8'), { loader: 'ts', format: 'esm' });
    return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  };
  const actual = await module('integrations/codecast/web/ProductTime.ts');
  const original = await module('third_party/codecast/upstream/packages/shared/time/index.ts');
  const times = [NaN, Infinity, -1, 0];
  for (const year of [2024, 2025, 2026]) for (const month of [1, 2, 3, 9, 10, 11])
    for (const day of [1, 8, 9, 28]) for (const hour of [0, 7, 12, 23]) times.push(Date.UTC(year, month, day, hour, 35));
  const now = Date.UTC(2026, 9, 30, 8);
  for (const time of times) {
    assert.equal(actual.formatShortDate(time, now), original.formatShortDate(time, now));
    assert.equal(actual.formatDateFull(time), original.formatDateFull(time));
    assert.equal(actual.formatClockTime(time), new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  }
  console.log(JSON.stringify({ zone: process.env.TZ, cases: times.length * 3 }));
}
