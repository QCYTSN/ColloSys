import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Tabs from '@radix-ui/react-tabs';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import {
  MagnifyingGlass,
  CaretDown,
  CaretRight,
  SidebarSimple,
  ClockCounterClockwise,
  GitDiff,
  ChatCircleText,
  Info,
  X,
  ArrowUpRight,
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCircle,
  FileCode,
  FileImage,
  WarningCircle,
  WifiSlash,
  DotsThree,
  ArrowClockwise,
  UsersThree,
  PaperPlaneTilt,
  FolderOpen,
  LinkSimple,
  IconContext,
} from '@phosphor-icons/react';
import { WorkButton, MemberAvatar } from './ContextControls';
import { FilePatchDiff, type DiffSelection } from '../components/DiffView';
import { ConversationView } from '../components/ConversationView';
import { ThemeContext } from '../components/ThemeProvider';
import type { ConversationData } from '../components/conversation/types';
import {
  ContextReader,
  type ReadingMemory,
  type ReaderHandle,
  type LocalComment,
} from './ContextReader';
import { scenario, members, directoryHistory } from './ContextScenario';
import { presentation, changeCounts, canPreview, type Activity } from './ContextModel';
import './context-workbench.css';

type Mode = 'context' | 'changes';
type Draft = {
  recipient: string;
  work: string;
  title: string;
  request: string;
  file: string;
  session?: string;
  throughSeq?: number;
  checkpoint?: string;
};
function IconButton({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <WorkButton className="cw-icon" aria-label={label} {...props}>
          {children}
        </WorkButton>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="cw-tooltip" sideOffset={6}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
function Mark() {
  return (
    <svg viewBox="470 440 245 160" role="img" aria-label="ColloSys" className="cw-mark">
      <image href="/collo-design/peanut-reference.png" width="1200" height="1200" />
    </svg>
  );
}
function Facts({ activity }: { activity: Activity }) {
  const state = presentation(activity);
  return (
    <div className="cw-facts">
      <h3>来源与保存</h3>
      <p>这些事实彼此独立。</p>
      <dl>
        <dt>目录与成员</dt>
        <dd>
          {activity.member.name} · {activity.workspace.label}
        </dd>
        <dt>工作进展</dt>
        <dd>{state.progress}</dd>
        <dt>行动请求</dt>
        <dd>{state.action ?? '没有向你发出的明确请求'}</dd>
        <dt>当前执行</dt>
        <dd>{state.execution}</dd>
        <dt>捕获来源</dt>
        <dd>
          {state.attribution}
          {activity.session && <code>{activity.session.id}</code>}
        </dd>
        <dt>文件与会话</dt>
        <dd>{activity.session ? '时间邻近（observed-nearby），不是修改因果' : '未提供会话关联'}</dd>
        <dt>本地捕获</dt>
        <dd>
          {activity.workspace.own
            ? activity.checkpoint?.localComplete
              ? '本机完整检查点'
              : '本机检查点不完整'
            : '由来源设备保管，当前设备不可恢复'}
        </dd>
        <dt>同步交付</dt>
        <dd>{state.delivery}</dd>
        <dt>共享完整性</dt>
        <dd>{state.completeness}</dd>
        <dt>备份位置</dt>
        <dd>{state.backup}</dd>
      </dl>
      <p className="cw-footnote">
        当前展示为契约形状的演示数据。正式身份、权限与存储状态仍由已有后端决定。
      </p>
    </div>
  );
}
function ActivityIndex({
  activities,
  selected,
  select,
  query,
  setQuery,
  member,
  setMember,
  dense,
  history,
}: {
  activities: Activity[];
  selected: string;
  select: (id: string) => void;
  query: string;
  setQuery: (s: string) => void;
  member: string;
  setMember: (s: string) => void;
  dense: boolean;
  history: () => void;
}) {
  const visible = activities.filter(
    (a) =>
      (member === 'all' || a.member.id === member) &&
      `${a.title} ${a.member.name} ${a.task?.id ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-activity="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected, member, query]);
  return (
    <div className="cw-index">
      <div className="cw-index-heading">
        <h2>团队活动</h2>
        <span>{activities.length}</span>
        <Menu.Root>
          <Menu.Trigger asChild>
            <WorkButton className="cw-member-filter">
              {member === 'all' ? '所有成员' : members.find((m) => m.id === member)?.name}
              <CaretDown size={13} />
            </WorkButton>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="cw-menu" sideOffset={5}>
              <Menu.RadioGroup value={member} onValueChange={setMember}>
                <Menu.RadioItem value="all">
                  <span className="cw-menu-person">
                    <UsersThree aria-hidden="true" />
                    所有成员
                  </span>
                  <Menu.ItemIndicator>
                    <Check size={14} />
                  </Menu.ItemIndicator>
                </Menu.RadioItem>
                {members.slice(0, dense ? 10 : 3).map((m) => (
                  <Menu.RadioItem value={m.id} key={m.id}>
                    <span className="cw-menu-person">
                      <MemberAvatar member={m} small />
                      {m.name}
                    </span>
                    <Menu.ItemIndicator>
                      <Check size={14} />
                    </Menu.ItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <label className="cw-search">
        <MagnifyingGlass size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="查找活动、成员或任务"
          aria-label="查找活动"
        />
        {query && (
          <WorkButton onClick={() => setQuery('')} aria-label="清除搜索">
            <X size={14} />
          </WorkButton>
        )}
      </label>
      <div className="cw-index-caption">
        最近记录<span>{dense ? '10' : '3'} 位成员</span>
      </div>
      <div className="cw-activity-list" ref={list} aria-label="项目活动" role="list">
        {visible.map((a, i) => (
          <WorkButton
            role="listitem"
            className={`cw-activity ${a.id === selected ? 'selected' : ''}`}
            key={a.id}
            data-activity={a.id}
            aria-current={a.id === selected ? 'true' : undefined}
            onClick={() => select(a.id)}
          >
            <span className="cw-activity-person">
              <MemberAvatar member={a.member} small />
              <span>
                {a.member.name}
                <span className="cw-source-kind">{a.session ? 'Codex 日志' : '文件保存'}</span>
              </span>
              <time>{i < 3 ? `${i * 8 + 2} 分钟前` : '今天'}</time>
            </span>
            <strong>{a.title}</strong>
            <span className="cw-activity-bottom">
              {!a.receipt ? (
                <>
                  <WifiSlash size={13} />
                  待同步
                </>
              ) : a.checkpoint && !a.checkpoint.serverComplete ? (
                <>
                  <WarningCircle size={13} />
                  分片未收齐
                </>
              ) : a.task ? (
                <span>{a.task.id}</span>
              ) : (
                <span>未关联任务</span>
              )}
              <span>{a.checkpoint?.files.length} 个文件</span>
            </span>
          </WorkButton>
        ))}
        {!visible.length && (
          <div className="cw-empty">
            <MagnifyingGlass size={26} />
            <p>没有匹配的活动</p>
            <WorkButton
              onClick={() => {
                setQuery('');
                setMember('all');
              }}
            >
              清除筛选
            </WorkButton>
          </div>
        )}
      </div>
      <WorkButton className="cw-history-entry" onClick={history}>
        <ClockCounterClockwise size={18} />
        <span>
          我的目录历史<small>包含未关联任务的检查点</small>
        </span>
        <CaretRight size={15} />
      </WorkButton>
    </div>
  );
}
const previewTheme = {
  theme: 'light' as const,
  visualStyle: 'minimal' as const,
  toggleTheme() {},
  setVisualStyle() {},
};
export default function ContextPreview() {
  return (
    <ThemeContext.Provider value={previewTheme}>
      <IconContext.Provider value={{ size: 16, weight: 'regular' }}>
        <ContextWorkbench />
      </IconContext.Provider>
    </ThemeContext.Provider>
  );
}
function ContextWorkbench() {
  const [params, setParams] = useSearchParams();
  const [dense, setDense] = useState(params.get('density') === 'dense');
  const activities = useMemo(() => scenario(dense), [dense]);
  const selected = activities.find((a) => a.id === params.get('activity')) ?? activities[0];
  const mode: Mode = params.get('mode') === 'changes' ? 'changes' : 'context';
  const reference = params.get('reference') === 'codecast';
  const [query, setQuery] = useState('');
  const [member, setMember] = useState('all');
  const [width, setWidth] = useState(window.innerWidth);
  const [indexOpen, setIndexOpen] = useState(window.innerWidth >= 980);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [modal, setModal] = useState<
    'history' | 'restore' | 'handoff' | 'draft' | 'source' | 'navigation' | 'help' | null
  >(null);
  const [denied, setDenied] = useState(false);
  const [comments, setComments] = useState<Record<string, LocalComment[]>>({});
  const [comment, setComment] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recipient, setRecipient] = useState('林舟');
  const [request, setRequest] = useState(
    '请核对来源证据与恢复权限的边界，并在这项工作下回复发现。',
  );
  const [restore, setRestore] = useState({
    id: '',
    title: '',
    complete: false,
    revision: 1,
    capturedRevision: 1,
    confirmed: false,
    result: '',
    paths: [] as string[],
  });
  const [ack, setAck] = useState(false);
  const [fileMap, setFileMap] = useState<Record<string, string>>({});
  const [viewed, setViewed] = useState<string[]>([]);
  const [selection, setSelection] = useState<DiffSelection | null>(null);
  const [fileQuery, setFileQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const indexRef = usePanelRef();
  const reader = useRef<ReaderHandle>(null);
  const reading = useRef(new Map<string, ReadingMemory>());
  const diffPositions = useRef(new Map<string, number>());
  const diffScroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const sourceTrigger = useRef<HTMLButtonElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  const files = selected.checkpoint?.files ?? [];
  const file = files.find((f) => f.path === fileMap[selected.id]) ?? files[0];
  const fileKey = `${selected.id}:${file?.path}`;
  const counts = changeCounts(files);
  const state = presentation(selected);
  const commitSelection = (id: string) => {
    setParams((old) => {
      const next = new URLSearchParams(old);
      next.set('activity', id);
      return next;
    });
    setSelection(null);
    setComment('');
    if (modal === 'navigation') setModal(null);
  };
  const select = (id: string) => {
    // Selection is synchronous. Only the changed title and selected row receive
    // a brief local treatment; the transcript never fades or waits for motion.
    if (id !== selected.id) commitSelection(id);
    else if (modal === 'navigation') setModal(null);
  };
  const changeMode = (nextMode: string) =>
    setParams((old) => {
      const next = new URLSearchParams(old);
      next.set('mode', nextMode);
      return next;
    });
  const openFile = (path: string) => {
    setFileMap((old) => ({ ...old, [selected.id]: path }));
    setSelection(null);
    changeMode('changes');
  };
  const openModal = (name: typeof modal) => {
    priorFocus.current = document.activeElement as HTMLElement;
    setModal(name);
  };
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (width < 980) {
      indexRef.current?.collapse();
      setIndexOpen(false);
    }
    if (width < 1400 && evidenceOpen) {
      setEvidenceOpen(false);
      setModal('source');
    }
  }, [width]);
  useEffect(() => {
    const element = diffScroll.current;
    if (!element) return;
    const offset = diffPositions.current.get(fileKey) ?? 0;
    let frame = 0;
    let stopped = false;
    const until = performance.now() + 800;
    const cancel = () => {
      stopped = true;
    };
    const settle = () => {
      if (stopped) return;
      element.scrollTop = offset;
      if (performance.now() < until) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    element.addEventListener('wheel', cancel, { passive: true });
    element.addEventListener('pointerdown', cancel);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('wheel', cancel);
      element.removeEventListener('pointerdown', cancel);
    };
  }, [fileKey]);
  useEffect(() => {
    const end = () => setDragging(false);
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, []);
  const toggleIndex = () => {
    if (width < 980) return openModal('navigation');
    if (indexOpen) indexRef.current?.collapse();
    else indexRef.current?.expand();
    setIndexOpen(!indexOpen);
  };
  const startRestore = (id: string, title: string, complete: boolean) => {
    setRestore({
      id,
      title,
      complete,
      revision: 1,
      capturedRevision: 1,
      confirmed: false,
      result: '',
      paths: id.startsWith('local-')
        ? ['settings/editor.json', 'docs/local-notes.md']
        : files.filter((f) => f.status !== 'excluded').map((f) => f.path),
    });
    setAck(false);
    setModal('restore');
  };
  const invalidate = () => {
    setDenied(true);
    setModal(null);
    setEvidenceOpen(false);
    setComments({});
    setComment('');
    setDraft(null);
    setSelection(null);
    setFileMap({});
    reading.current.clear();
    diffPositions.current.clear();
  };
  const nativeData = useMemo<ConversationData>(
    () => ({
      _id: `fixture-${selected.id}` as ConversationData['_id'],
      session_id: selected.session?.id,
      title: selected.title,
      user: { name: selected.member.name },
      agent_type: selected.session?.adapter,
      is_own: false,
      messages: (selected.session?.messages ?? [])
        .slice(0, 30)
        .map((m) => ({ _id: m.id, role: m.role, content: m.text, timestamp: m.time })),
      message_count: selected.session?.messages.length ?? 0,
    }),
    [selected],
  );
  if (reference)
    return (
      <div className="cw-reference">
        <div className="cw-reference-bar">
          <WorkButton
            onClick={() =>
              setParams((old) => {
                const next = new URLSearchParams(old);
                next.delete('reference');
                return next;
              })
            }
          >
            <ArrowLeft size={16} />
            返回候选
          </WorkButton>
          <span>
            固定版 Codecast 原生 ConversationView · 同一批 30 条消息 · fixture，非真实会话
          </span>
        </div>
        <div className="cw-native-reader">
          <ConversationView
            conversation={nativeData}
            backHref="/workbench-preview"
            embedded
            guest
            isOwner={false}
            showMessageInput={false}
            openAtTop
            initialDensity="full"
          />
        </div>
      </div>
    );
  return (
    <Tooltip.Provider delayDuration={250}>
      <div className={`cw-app ${dragging ? 'dragging' : ''}`}>
        <header className="cw-project-bar">
          <div className="cw-brand">
            <Mark />
            <strong>ColloSys</strong>
          </div>
          <span className="cw-project-divider" />
          <Menu.Root>
            <Menu.Trigger asChild>
              <WorkButton className="cw-project-picker">
                <span>核心产品</span>
                <CaretDown size={14} />
              </WorkButton>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="cw-menu" sideOffset={8}>
                <Menu.Label className="cw-menu-label">演示项目</Menu.Label>
                <Menu.Item
                  onSelect={() => {
                    setQuery('');
                    setMember('all');
                  }}
                >
                  核心产品
                  <Check size={14} />
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item onSelect={() => openModal('help')}>项目与共享范围</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
          <span className="cw-demo-tag">交互样板 · 未连接业务数据</span>
          <div className="cw-project-right">
            <div className="cw-roster" aria-label={`${dense ? 10 : 3} 位演示成员`}>
              {members.slice(0, 3).map((m) => (
                <MemberAvatar member={m} key={m.id} />
              ))}
              {dense && <span>+7</span>}
            </div>
            <Menu.Root>
              <Menu.Trigger asChild>
                <WorkButton className="cw-scenario">
                  预览场景
                  <CaretDown size={13} />
                </WorkButton>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className="cw-menu" align="end" sideOffset={8}>
                  <Menu.Label className="cw-menu-label">仅改变演示数据</Menu.Label>
                  <Menu.Item
                    onSelect={() => {
                      setDense(false);
                      setQuery('');
                      setMember('all');
                    }}
                  >
                    3 人 · 正常活动
                  </Menu.Item>
                  <Menu.Item
                    onSelect={() => {
                      setDense(true);
                      setQuery('');
                      setMember('all');
                    }}
                  >
                    10 人 · 100 条活动
                  </Menu.Item>
                  <Menu.Separator />
                  <Menu.Item
                    disabled={!selected.session || denied}
                    onSelect={() => reader.current?.simulateIncoming()}
                  >
                    模拟收到新记录
                  </Menu.Item>
                  <Menu.Item onSelect={invalidate}>模拟权限失效</Menu.Item>
                  <Menu.Separator />
                  <Menu.Item
                    disabled={!selected.session || denied}
                    onSelect={() =>
                      setParams((old) => {
                        const next = new URLSearchParams(old);
                        next.set('reference', 'codecast');
                        return next;
                      })
                    }
                  >
                    Codecast 原生同内容对照
                  </Menu.Item>
                  <Menu.Item onSelect={() => openModal('help')}>实现与演示边界</Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </header>
        {denied ? (
          <div className="cw-access-lost">
            <WarningCircle size={32} />
            <h1>项目访问已失效</h1>
            <p>活动、阅读缓存、评论和交接草稿已从这个预览清理。</p>
            <WorkButton kind="primary" className="cw-primary" onClick={() => setDenied(false)}>
              重新载入演示数据
            </WorkButton>
            <p>正式产品仍需重新向服务端验证权限。</p>
          </div>
        ) : (
          <Group
            className="cw-group"
            style={{ width: 'auto' }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('[role="separator"]')) setDragging(true);
            }}
          >
            <Panel
              id="activity-index"
              panelRef={indexRef}
              defaultSize={width >= 980 ? '300px' : '0px'}
              minSize="260px"
              maxSize="400px"
              collapsible
              collapsedSize="0px"
              className="cw-index-panel"
              inert={!indexOpen}
            >
              <ActivityIndex
                activities={activities}
                selected={selected.id}
                select={select}
                query={query}
                setQuery={setQuery}
                member={member}
                setMember={setMember}
                dense={dense}
                history={() => openModal('history')}
              />
            </Panel>
            <Separator
              className={`cw-divider ${!indexOpen ? 'collapsed' : ''}`}
              disabled={width < 980}
              aria-label="调整活动索引宽度"
            />
            <Panel
              id="workspace"
              minSize={width < 980 ? '100%' : '560px'}
              className="cw-workspace-panel"
            >
              <main className="cw-workspace">
                <div className="cw-working-row">
                  <div className="cw-primary-space" data-mode={mode}>
                    <header className="cw-context-heading">
                      <IconButton
                        label={indexOpen ? '收起活动索引' : '打开活动索引'}
                        onClick={toggleIndex}
                      >
                        <SidebarSimple size={20} />
                      </IconButton>
                      <div className="cw-heading-copy" key={selected.id}>
                        <h1>{selected.title}</h1>
                        <div>
                          <span>{selected.member.name}</span>
                          <span>·</span>
                          <span>{selected.session ? 'Codex 捕获会话' : '已保存文件'}</span>
                          {selected.task && (
                            <>
                              <span>·</span>
                              <span>{selected.task.id}</span>
                              <span>{state.progress}</span>
                            </>
                          )}
                          {!selected.receipt && (
                            <span className="cw-warning">
                              <WifiSlash size={13} />
                              {state.delivery}
                            </span>
                          )}
                        </div>
                      </div>
                      <WorkButton
                        kind="secondary"
                        className="cw-handoff-button"
                        aria-label={draft?.work === selected.id ? '查看交接草稿' : '准备交接'}
                        onClick={() => openModal(draft?.work === selected.id ? 'draft' : 'handoff')}
                      >
                        <ArrowUpRight size={16} />
                        <span>{draft?.work === selected.id ? '查看交接草稿' : '准备交接'}</span>
                      </WorkButton>
                    </header>
                    <Tabs.Root value={mode} onValueChange={changeMode} className="cw-mode">
                      <div className="cw-mode-row">
                        <Tabs.List aria-label="工作模式">
                          <Tabs.Trigger value="context">
                            <ChatCircleText size={16} />
                            上下文
                          </Tabs.Trigger>
                          <Tabs.Trigger value="changes">
                            <GitDiff size={16} />
                            文件变化<span>{files.length}</span>
                          </Tabs.Trigger>
                        </Tabs.List>
                        <div className="cw-mode-actions">
                          {mode === 'context' && selected.session && (
                            <WorkButton
                              aria-label="到最新"
                              onClick={() => reader.current?.latest()}
                            >
                              <ArrowDown size={14} />
                              <span>到最新</span>
                            </WorkButton>
                          )}
                          <WorkButton
                            ref={sourceTrigger}
                            aria-label="来源与保存"
                            aria-expanded={evidenceOpen || modal === 'source'}
                            onClick={() => {
                              if (width < 1400) openModal('source');
                              else {
                                setEvidenceOpen(!evidenceOpen);
                                if (evidenceOpen) sourceTrigger.current?.focus();
                              }
                            }}
                          >
                            <Info size={16} />
                            <span>来源与保存</span>
                          </WorkButton>
                          {selected.workspace.own && (
                            <WorkButton aria-label="目录历史" onClick={() => openModal('history')}>
                              <ClockCounterClockwise size={16} />
                              <span>目录历史</span>
                            </WorkButton>
                          )}
                        </div>
                      </div>
                    </Tabs.Root>
                    <div className="cw-reading-surface">
                      <div
                        className={`cw-mode-pane ${mode === 'context' ? 'active' : ''}`}
                        inert={mode !== 'context'}
                        aria-hidden={mode !== 'context'}
                        data-pane="context"
                      >
                        <ContextReader
                          key={selected.id}
                          ref={reader}
                          activity={selected}
                          memory={reading.current}
                          comments={comments[selected.id] ?? []}
                          openFile={openFile}
                        />
                      </div>
                      <div
                        className={`cw-mode-pane cw-review-pane ${mode === 'changes' ? 'active' : ''}`}
                        inert={mode !== 'changes'}
                        aria-hidden={mode !== 'changes'}
                        data-pane="changes"
                      >
                        <div className="cw-files">
                          <div className="cw-files-heading">
                            <strong>改动文件</strong>
                            <span className="cw-added">+{counts.added}</span>
                            <span className="cw-removed">−{counts.removed}</span>
                          </div>
                          <label className="cw-file-search">
                            <MagnifyingGlass size={14} />
                            <input
                              aria-label="查找文件"
                              placeholder="完整路径或文件名"
                              value={fileQuery}
                              onChange={(e) => setFileQuery(e.target.value)}
                            />
                          </label>
                          <div className="cw-file-list">
                            {files
                              .filter((f) => f.path.toLowerCase().includes(fileQuery.toLowerCase()))
                              .map((f) => (
                                <WorkButton
                                  key={f.path}
                                  className={file?.path === f.path ? 'selected' : ''}
                                  onClick={() => openFile(f.path)}
                                  title={f.path}
                                >
                                  {f.binary ? <FileImage size={17} /> : <FileCode size={17} />}
                                  <span>
                                    <strong>{f.path.split('/').at(-1)}</strong>
                                    <small>{f.path.split('/').slice(0, -1).join('/')}</small>
                                  </span>
                                  <b className={`cw-file-status ${f.status}`}>
                                    {f.status === 'added'
                                      ? 'A'
                                      : f.status === 'deleted'
                                        ? 'D'
                                        : f.status === 'excluded'
                                          ? '—'
                                          : 'M'}
                                  </b>
                                </WorkButton>
                              ))}
                          </div>
                        </div>
                        <div className="cw-diff-space">
                          {file && (
                            <>
                              <div className="cw-file-heading">
                                <span>{file.path}</span>
                                <IconButton
                                  label={viewed.includes(fileKey) ? '取消已查看' : '标记文件已查看'}
                                  aria-pressed={viewed.includes(fileKey)}
                                  onClick={() =>
                                    setViewed((old) =>
                                      old.includes(fileKey)
                                        ? old.filter((p) => p !== fileKey)
                                        : [...old, fileKey],
                                    )
                                  }
                                >
                                  <CheckCircle
                                    size={18}
                                    weight={viewed.includes(fileKey) ? 'fill' : 'regular'}
                                  />
                                </IconButton>
                              </div>
                              <div
                                className="cw-diff-scroll"
                                ref={diffScroll}
                                onScroll={() =>
                                  diffPositions.current.set(
                                    fileKey,
                                    diffScroll.current?.scrollTop ?? 0,
                                  )
                                }
                                data-testid="diff-scroll"
                              >
                                {file.truncated && (
                                  <div className="cw-inline-warning">
                                    <WarningCircle size={16} />
                                    仅展示已捕获片段，不能据此恢复完整文件。
                                  </div>
                                )}
                                {file.path.startsWith('docs/') && (
                                  <div className="cw-inline-note">
                                    路径调整按删除 / 新增捕获；协议未声明重命名关系。
                                  </div>
                                )}
                                {file.binary ? (
                                  <div className="cw-file-unavailable">
                                    <FileImage size={30} />
                                    <h2>二进制文件</h2>
                                    <p>捕获 {file.size.toLocaleString()} 字节；没有文本差异。</p>
                                  </div>
                                ) : file.status === 'excluded' ? (
                                  <div className="cw-file-unavailable">
                                    <WarningCircle size={28} />
                                    <h2>内容未捕获</h2>
                                    <p>此文件没有可审查或恢复的内容。</p>
                                  </div>
                                ) : (
                                  <FilePatchDiff
                                    key={fileKey}
                                    patch={file.patch}
                                    fileName={file.path}
                                    maxLines={80}
                                    showLineNumbers
                                    selection={selection}
                                    onSelectionChange={setSelection}
                                  />
                                )}
                              </div>
                              {selection && (
                                <div className="cw-selection">
                                  {selection.side === 'LEFT' ? '原文件' : '新文件'} · 第{' '}
                                  {selection.range.start}
                                  {selection.range.end !== selection.range.start
                                    ? `–${selection.range.end}`
                                    : ''}{' '}
                                  行
                                  <WorkButton onClick={() => composer.current?.focus()}>
                                    对此处评论
                                    <ChatCircleText size={14} />
                                  </WorkButton>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="cw-composer">
                      <div className="cw-composer-box">
                        <div className="cw-composer-input">
                          <MemberAvatar member={members[0]} small />
                          <textarea
                            ref={composer}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder={
                              selection
                                ? `评论 ${file.path} 的选中行…`
                                : '补充上下文，或给协作者留一条评论…'
                            }
                            aria-label="写协作评论"
                            rows={1}
                          />
                        </div>
                        <div className="cw-composer-bottom">
                          <span>{state.action ?? '评论留在本页，刷新后清除'}</span>
                          <WorkButton
                            disabled={!comment.trim()}
                            kind="primary"
                            className="cw-primary"
                            onClick={() => {
                              const item: LocalComment = {
                                id: crypto.randomUUID(),
                                text: comment.trim(),
                                anchor:
                                  mode === 'changes' && selection
                                    ? `${file.path} · ${selection.side}:${selection.range.start}-${selection.range.end}`
                                    : undefined,
                              };
                              setComments((old) => ({
                                ...old,
                                [selected.id]: [...(old[selected.id] ?? []), item],
                              }));
                              setComment('');
                              changeMode('context');
                              requestAnimationFrame(() => reader.current?.showComments());
                            }}
                          >
                            <PaperPlaneTilt size={14} />
                            添加评论
                          </WorkButton>
                        </div>
                        {!!comments[selected.id]?.length && (
                          <small className="cw-comment-count">
                            {comments[selected.id].length} 条评论已保留在本页 · 位于上下文末尾
                          </small>
                        )}
                      </div>
                    </div>
                  </div>
                  <aside
                    className={`cw-evidence ${evidenceOpen ? 'open' : ''}`}
                    inert={!evidenceOpen}
                    aria-hidden={!evidenceOpen}
                  >
                    <div>
                      <IconButton
                        label="关闭来源面板"
                        onClick={() => {
                          setEvidenceOpen(false);
                          sourceTrigger.current?.focus();
                        }}
                      >
                        <X size={18} />
                      </IconButton>
                      <Facts activity={selected} />
                    </div>
                  </aside>
                </div>
              </main>
            </Panel>
          </Group>
        )}
        <Dialog.Root
          open={modal !== null}
          onOpenChange={(open) => {
            if (!open) setModal(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="cw-overlay" />
            <Dialog.Content
              className={`cw-dialog ${modal === 'navigation' ? 'cw-navigation-dialog' : ''}`}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                priorFocus.current?.isConnected && priorFocus.current.focus();
              }}
            >
              <Dialog.Title>
                {modal === 'history'
                  ? '我的目录历史'
                  : modal === 'restore'
                    ? '本机恢复预览 · 演练'
                    : modal === 'handoff'
                      ? '准备上下文交接'
                      : modal === 'draft'
                        ? '交接草稿 · 尚未发送'
                        : modal === 'source'
                          ? '来源与保存'
                          : modal === 'navigation'
                            ? '项目活动'
                            : '这个样板的边界'}
              </Dialog.Title>
              <Dialog.Description className="cw-dialog-description">
                {modal === 'history'
                  ? '独立于任务和当前活动，只显示你的目录。'
                  : modal === 'restore'
                    ? '仅演示预览、备份和确认顺序，不调用文件写入。'
                    : modal === 'handoff' || modal === 'draft'
                      ? '明确接收者、上下文和下一步，不启动 Agent，不应用文件。'
                      : modal === 'navigation'
                        ? '选择活动后返回主工作面。'
                        : '展示可核实的事实，不把缺失数据补成完成状态。'}
              </Dialog.Description>
              <Dialog.Close asChild>
                <WorkButton className="cw-dialog-close" aria-label="关闭对话框">
                  <X size={19} />
                </WorkButton>
              </Dialog.Close>
              {modal === 'navigation' && (
                <ActivityIndex
                  activities={activities}
                  selected={selected.id}
                  select={select}
                  query={query}
                  setQuery={setQuery}
                  member={member}
                  setMember={setMember}
                  dense={dense}
                  history={() => setModal('history')}
                />
              )}
              {modal === 'source' && <Facts activity={selected} />}
              {modal === 'help' && (
                <div className="cw-prose">
                  <p>
                    这里有三位成员的日常活动，也可切换到十人、一百条活动。任务、手动保存和捕获日志可以独立存在。
                  </p>
                  <p>
                    使用真实 FilePatchDiff
                    与虚拟列表。会话、评论、交接草稿、状态和恢复演练都使用合成数据；刷新后重置。没有连接新业务接口，没有调用模型或恢复真实文件。
                  </p>
                  <p>
                    正式认证、Convex、store、connector 与默认 Electron
                    入口保持原样。视觉选择之后，才进行正式数据适配与路由迁移。
                  </p>
                </div>
              )}
              {modal === 'history' && (
                <div className="cw-history-list">
                  <div className="cw-directory">
                    <FolderOpen size={20} />
                    <span>
                      我的开发目录<small>来源设备：本机 · 文件仍独立保管</small>
                    </span>
                  </div>
                  {directoryHistory.map((cp) => (
                    <div key={cp.id}>
                      <ClockCounterClockwise size={18} />
                      <span>
                        <strong>{cp.title}</strong>
                        <small>
                          {cp.time} · 未关联任务 ·{' '}
                          {cp.complete ? '本机完整检查点' : '不完整，不能恢复'}
                        </small>
                        <code>{cp.id}</code>
                      </span>
                      <WorkButton
                        disabled={!cp.complete}
                        onClick={() => startRestore(cp.id, cp.title, cp.complete)}
                      >
                        预览恢复
                      </WorkButton>
                    </div>
                  ))}
                  {selected.workspace.own && selected.checkpoint && (
                    <WorkButton
                      disabled={!canPreview(selected)}
                      onClick={() =>
                        startRestore(selected.checkpoint!.id, selected.title, canPreview(selected))
                      }
                    >
                      预览当前活动的本机检查点
                    </WorkButton>
                  )}
                </div>
              )}
              {modal === 'restore' && (
                <div className="cw-restore">
                  <div className="cw-restore-summary">
                    <strong>{restore.title}</strong>
                    <code>{restore.id}</code>
                    <span>我的开发目录 · 本机</span>
                  </div>
                  <ol>
                    <li>在独立预览中检查文件范围</li>
                    <li>确认时先备份当前目录状态</li>
                    <li>再次核对预览有效性，再执行恢复</li>
                  </ol>
                  <div className="cw-preview-files">
                    <span>演练影响范围</span>
                    {restore.paths.map((p) => (
                      <code key={p}>{p}</code>
                    ))}
                  </div>
                  {restore.revision !== restore.capturedRevision && (
                    <p className="cw-inline-warning" role="alert">
                      预览已过期：目录在预览后发生变化。请重新生成预览。
                    </p>
                  )}
                  {restore.result && (
                    <p role="status" className="cw-inline-note">
                      {restore.result}
                    </p>
                  )}
                  <label className="cw-check">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />
                    我已核对范围，理解确认前必须备份当前状态
                  </label>
                  <div className="cw-dialog-actions">
                    <WorkButton
                      onClick={() =>
                        setRestore((old) => ({ ...old, revision: old.revision + 1, result: '' }))
                      }
                    >
                      模拟目录变化
                    </WorkButton>
                    {restore.revision !== restore.capturedRevision ? (
                      <WorkButton
                        kind="primary"
                        className="cw-primary"
                        onClick={() => {
                          setRestore((old) => ({
                            ...old,
                            capturedRevision: old.revision,
                            result: '',
                          }));
                          setAck(false);
                        }}
                      >
                        重新生成预览
                      </WorkButton>
                    ) : (
                      <WorkButton
                        kind="primary"
                        className="cw-primary"
                        disabled={!ack || !restore.complete || restore.confirmed}
                        onClick={() => {
                          if (
                            !ack ||
                            !restore.complete ||
                            restore.capturedRevision !== restore.revision
                          )
                            return;
                          setRestore((old) => ({
                            ...old,
                            confirmed: true,
                            result:
                              '演练完成：核对 → 备份当前状态 → 恢复。没有创建真实备份或修改文件。',
                          }));
                        }}
                      >
                        确认演练
                      </WorkButton>
                    )}
                  </div>
                </div>
              )}
              {modal === 'handoff' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setDraft({
                      recipient,
                      work: selected.id,
                      title: selected.title,
                      request: request.trim(),
                      file: file?.path ?? '',
                      session: selected.session?.id,
                      throughSeq: selected.session?.messages.at(-1)?.seq,
                      checkpoint:
                        selected.checkpoint?.serverComplete &&
                        selected.checkpoint.integrity === 'verified'
                          ? selected.checkpoint.id
                          : undefined,
                    });
                    setModal('draft');
                  }}
                >
                  <label>
                    接收者
                    <span className="cw-select-field">
                      <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                        {members
                          .filter((m) => m.id !== 'me')
                          .slice(0, dense ? 9 : 2)
                          .map((m) => (
                            <option key={m.id}>{m.name}</option>
                          ))}
                      </select>
                      <CaretDown aria-hidden="true" />
                    </span>
                  </label>
                  <div className="cw-handoff-context">
                    <span>当前上下文</span>
                    <strong>{selected.title}</strong>
                    <code>{file?.path}</code>
                    {selected.session && (
                      <small>
                        捕获会话 {selected.session.id} · 截止序号{' '}
                        {selected.session.messages.at(-1)?.seq}
                      </small>
                    )}
                  </div>
                  <label>
                    希望对方接着做什么
                    <textarea
                      value={request}
                      onChange={(e) => setRequest(e.target.value)}
                      rows={4}
                      required
                    />
                  </label>
                  <div className="cw-dialog-actions">
                    <WorkButton type="button" onClick={() => setModal(null)}>
                      取消
                    </WorkButton>
                    <WorkButton
                      type="submit"
                      kind="primary"
                      className="cw-primary"
                      disabled={!request.trim()}
                    >
                      保留交接草稿
                    </WorkButton>
                  </div>
                </form>
              )}
              {modal === 'draft' && draft && (
                <div className="cw-draft">
                  <dl>
                    <dt>接收者</dt>
                    <dd>{draft.recipient}</dd>
                    <dt>工作</dt>
                    <dd>{draft.title}</dd>
                    <dt>下一步</dt>
                    <dd>{draft.request}</dd>
                    <dt>原始文件路径</dt>
                    <dd>
                      <code>{draft.file}</code>
                    </dd>
                    <dt>会话范围</dt>
                    <dd>
                      {draft.session
                        ? `${draft.session} · 截止 #${draft.throughSeq}`
                        : '无已关联会话'}
                    </dd>
                    <dt>完整共享检查点</dt>
                    <dd>{draft.checkpoint ?? '无可用关联，不伪造'}</dd>
                  </dl>
                  <p className="cw-inline-note">
                    草稿仅存在于本页，尚未发送。对方不会收到消息或文件。
                  </p>
                  <div className="cw-dialog-actions">
                    <WorkButton onClick={() => setModal('handoff')}>编辑草稿</WorkButton>
                    <WorkButton
                      kind="primary"
                      className="cw-primary"
                      onClick={() => setModal(null)}
                    >
                      完成
                    </WorkButton>
                  </div>
                </div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </Tooltip.Provider>
  );
}
