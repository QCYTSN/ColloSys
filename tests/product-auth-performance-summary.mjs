// Summarize the declared after-only presentation/typing observations separately
// from paired EventTiming. Missing browser entries are not treated as zero.
import fs from 'node:fs/promises';
const root = 'docs/product-ui/auth-completion/evidence';
const read = async (file) => JSON.parse(await fs.readFile(`${root}/${file}`, 'utf8'));
const fields = [
  'feedbackOpportunity',
  'operableOpportunity',
  'contentStableOpportunity',
  'animationSettled',
];
const stats = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const p = (fraction) => (sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null);
  return { n: sorted.length, p50: p(0.5), p95: p(0.95), max: p(1) };
};
const grouped = (rows, field) =>
  Object.fromEntries(
    [...new Set(rows.map((r) => r[field]))].map((name) => {
      const group = rows.filter((r) => r[field] === name);
      return [
        name,
        {
          samples: group.length,
          ...Object.fromEntries(fields.map((key) => [key, stats(group.map((r) => r[key]))])),
          incomplete: group.filter((r) => fields.some((key) => !Number.isFinite(r[key]))).length,
        },
      ];
    }),
  );
const presentation = [],
  typing = [],
  providers = [],
  builds = new Set();
for (let round = 1; round <= 3; round++) {
  const heavy = await read(`presentation/after/production/flows/round-${round}/performance.json`);
  builds.add(heavy.environment.build.fingerprint);
  const seen = new Set();
  for (const page of heavy.samples)
    for (const action of page.actions) {
      const key = JSON.stringify([page.frames.slice(0, 3), action.start, action.name]);
      if (seen.has(key) || !action.presentation?.input) continue;
      seen.add(key);
      presentation.push({ round, name: action.name, ...action.presentation });
    }
  const typed = await read(`after/auth-round-${round}/typing-performance.json`);
  builds.add(typed.build.fingerprint);
  const m = typed.metrics,
    interactions = new Map();
  for (const event of m.events) {
    if (event.start < m.rangeStart || event.start > m.rangeEnd) continue;
    interactions.set(
      event.interactionId,
      Math.max(event.duration, interactions.get(event.interactionId) ?? 0),
    );
  }
  typing.push({
    round,
    eventTiming: stats([...interactions.values()]),
    frameGap: stats(
      m.frames.filter((f) => f.start >= m.rangeStart && f.start <= m.rangeEnd).map((f) => f.gap),
    ),
  });
  const provider = await read(`after/auth-round-${round}/provider-state-performance.json`);
  builds.add(provider.build.fingerprint);
  for (const phase of provider.metrics.phases) providers.push({ round, ...phase });
}
const result = {
  method:
    'After-only phase observations in three independent processes per scenario, normal motion. Presentation first feedback, enabled controls, unchanged DOM text/geometry over three frames, and finite animations ending are distinct observations. Not hardware presentation or all subscriptions becoming idle. Paired before/after EventTiming remains in performance-comparison.json. Reader fixture65 messages; the fixed navigation sequence requests60 before returning. External provider launch is controlled; relay requests and button input are real.',
  buildFingerprints: [...builds],
  presentation: { summary: grouped(presentation, 'name'), samples: presentation },
  typing,
  providers: { summary: grouped(providers, 'control'), samples: providers },
  passwordControls: await read('after/production/auth-performance.json'),
};
await fs.writeFile(`${root}/presentation-and-auth-summary.json`, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      builds: result.buildFingerprints,
      presentation: result.presentation.summary,
      typing,
      providers: result.providers.summary,
    },
    null,
    2,
  ),
);
