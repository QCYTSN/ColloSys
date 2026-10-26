// Deliberately synthetic design content. No remote Agent or file operations.
export type DesignStatus = 'complete' | 'running' | 'pending';
export type DesignSync = 'received' | 'offline' | 'failed';
export type DesignTab = 'conversation' | 'changes' | 'checkpoints';
export interface DesignFile {
  path: string;
  added: number;
  removed: number;
  patch: string;
  status: 'modified' | 'added' | 'deleted';
}
export interface DesignMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}
export interface DesignActivity {
  id: string;
  person: string;
  initials: string;
  color: string;
  agent: string;
  title: string;
  description: string;
  time: string;
  progress: DesignStatus;
  sync: DesignSync;
  branch: string;
  task: string;
  files: DesignFile[];
  messages: DesignMessage[];
  checkpoint: string;
}
export const statusLabels: Record<DesignStatus, string> = {
  complete: '已完成',
  running: '进行中',
  pending: '待查看',
};
// Both entries are scenario fixtures, including the pre-edit state.
const priorStates: Record<string, { id: string; time: string }> = {
  reading: { id: 'cp-6e19b2', time: '今天 14:27' },
  navigation: { id: 'cp-31d791', time: '今天 14:20' },
  manual: { id: 'cp-2a703b', time: '今天 14:08' },
  offline: { id: 'cp-43de20', time: '今天 13:52' },
  failed: { id: 'cp-12bb97', time: '今天 13:36' },
  long: { id: 'cp-9861d3', time: '昨天 09:01' },
};
export function checkpointStates(item: DesignActivity) {
  return [
    {
      id: item.checkpoint,
      time: item.time === '昨天' ? '昨天 09:12' : `今天 ${item.time}`,
      title: item.title,
    },
    { ...priorStates[item.id], title: `修改前 · ${item.title}` },
  ];
}
function counted(file: Omit<DesignFile, 'added' | 'removed'>): DesignFile {
  const lines = file.patch.split('\n');
  return {
    ...file,
    added: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
    removed: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
  };
}
const files = (
  [
    {
      path: 'src/workspace/session/restoreReadingPosition.ts',
      status: 'modified',
      patch: `--- a/src/workspace/session/restoreReadingPosition.ts
+++ b/src/workspace/session/restoreReadingPosition.ts
@@ -18,5 +18,11 @@
 export function restoreReadingPosition(view, anchor) {
-  const offset = view.scrollHeight - view.clientHeight;
-  view.scrollTo({ top: offset, behavior: 'smooth' });
+  // 保留用户正在阅读的消息，不被新内容打断。
+  if (!anchor.followLatest) {
+    const message = view.querySelector(anchor.messageId);
+    if (message) message.scrollIntoView({ block: 'start' });
+    return;
+  }
+
+  view.scrollTo({ top: view.scrollHeight, behavior: 'auto' });
   return view.scrollTop;
 }
`,
    },
    {
      path: 'src/components/conversation/UnreadIndicator.tsx',
      status: 'added',
      patch: `--- /dev/null
+++ b/src/components/conversation/UnreadIndicator.tsx
@@ -0,0 +1,12 @@
+export function UnreadIndicator({ count, onRead }) {
+  if (count === 0) return null;
+
+  return (
+    <button type="button" onClick={onRead}>
+      <ArrowDown size={16} />
+      <span>{count} 条新消息</span>
+      <span className="sr-only">返回会话最新位置</span>
+    </button>
+  );
+}
+
`,
    },
    {
      path: 'tests/conversation/阅读历史时收到新消息.test.ts',
      status: 'added',
      patch: `--- /dev/null
+++ b/tests/conversation/阅读历史时收到新消息.test.ts
@@ -0,0 +1,10 @@
+test('new messages preserve the reading anchor', async () => {
+  await reader.open('session-42');
+  await reader.scrollToMessage('earlier-message');
+  const before = await reader.readingAnchor();
+
+  await session.append('A new reply arrived.');
+
+  expect(await reader.readingAnchor()).toEqual(before);
+  expect(await reader.unreadCount()).toBe(1);
+});
`,
    },
    {
      path: 'src/legacy/scrollToBottom.ts',
      status: 'deleted',
      patch: `--- a/src/legacy/scrollToBottom.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function scrollToBottom(view) {
-  view.scrollTop = view.scrollHeight;
-}
`,
    },
  ] satisfies Omit<DesignFile, 'added' | 'removed'>[]
).map(counted);
const messages: DesignMessage[] = [
  {
    id: 'prompt',
    role: 'user',
    time: '14:28',
    text: '切回会话时，保留我上次阅读的位置。收到新的 Agent 回复时，也不要把我拉到最底部。\n\n只有我点击「回到最新」，才重新跟随内容。中文长回复和代码块的高度变化也需要考虑。',
  },
  {
    id: 'reply',
    role: 'assistant',
    time: '14:29',
    text: '问题出在会话恢复时总是执行 `scrollToBottom()`。我把**阅读位置**与**跟随最新内容**分成了两种状态。\n\n### 这次调整\n\n- 返回会话时，定位到上次阅读的消息。\n- 阅读历史时，新回复只更新未读提示。\n- 主动回到底部后，恢复跟随新内容。\n\n```ts\nif (anchor.followLatest) {\n  scrollToLatest();\n} else {\n  restoreMessageAnchor(anchor);\n}\n```\n\n长代码块加载导致高度变化时，也会保持消息锚点。接下来检查切换会话、加载早期消息和连续回复这三种情况。',
  },
  {
    id: 'followup',
    role: 'user',
    time: '14:31',
    text: '对，返回时也要保留选中的文件。顺便检查一下窄窗口，不要把「查看检查点」挤掉。',
  },
  {
    id: 'result',
    role: 'assistant',
    time: '14:32',
    text: '已把文件选择和会话位置分开保存。下面的 4 个文件是这个**测试场景**中的对应改动，包括删除旧的强制滚动函数，可以逐个查看差异。\n\n检查点记录在源设备。共享差异不等于已备份完整文件，恢复前仍需要预览受影响的目录。',
  },
];
export const designActivities: DesignActivity[] = [
  {
    id: 'reading',
    person: '林舟',
    initials: '舟',
    color: 'moss',
    agent: 'Codex',
    title: '让会话回到上次读到的地方',
    description: '保留阅读位置与文件选择，补齐新消息提示',
    time: '14:32',
    progress: 'complete',
    sync: 'received',
    branch: 'feat/reading-anchor',
    task: 'CW-24',
    files,
    messages,
    checkpoint: 'cp-7f2a91',
  },
  {
    id: 'navigation',
    person: '陈一',
    initials: '一',
    color: 'blue',
    agent: 'Claude Code',
    title: '整理项目导航与成员筛选',
    description: '项目切换后保留筛选条件与返回位置',
    time: '14:25',
    progress: 'running',
    sync: 'received',
    branch: 'feat/project-navigation',
    task: 'CW-26',
    files: [files[1]],
    messages: [
      {
        id: 'p2',
        role: 'user',
        time: '14:23',
        text: '让成员筛选在返回项目时保持原来的选择。导航标题需要兼容中英文混排和长项目名。',
      },
      {
        id: 'a2',
        role: 'assistant',
        time: '14:25',
        text: '正在检查项目切换与筛选状态的关系。\n\n这条 Claude Code 内容是明确标记的设计测试数据，不表示已经接入真实采集。使用右上角菜单可以回放新消息到达。',
      },
    ],
    checkpoint: 'cp-42a682',
  },
  {
    id: 'manual',
    person: '你',
    initials: '你',
    color: 'sand',
    agent: '手动编辑',
    title: '补充本地恢复的边界说明',
    description: 'docs/工作区恢复与文件保留策略.md',
    time: '14:12',
    progress: 'pending',
    sync: 'received',
    branch: 'docs/recovery-guide',
    task: '未关联任务',
    files: [
      counted({
        path: 'docs/工作区恢复与文件保留策略.md',
        status: 'added',
        patch: `--- /dev/null
+++ b/docs/工作区恢复与文件保留策略.md
@@ -0,0 +1,5 @@
+# 工作区恢复
+
+恢复前需要预览影响范围，并备份当前状态。
+预览后文件发生变化时，必须重新确认。
+每位成员的目录保持独立。
`,
      }),
    ],
    messages: [],
    checkpoint: 'cp-3b813c',
  },
  {
    id: 'offline',
    person: '林舟',
    initials: '舟',
    color: 'moss',
    agent: 'Codex',
    title: '检查断线后的补发顺序',
    description: '源设备离线 · 展示此前收到的记录',
    time: '13:56',
    progress: 'pending',
    sync: 'offline',
    branch: 'fix/outbox-replay',
    task: 'CW-19',
    files: [files[0]],
    messages: [
      {
        id: 'o1',
        role: 'user',
        time: '13:56',
        text: '先在断网条件下保存文件，确认恢复连接后按顺序发送。这里只展示此前已收到的上下文。',
      },
    ],
    checkpoint: 'cp-54ef31',
  },
  {
    id: 'failed',
    person: '陈一',
    initials: '一',
    color: 'blue',
    agent: 'Claude Code',
    title: '同步工具栏状态与权限提示',
    description: '服务暂时不可用，记录保留在源设备',
    time: '13:41',
    progress: 'pending',
    sync: 'failed',
    branch: 'fix/toolbar-state',
    task: 'CW-22',
    files: [files[1], files[2]],
    messages: [
      {
        id: 'f1',
        role: 'assistant',
        time: '13:41',
        text: '文件已保存，但共享请求未收到服务确认。恢复连接后需要继续补发，不能把“文件已保存”显示成“同步完成”。',
      },
    ],
    checkpoint: 'cp-23ac08',
  },
  {
    id: 'long',
    person: '你',
    initials: '你',
    color: 'sand',
    agent: 'Codex',
    title: '修复 Workspace 切换后中文长任务标题、文件路径与成员状态的对齐问题',
    description: '校验 Mixed 中文 / English 与多层目录',
    time: '昨天',
    progress: 'complete',
    sync: 'received',
    branch: 'fix/workspace-layout',
    task: 'CW-17',
    files: [
      {
        ...files[0],
        path: 'packages/workspace/components/collaboration/session-detail/混合语言与超长目录/ReadingPositionIndicator.tsx',
      },
    ],
    messages,
    checkpoint: 'cp-a871e4',
  },
];
