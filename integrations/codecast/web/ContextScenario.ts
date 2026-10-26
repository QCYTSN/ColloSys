import { createTwoFilesPatch } from 'diff';
import type { ClientEvent, FileChange } from './protocol';
import type { Activity, SourceMessage } from './ContextModel';

// Reproducible, non-production fixtures. No real directories or model calls.
export const members = [
  '你',
  '林舟',
  '陈一',
  '周宁',
  '许言',
  '沈星',
  '孟雨',
  '方禾',
  '陆川',
  '苏白',
].map((name, i) => ({ id: i === 0 ? 'me' : `member-${i}`, name }));
const time = Date.parse('2026-10-26T10:18:00+08:00');
const before = [
  "import type { FileChange, CapturedSession } from './types';",
  '',
  '// 同步只传递活动，不应用其他成员的文件。',
  'export function describeChange(change: FileChange, session?: CapturedSession) {',
  '  const source = session?.adapter;',
  '  return {',
  '    path: change.path,',
  '    source,',
  '    checkpointId: change.checkpointId,',
  '    canRestore: true,',
  '  };',
  '}',
  '',
  'export function sharedLabel(received: boolean) {',
  "  return received ? '已备份' : '等待同步';",
  '}',
  '',
  'export const protocolVersion = 1;',
  '',
].join('\n');
const after = before
  .replace(
    '  const source = session?.adapter;',
    "  // 日志来源已知，不等于这条文件变化由 Agent 造成。\n  const source = session ? 'observed-nearby' : 'unknown';",
  )
  .replace('    canRestore: true,', '    canRestore: change.own && change.localComplete,')
  .replace("received ? '已备份' : '等待同步'", "received ? '服务已确认' : '等待同步'");
const longBefore =
  'export const recoveryRules = [\n' +
  Array.from(
    { length: 140 },
    (_, i) => `  { name: 'rule-${i + 1}', scope: 'project', limit: 10 },`,
  ).join('\n') +
  '\n];\n';
const longAfter = longBefore
  .split('\n')
  .map((line, i) => (i % 7 === 1 ? line.replace('limit: 10', 'limit: 20') : line))
  .join('\n');
