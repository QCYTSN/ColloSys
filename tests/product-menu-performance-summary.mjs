import fs from 'node:fs/promises';
const root = process.env.COLLOSYS_MEASUREMENT_ROOT || 'docs/product-ui/menu-motion/evidence';
const pct = (a, p) => (a.length ? [...a].sort((a, b) => a - b)[Math.ceil(a.length * p) - 1] : null);
const stats = (a) => ({
  n: a.length,
  p50: pct(a, 0.5),
  p95: pct(a, 0.95),
  max: a.length ? Math.max(...a) : null,
});
const rows = [];
for (const phase of ['before', 'after'])
  for (const mode of ['production', 'development']) {
    let menus;
    try {
      menus = JSON.parse(await fs.readFile(`${root}/${phase}/${mode}/menus.json`, 'utf8'));
    } catch {
      menus = { results: [] };
    }
    const metrics = menus.results.flatMap((r) => r.metrics.actions),
      menu = {};
    for (const name of ['Active', 'Display', 'Grouping']) {
      const samples = metrics.filter((a) => a.name === name),
        cold = samples.filter((a) => a.cold),
        warm = samples.filter((a) => !a.cold);
      menu[name] = {
        cold: cold.map((a) => ({
          feedbackOpportunity: a.feedbackOpportunity,
          operableOpportunity: a.operableOpportunity,
          stableOpportunity: a.stableOpportunity,
          animationSettled: a.animationSettled,
        })),
        warm: Object.fromEntries(
          [
            'feedbackOpportunity',
            'operableOpportunity',
            'stableOpportunity',
            'animationSettled',
          ].map((k) => [k, stats(warm.map((a) => a[k]).filter(Number.isFinite))]),
        ),
      };
    }
    const heavyRounds = [];
    for (let round = 1; round <= 3; round++) {
      let report;
      try {
        report = JSON.parse(
          await fs.readFile(
            `${root}/${phase}/${mode}/flows/round-${round}/performance.json`,
            'utf8',
          ),
        );
      } catch {
        continue;
      }
      const pages = new Map();
      for (const sample of report.samples) {
        const key = JSON.stringify(sample.frames.slice(0, 3));
        if ((pages.get(key)?.frames.length ?? -1) <= sample.frames.length) pages.set(key, sample);
      }
      const interactions = [],
        longTasks = [],
        byAction = {},
        presentation = {},
        inputEvents = {};
      for (const sample of pages.values()) {
        const events = new Map();
        for (const e of sample.events) {
          const prior = events.get(e.interactionId);
          if (!prior || prior.duration < e.duration) events.set(e.interactionId, e);
        }
        // The older harness discarded pre-login typing on navigation. Keep the
        // newly retained typing sample separate, so it cannot dilute the paired
        // heavy-workspace percentile with many fast keystrokes.
        if (!sample.actions.some((a) => a.name === 'login email input')) {
          interactions.push(...[...events.values()].map((e) => e.duration));
          longTasks.push(...sample.longTasks.map((e) => e.duration));
        }
        for (const a of sample.actions) {
          if (!a.name) continue;
          if (a.presentation) (presentation[a.name] ??= []).push(a.presentation);
          const durations = [...events.values()].filter(e => e.start >= a.start && e.start <= a.feedbackFrame).map(e => e.duration);
          if (durations.length) (inputEvents[a.name] ??= []).push(Math.max(...durations));
          for (const e of events.values())
            if (e.start >= a.start && e.start <= a.feedbackFrame)
              (byAction[a.name] ??= []).push(e.duration);
        }
      }
      heavyRounds.push({
        round,
        interaction: stats(interactions),
        longTasks: { ...stats(longTasks), totalMs: longTasks.reduce((a, b) => a + b, 0) },
        byAction: Object.fromEntries(Object.entries(byAction).map(([k, v]) => [k, stats(v)])),
        presentation,
        inputEvents,
      });
    }
    if (!menus.results.length && !heavyRounds.length) continue;
    const names = [...new Set(heavyRounds.flatMap(r => Object.keys(r.presentation)))];
    const workspace = Object.fromEntries(names.map(name => {
      const samples = heavyRounds.flatMap(r => r.presentation[name] ?? []);
      return [name, {
        n: samples.length,
        ...Object.fromEntries(['feedbackOpportunity', 'operableOpportunity', 'navigationOperable', 'contentStableOpportunity', 'animationSettled'].map(key => [key, stats(samples.map(s => s[key]).filter(Number.isFinite))])),
        eventTiming: stats(heavyRounds.flatMap(r => r.inputEvents[name] ?? [])),
      }];
    }));
    rows.push({ phase, mode, menu, heavyRounds, workspace });
  }
const result = {
  method:
    'Menu latency starts at actual in-page pointerdown and reports browser frame opportunities, not hardware pixels. Cold n=3 separate processes/contexts with OS cache retained; warm n=30 per entry/mode. Heavy flows use maximum EventTiming duration per interactionId per page, durationThreshold=16: faster unreported interactions are absent, never counted as zero. Driver/assertion elapsed is not used. Each round retains raw traces, long tasks and videos; no claim of native 60fps.',
  rows,
};
await fs.writeFile(root + '/performance-comparison.json', JSON.stringify(result, null, 2));
for (const r of rows)
  console.log(
    JSON.stringify({
      phase: r.phase,
      mode: r.mode,
      menu: Object.fromEntries(
        Object.entries(r.menu).map(([k, v]) => [
          k,
          { cold: v.cold.map((s) => s.feedbackOpportunity), warm: v.warm.feedbackOpportunity },
        ]),
      ),
      heavy: r.heavyRounds.map((x) => ({
        round: x.round,
        p95: x.interaction.p95,
        diff: x.byAction['32-file diff first'],
        typing: x.byAction['login email input'],
      })),
    }),
  );
