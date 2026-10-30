// Assert measurements from the real formal-route audit, not CSS declarations.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { buildFingerprint } from '../scripts/codecast-build-inputs.mjs';
const root = 'docs/product-ui/unified/evidence';
const { build, records } = JSON.parse(
  await fs.readFile(root + '/final-audit/runtime.json', 'utf8'),
);
assert.equal(
  build.fingerprint,
  await buildFingerprint(),
  'Runtime measurements must describe the current source',
);
const expected = {
  wordmark: [18, 24, 600],
  art: [36, 42, 450],
  authTitle: [28, 36, 600],
  authInput: [15, 22, 400],
  authButton: [14, 20, 500],
  pageTitle: [24, 32, 600],
  objectTitle: [20, 28, 600],
  taskTitle: [20, 28, 600],
  nav: [14, 20, 500],
  listTitle: [14, 20, 500],
  triggerFace: [13, 18, 500],
  body: [15, 24, 400],
};
for (const [role, spec] of Object.entries(expected)) {
  const found = records.flatMap((r) => (r.roles[role] ? [r.roles[role]] : []));
  assert.ok(found.length, role);
  for (const s of found) {
    assert.deepEqual([parseFloat(s.size), parseFloat(s.line), Number(s.weight)], spec, role);
    if (role !== 'art') assert.match(s.axes, new RegExp(`"opsz" ${spec[0] >= 18 ? 18 : 17}`), role);
  }
}
for (const r of records) {
  assert.equal(r.overflow, false, r.name);
  for (const t of r.text) {
    if (t.disabled || t.gradient) continue;
    assert.ok(t.ratio >= 4.5, `${r.name}: ${t.text} contrast ${t.ratio}`);
    assert.ok(parseFloat(t.size) >= 12, `${r.name}: ${t.text} size ${t.size}`);
  }
  if (r.roles.authInput) assert.equal(r.roles.authInput.height, 44);
  if (r.roles.authButton) assert.equal(r.roles.authButton.height, 44);
  if (r.roles.triggerFace) assert.equal(r.roles.triggerFace.height, 32);
  if (r.roles.display) assert.equal(r.roles.display.width, 320);
  if (r.roles.settings) assert.equal(r.roles.settings.width, 720);
  if (r.roles.body) assert.ok(r.roles.body.width <= 720.1);
}
const rgb = (s) => {
  const m = s.match(/(?:rgb|color)\(([^)]+)\)/);
  assert.ok(m, s);
  const a = m[1].match(/[\d.]+/g).map(Number);
  return m[1].startsWith('srgb') ? a.slice(0, 3).map((v) => v * 255) : a.slice(0, 3);
};
const lum = (c) =>
  c
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const x = lum(rgb(a)),
    y = lum(rgb(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const boundaries = [];
for (const theme of ['light', 'dark']) {
  const input = records.find((r) => r.name === 'login-focus-' + theme).roles.authInput;
  for (const kind of ['border', 'outline']) {
    const ratio = contrast(input[kind], input.background);
    assert.ok(ratio >= 3, `${theme} ${kind}`);
    boundaries.push({
      theme,
      role: 'authInput',
      kind,
      ratio,
      paint: input[kind],
      background: input.background,
    });
  }
  const trigger = records.find((r) => r.name === 'tasks-' + theme).roles.triggerFace;
  const ratio = contrast(trigger.border, trigger.background);
  assert.ok(ratio >= 3);
  boundaries.push({
    theme,
    role: 'triggerFace',
    kind: 'border',
    ratio,
    paint: trigger.border,
    background: trigger.background,
  });
}
const fonts = records.flatMap((r) => Object.values(r.renderedFonts).flat());
for (const name of [/Google/i, /Noto/i, /Newsreader/i])
  assert.ok(
    fonts.some((f) => f.isCustomFont && name.test(f.familyName + ' ' + f.postScriptName)),
    name.toString(),
  );
const diff = JSON.parse(await fs.readFile(root + '/after/screens/diff-continuity.json', 'utf8'));
assert.equal(diff.length, 4);
for (const d of diff) {
  assert.ok(d.code.length);
  for (const c of d.code) {
    assert.equal(c.size, '13px');
    assert.equal(c.line, '20px');
  }
}
await fs.writeFile(
  root + '/parameter-assertions.json',
  JSON.stringify(
    {
      build,
      states: records.length,
      typography: expected,
      boundaries,
      localFonts: ['Google Sans', 'Noto Sans SC', 'Newsreader'],
      diff: '13/20 in the actual Pierre shadow DOM',
      limits:
        'Visible sampled states; disabled and gradient text excluded. No assertion of every arbitrary future state or physical display contrast.',
    },
    null,
    2,
  ),
);
console.log(
  `Actual typography, control geometry, composed text contrast and focus/border contrast passed in ${records.length} states.`,
);
