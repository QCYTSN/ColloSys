import assert from 'node:assert/strict';
import { eventSchema } from '../packages/shared/src/protocol.ts';
import { scenario, files } from '../integrations/codecast/web/ContextScenario.ts';
import {
  presentation,
  canPreview,
  changeCounts,
} from '../.local/codecast-app/source/packages/web/collo/ContextModel.ts';
import { parsePatch } from 'diff';
import { TASK_STATUS_CATEGORIES } from '../.local/codecast-app/source/packages/shared/tasks/statuses.ts';
for (const dense of [false, true]) {
  const activities = scenario(dense);
  assert.equal(activities.length, dense ? 100 : 9);
  for (const activity of activities) {
    assert.ok(eventSchema.safeParse(activity.event).success, activity.id);
    assert.equal(activity.workspace.id, activity.event.workspaceId);
    if (!activity.task) assert.equal(presentation(activity).progress, '未提供任务进展');
    else assert.ok(TASK_STATUS_CATEGORIES.includes(activity.task.status));
    if (!activity.workspace.own) assert.equal(canPreview(activity), false);
  }
  const offline = activities[3];
  assert.equal(presentation(offline).progress, '任务已完成');
  assert.match(presentation(offline).delivery, /待同步 3/);
  assert.equal(presentation(offline).attribution, '未关联 Agent 会话');
  assert.equal(presentation(offline).backup, '无异机备份证据');
  assert.equal(canPreview(activities[4]), false);
  assert.equal(presentation(activities[0], 'other').action, null);
  assert.match(presentation(activities[0]).attribution, /因果未证实/);
}
for (const file of files.filter((f) => !f.binary && f.status !== 'excluded')) {
  const parsed = parsePatch(file.patch, { strict: true });
  assert.equal(parsed.length, 1);
  const lines = parsed.flatMap((p) => p.hunks.flatMap((h) => h.lines));
  const count = changeCounts([file]);
  assert.equal(count.added, lines.filter((l) => l.startsWith('+')).length);
  assert.equal(count.removed, lines.filter((l) => l.startsWith('-')).length);
  // A one-line replacement legitimately has no unchanged context. The two
  // multi-line review fixtures must retain it rather than redraw entire files.
  if ([files[0].path, files[3].path].includes(file.path))
    assert.ok(
      lines.some((l) => l.startsWith(' ')),
      'review fixtures retain context',
    );
}
assert.deepEqual(changeCounts(files.filter((f) => f.binary || f.status === 'excluded')), {
  added: 0,
  removed: 0,
});
assert.ok(parsePatch(files[3].patch)[0].hunks.flatMap((h) => h.lines).length > 100);
assert.ok(files.some((f) => f.status === 'deleted') && files.some((f) => f.status === 'added'));
console.log(
  'PASS protocol-shaped fixtures, independent state combinations, restore ownership, real patch contexts/counts and long diff',
);
