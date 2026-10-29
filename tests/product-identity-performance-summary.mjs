import fs from 'node:fs/promises';
const directory = 'docs/product-ui/identity-motion/evidence';
const percentile = (values, fraction) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] : null;
const summarize = values => ({ samples: values.length, p50: percentile(values, .5), p95: percentile(values, .95), max: values.length ? Math.max(...values) : null });
const results = [];
for (const phase of ['before', 'after']) for (const mode of ['production', 'development']) {
  let report; try { report = JSON.parse(await fs.readFile(`${directory}/${phase}/${mode}/performance.json`, 'utf8')); } catch { continue; }
  const pages = new Map();
  for (const sample of report.samples) { const key = JSON.stringify(sample.frames.slice(0, 3)); if ((pages.get(key)?.frames.length ?? -1) <= sample.frames.length) pages.set(key, sample); }
  const interactions = [], longTasks = [], frames = [], actions = {}, actionEvents = {};
  for (const sample of pages.values()) {
    const events = new Map();
    for (const event of sample.events) { const prior = events.get(event.interactionId); if (!prior || prior.duration < event.duration) events.set(event.interactionId, event); }
    interactions.push(...[...events.values()].map(e => e.duration)); longTasks.push(...sample.longTasks.map(e => e.duration)); frames.push(...sample.frames.map(e => e.gap).filter(n => n > 0));
    for (const action of sample.actions) {
      if (!action.name) continue;
      (actions[action.name] ??= []).push(action.elapsed);
      for (const e of events.values()) if (e.start >= action.start && e.start <= action.feedbackFrame) (actionEvents[action.name] ??= []).push(e.duration);
    }
  }
  results.push({ phase, mode, pages: pages.size, observedInteractionMs: summarize(interactions), longTasks: { ...summarize(longTasks), totalMs: longTasks.reduce((a, b) => a + b, 0) }, frameGapMs: summarize(frames), byActionObservedEventMs: Object.fromEntries(Object.entries(actionEvents).map(([k, v]) => [k, summarize(v)])), automationElapsedMs: Object.fromEntries(Object.entries(actions).map(([k, v]) => [k, summarize(v)])), checks: report.checks.length });
}
const report = { method: 'Deduplicate cumulative snapshots by page frame prefix, then take maximum EventTiming duration per interactionId per page. EventTiming durationThreshold=16; unreported faster events are not counted as zero. Automation elapsed includes locator waits, round trips and two rAF, and sidebar includes 240 ms wait. These are separate from EventTiming. Headless Chrome frame gaps are not proof of native display 60 FPS. One before/after run per mode is diagnostic, not a statistically controlled benchmark.', results };
await fs.writeFile(`${directory}/performance-comparison.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