function file(
  path: string,
  old: string,
  next: string,
  extra: Partial<FileChange> = {},
): FileChange {
  return {
    path,
    status: old ? (next ? 'modified' : 'deleted') : 'added',
    binary: false,
    beforeHash: old ? 'fixture-before' : null,
    afterHash: next ? 'fixture-after' : null,
    size: new TextEncoder().encode(next).length,
    patch: createTwoFilesPatch(path, path, old, next, '', '', { context: 3 }),
    truncated: false,
    ...extra,
  };
}
export const files: FileChange[] = [
  file('packages/connector/src/capture/describeChange.ts', before, after),
  file(
    'packages/web/src/capture/describeChange.ts',
    "export const label = '已备份';\nexport const owner = 'workspace';\n",
    "export const label = '服务已确认';\nexport const owner = 'workspace';\n",
  ),
  file(
    'tests/capture/describeChange.test.ts',
    "it('captures saved edits', () => {\n  expect(change.path).toBeDefined();\n});\n",
    "it('captures saved edits', () => {\n  expect(change.path).toBeDefined();\n  expect(change.source).toBe('unknown');\n  expect(change.canRestore).toBe(false);\n});\n",
  ),
  file(
    'packages/connector/src/history/recovery/preview/validateCheckpointCompletenessAndOwnership.ts',
    longBefore,
    longAfter,
  ),
  file('docs/restore-old.md', '# Restore\nAlways preview before restoring.\n', ''),
  file(
    'docs/recovery/restore.md',
    '',
    '# 恢复本机目录\n\n先预览、备份当前状态，再明确确认。\n\n路径调整按删除与新增捕获，不推断重命名。\n',
  ),
  file('assets/recovery-flow.png', '', '', {
    status: 'modified',
    binary: true,
    size: 19382,
    patch: '',
  }),
  file(
    'fixtures/large-history.json',
    '[\n  {"seq": 1}\n]\n',
    '[\n  {"seq": 1},\n  {"seq": 2}\n]\n',
    { truncated: true, size: 380000 },
  ),
  file('fixtures/private-source.txt', '', '', { status: 'excluded', patch: '', size: 0 }),
  ...Array.from({ length: 5 }, (_, i) =>
    file(
      `packages/shared/src/validation/rule-${i + 1}.ts`,
      `export const limit = ${10 + i};\n`,
      `export const limit = ${20 + i};\n`,
    ),
  ),
];
const discussion = [
  [
    'user',
    '这次只调整来源表达和恢复入口。手动保存的文件必须独立显示，不能因为附近有一段 Codex 日志就归给 Agent。请先看现有契约，再检查测试。',
  ],
  [
    'assistant',
    '先确认三个独立事实：\n\n- 谁的目录发生了变化，由服务端身份与 workspace 关系确定。\n- 日志来自哪个捕获会话，由 source session 和 message ID 确定。\n- 哪条消息造成了这次改动，当前协议**没有这个证据**。\n\n所以我会保留 `observed-nearby`，不把它呈现成“由 Codex 修改”。',
  ],
  [
    'user',
    '如果文件已经保存，但连接程序离线了，界面应该怎么说？另外，本机 Convex 里的副本不能算异地备份。',
  ],
  [
    'assistant',
    '将本地保存、服务确认、异机备份分别显示。任务完成不会改变交付状态。比如“任务已完成”与“本机待同步 3 条”可以同时存在。\n\n```ts\nconst delivery = receipt ? "acknowledged" : "pending";\nconst attribution = sourceEvidence ?? "unknown";\n// backup.remote 必须由服务端事实提供\n```',
  ],
  [
    'assistant',
    '原始消息中引用的检查输出：\n\n```text\nPASS manual edit remains unattributed\nPASS incomplete checkpoint cannot restore\nPASS stale preview rejected before write\n```\n\n这段文本来自捕获的 assistant 消息，不能替代独立工具事件或本轮真实测试报告。',
  ],
  [
    'user',
    '请保留完整路径。同名的 describeChange.ts 位于 connector 和 web 两个目录，评论不能只携带 basename。',
  ],
  [
    'assistant',
    '文件定位保留 `original path + side + line`。统一差异中的上下文行同时有旧、新行号，新增仅有新行号，删除仅有旧行号。\n\n对二进制、被截断和未捕获内容分别提示；不会生成看起来完整的假代码。',
  ],
  [
    'assistant',
    '还有一项边界：同伴的完整共享检查点可以用于理解改动，却不会自动获得本地恢复权限。自己的未关联任务检查点仍应能从目录历史找到。',
  ],
];
export function transcript(id: string, count = 120): SourceMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${id}-message-${i + 1}`,
    seq: i + 1,
    role: discussion[i % discussion.length][0] as SourceMessage['role'],
    text:
      discussion[i % discussion.length][1] +
      (i >= 8
        ? `\n\n第 ${Math.floor(i / 8) + 1} 轮复核 · 样例记录 ${i + 1}：保留原始顺序与来源 ID。`
        : ''),
    time: time + i * 60000,
  }));
}
const titles = [
  '让手动编辑与 Agent 日志各自保留来源证据',
  '调整恢复预览中的中文说明',
  '检查长路径与同名文件的定位行为',
  '完成离线状态下的本地保存',
  '核对尚未收齐的检查点分片',
  '更新项目使用说明，未关联任务',
  '为窄窗口保留可返回的团队活动索引与当前阅读位置',
  '检查代码审查中的上下文行与原始行号',
];
export function scenario(dense = false): Activity[] {
  return Array.from({ length: dense ? 100 : 9 }, (_, i) => {
    const member = members[(i + 1) % (dense ? 10 : 3)];
    const own = member.id === 'me' || i === 3;
    const actor = i === 3 ? members[0] : member;
    const id = `activity-${i + 1}`;
    const capture = i % 3 === 0 && i !== 3;
    const checkpointId = `checkpoint-${i + 1}`;
    const event: ClientEvent = {
      version: 1,
      id: `event-${i + 1}`,
      workspaceId: `directory-${actor.id}`,
      occurredAt: time - i * 600000,
      ...(capture
        ? {
            kind: 'agent.message',
            payload: {
              adapter: 'codex',
              sessionId: `capture-${i + 1}`,
              messageId: `message-${i + 1}`,
              role: 'assistant',
              text: discussion[1][1],
              checkpointId,
              association: 'observed-nearby',
            },
          }
        : {
            kind: 'checkpoint',
            payload: {
              checkpointId,
              parentId: null,
              label: titles[i % titles.length],
              files,
              totalFiles: files.length,
              part: 1,
              parts: i === 4 ? 2 : 1,
              source: 'local',
              backup: 'local-only',
            },
          }),
    };
    return {
      id,
      title: titles[i % titles.length],
      member: actor,
      workspace: {
        id: event.workspaceId,
        label: own ? '我的开发目录' : `${actor.name}的开发目录`,
        own,
      },
      event,
      receipt: i === 3 ? undefined : { seq: i + 1, receivedAt: time - i * 600000 + 1000 },
      task:
        i === 0
          ? { id: 'CS-42', title: titles[0], status: 'in_progress' }
          : i === 3
            ? { id: 'CS-39', title: titles[3], status: 'done' }
            : undefined,
      request:
        i === 0
          ? { recipientId: 'me', status: 'pending', nextStep: '林舟请你核对来源边界' }
          : undefined,
      directoryStatus: own
        ? {
            pending: i === 3 ? 3 : 0,
            offline: i === 3,
            deliveryState: i === 3 ? 'retrying' : 'ready',
            agent: { adapter: null, source: null, error: null },
          }
        : undefined,
      session: capture
        ? {
            id: `capture-${i + 1}`,
            adapter: 'codex',
            messages: transcript(id, i === 0 ? 120 : 48),
            historyIndexed: true,
          }
        : undefined,
      checkpoint: {
        id: checkpointId,
        receivedParts: i === 3 ? 0 : 1,
        totalParts: i === 4 ? 2 : 1,
        localComplete: i !== 4,
        serverComplete: i !== 3 && i !== 4,
        integrity: i === 4 ? 'legacy-unverified' : 'verified',
        files,
      },
      backup: own
        ? { location: 'local-convex-storage', remote: false, complete: i !== 3 }
        : undefined,
      note: capture
        ? undefined
        : '由连接程序捕获的已保存文件变化。未提供 Agent 归属证据，不要求先创建任务。',
    };
  });
}

// Independent own-directory history, including a checkpoint without any task
// or selected activity relationship. It stays reachable from project navigation.
export const directoryHistory = [
  {
    id: 'local-unlinked-09',
    title: '保存设置与本地说明',
    time: '10:06',
    complete: true,
    task: null,
  },
  { id: 'local-08', title: '恢复预览说明调整', time: '09:48', complete: true, task: null },
  {
    id: 'local-partial-07',
    title: '尚未收齐的历史记录',
    time: '09:31',
    complete: false,
    task: null,
  },
];
