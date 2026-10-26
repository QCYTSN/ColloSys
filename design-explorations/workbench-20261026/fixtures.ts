// Synthetic, in-memory design material. Never imported by the application or connector.
export type FileChange = { path: string; before: string[]; after: string[] };
export type Work = {
  id: string;
  title: string;
  person: string;
  agent: string;
  state: 'review' | 'waiting' | 'running' | 'offline' | 'done' | 'unknown';
  reason: string;
  time: string;
  request: string;
  result: string;
  source: string;
  own: boolean;
  files: FileChange[];
};
const evidence: FileChange = {
  path: 'packages/connector/src/attribution.ts',
  before: [
    'export function attributeChange(change, sessions) {',
    '  const active = sessions.find(s => s.isRunning);',
    '  return { ...change, agent: active?.agent };',
    '}',
  ],
  after: [
    'export function attributeChange(change, evidence) {',
    '  const source = evidence.forFile(change.path);',
    '  if (!source?.verified) {',
    "    return { ...change, origin: 'unattributed' };",
    '  }',
    '  return { ...change, agent: source.agent,',
    '    sessionId: source.sessionId };',
    '}',
  ],
};
const tests: FileChange = {
  path: 'tests/attribution.test.ts',
  before: ["it('uses the running agent', () => {", "  expect(result.agent).toBe('codex');", '});'],
  after: [
    "it('keeps manual edits independent', () => {",
    '  const result = attributeChange(manualEdit, evidence);',
    "  expect(result.origin).toBe('unattributed');",
    '  expect(result.sessionId).toBeUndefined();',
    '});',
  ],
};
const restore: FileChange = {
  path: 'packages/connector/src/restore.ts',
  before: ['export async function confirm(preview) {', '  await restore(preview.checkpoint);', '}'],
  after: [
    'export async function confirm(preview) {',
    '  await rejectIfStale(preview);',
    '  await backupCurrentState();',
    '  await restore(preview.checkpoint);',
    '}',
  ],
};
const nav: FileChange = {
  path: 'src/workspace/ProjectNavigation.tsx',
  before: ['<nav>', '  {projects.map(renderProject)}', '</nav>'],
  after: [
    '<nav aria-label="Projects">',
    '  {visibleProjects.map(renderProject)}',
    '  <ProjectSearch />',
    '</nav>',
  ],
};
const reading: FileChange = {
  path: 'src/conversation/readingPosition.ts',
  before: ['scrollToBottom();'],
  after: [
    'if (anchor.followLatest) {',
    '  scrollToLatest();',
    '} else {',
    '  restoreMessageAnchor(anchor);',
    '}',
  ],
};
const note: FileChange = {
  path: 'docs/local-recovery.md',
  before: ['本地文件会同步到团队。'],
  after: [
    '团队共享活动与上下文。',
    '每位成员的文件目录保持独立。',
    '恢复前会先预览并备份当前状态。',
  ],
};
export const workItems: Work[] = [
  {
    id: 'CW-42',
    title: '明确每次变更的执行来源',
    person: '林舟',
    agent: 'Codex',
    state: 'review',
    reason: '请你审查变更',
    time: '14:32',
    request:
      '同一目录里，手动保存和 Codex 的修改可能同时发生。没有直接证据时，保持来源未知，不要把手动编辑归给正在运行的 Agent。',
    result:
      '归属现在读取文件级证据。缺少已验证来源的变更保持独立；会话 ID 只在证据确认后附加。请重点检查手动编辑与 Agent 并发的情况。',
    source: '会话事件 + 文件来源证据',
    own: false,
    files: [evidence, tests],
  },
  {
    id: 'CW-39',
    title: '恢复前，先看清会影响哪些文件',
    person: '你',
    agent: '手动编辑',
    state: 'waiting',
    reason: '等待你确认方案',
    time: '14:18',
    request: '恢复应先生成独立预览，再备份当前目录。预览后继续编辑过文件时，旧预览必须失效。',
    result:
      '调整了预览和确认的顺序。现在需要确认“预览已过期”时的提示文案，并核对当前状态备份的位置。',
    source: '本地保存 · 没有 Agent 归属',
    own: true,
    files: [restore],
  },
  {
    id: 'CW-40',
    title: '整理项目导航与成员筛选',
    person: '陈一',
    agent: 'Claude Code',
    state: 'running',
    reason: '正在调整导航',
    time: '14:12',
    request: '项目增多后，允许按名称查找。窄窗口保留当前项目，不把所有项目挤在同一行。',
    result: '已捕获本轮执行开始事件。正在处理导航的键盘焦点和小窗口切换，结果还没有交付。',
    source: '授权的会话执行事件',
    own: false,
    files: [nav],
  },
  {
    id: 'CW-38',
    title: '补充本地恢复的边界说明',
    person: '你',
    agent: '手动编辑',
    state: 'offline',
    reason: '2 条活动待同步',
    time: '13:56',
    request: '说明恢复只作用于自己的目录。团队查看历史不会修改本地文件。',
    result:
      '文件已保存在这台设备。连接中断后，两条活动保留在待发送队列；没有确认服务接收，也没有异机备份。',
    source: '本机保存记录',
    own: true,
    files: [note],
  },
  {
    id: 'CW-36',
    title: '让会话回到上次读到的地方',
    person: '林舟',
    agent: 'Codex',
    state: 'done',
    reason: '已完成审查',
    time: '昨天',
    request: '切回会话时保留阅读位置。收到新回复时，只有主动点击“查看新记录”才移动到最新内容。',
    result: '阅读位置与跟随最新状态分开保存。文件选择也保留；新消息只增加提醒。',
    source: '已关联的会话事件',
    own: false,
    files: [reading],
  },
  {
    id: 'EV-18',
    title: '更新目录连接说明',
    person: '陈一',
    agent: '来源未确认',
    state: 'unknown',
    reason: '没有会话关联',
    time: '昨天',
    request: '发现了一次已保存的文档变化，但没有足够证据证明由哪个 Agent 完成。',
    result: '保留真实文件变化与保存者。当前不显示 Agent 名称，也不提供不存在的会话链接。',
    source: '文件变化记录；缺少 Agent 证据',
    own: false,
    files: [note],
  },
];
export const states = {
  review: '待审查',
  waiting: '待确认',
  running: '执行中',
  offline: '待同步',
  done: '已完成',
  unknown: '来源未知',
};
export const needsAttention = (w: Work) => ['review', 'waiting', 'offline'].includes(w.state);
