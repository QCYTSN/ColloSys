import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { ConversationHeaderBar } from '../components/conversation/ConversationHeaderBar';

import { FilePatchDiff } from '../components/DiffView';
import { shouldFollowStreaming } from '../components/conversationScroll';
import { AppIcon, PeanutMark, type AppIconName } from './DesignIcons';
import {
  designActivities,
  checkpointStates,
  statusLabels,
  type DesignActivity,
  type DesignMessage,
  type DesignTab,
} from './DesignScenario';
import './design-lab.css';

const DesignReference = lazy(() =>
  import('./DesignReference').then((module) => ({ default: module.DesignReference })),
);
const syntaxPlugins = [rehypeHighlight];

// THESIS: Follow a teammate's work with its conversation and file evidence in view.
// OWN-WORLD: Graphite text, white reading surface, cool neutral index, copper mark.
// STORY: Scan work, read its context, inspect a file, then choose a saved state.
// FIRST VIEWPORT: One project bar; activity index; reader with contextual evidence dock.
// FORM: User-pinned professional workbench overrides direction seed 30c8b911.
// Scope and action ownership precede decoration. No full-product migration.
// FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md

function Avatar({ item, small = false }: { item: DesignActivity; small?: boolean }) {
  return (
    <span
      className={`pn-avatar pn-${item.color}${small ? ' pn-avatar-small' : ''}`}
      aria-hidden="true"
    >
      {item.initials}
    </span>
  );
}
function Status({ item }: { item: DesignActivity }) {
  const name: AppIconName =
    item.progress === 'complete' ? 'complete' : item.progress === 'running' ? 'circle' : 'clock';
  return (
    <span className={`pn-status pn-status-${item.progress}`}>
      <AppIcon name={name} size={14} />
      {statusLabels[item.progress]}
    </span>
  );
}
function SyncNotice({ item }: { item: DesignActivity }) {
  if (item.sync === 'received') return null;
  return (
    <span className={`pn-sync pn-sync-${item.sync}`}>
      <AppIcon name={item.sync === 'offline' ? 'offline' : 'warning'} size={14} />
      {item.sync === 'offline' ? '设备离线' : '共享失败'}
    </span>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  ...props
}: { icon: AppIconName; label: string; onClick?: () => void } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
>) {
  return (
    <button
      type="button"
      className="pn-icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      {...props}
    >
      <AppIcon name={icon} />
    </button>
  );
}
function readLayout(): Layout | undefined {
  try {
    const value = JSON.parse(localStorage.getItem('collo.design.layout.v2') || 'null');
    if (
      value &&
      Number.isFinite(value.index) &&
      value.index >= 16 &&
      value.index <= 45 &&
      Number.isFinite(value.reader)
    )
      return value;
  } catch {
    /* Private browsing may deny storage. */
  }
}
const initialLayout = { index: 23, reader: 77 };

export default function DesignEntry() {
  const [params] = useSearchParams();
  return params.get('reference') === 'codecast' ? (
    <Suspense fallback={<div className="pn-reference-loading">正在打开原生会话对照…</div>}>
      <DesignReference />
    </Suspense>
  ) : (
    <DesignLab />
  );
}
function DesignLab() {
  const [params, setParams] = useSearchParams();
  const item = designActivities.find((a) => a.id === params.get('activity')) || designActivities[0];
  const tab: DesignTab =
    params.get('view') === 'changes'
      ? 'changes'
      : params.get('view') === 'checkpoints'
        ? 'checkpoints'
        : 'conversation';
  const [member, setMember] = useState('all');
  const [query, setQuery] = useState('');
  const [bookmarked, setBookmarked] = useState<string[]>(['reading']);
  const [onlySaved, setOnlySaved] = useState(false);
  const [scene, setScene] = useState<'ready' | 'loading' | 'empty' | 'error'>('ready');
  const [compact, setCompact] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [hideIndex, setHideIndex] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 800px)').matches);
  const [modal, setModal] = useState<'settings' | 'restore' | null>(null);
  const [checkpointSelection, setCheckpointSelection] = useState(0);
  const [consent, setConsent] = useState(false);
  const [restored, setRestored] = useState(false);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState('');
  const [extra, setExtra] = useState<Record<string, DesignMessage[]>>({});
  const [streaming, setStreaming] = useState(false);
  const focusReturn = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const compactEvidenceRef = useRef<HTMLDetailsElement>(null);
  const replayTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const layout = useMemo(() => readLayout() || initialLayout, []);
  const fileSelections = useRef(new Map<string, string>());
  const ownWorkspace = item.person === '你';
  const previewCheckpoint = checkpointStates(item)[checkpointSelection];
  const originalPath = params.get('project')
    ? `/projects/${encodeURIComponent(params.get('project')!)}?tab=workspaces`
    : '/projects';
  const filtered = designActivities.filter(
    (a) =>
      (member === 'all' || a.person === member) &&
      (!onlySaved || bookmarked.includes(a.id)) &&
      `${a.title} ${a.description} ${a.agent} ${a.person} ${a.files.map((f) => f.path).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  function navigate(activity: string, view: DesignTab = tab) {
    if (compactEvidenceRef.current) compactEvidenceRef.current.open = false;
    if (narrow) setHideIndex(true);
    setParams((old) => {
      const next = new URLSearchParams(old);
      fileSelections.current.set(item.id, old.get('file') || '0');
      next.set('activity', activity);
      next.set('view', view);
      next.set('file', fileSelections.current.get(activity) || '0');
      return next;
    });
  }
  function openModal(next: 'settings' | 'restore', checkpoint = 0) {
    setCheckpointSelection(checkpoint);
    focusReturn.current = document.activeElement as HTMLElement;
    setConsent(false);
    setRestored(false);
    setStale(false);
    setModal(next);
  }
  function toggleBookmark() {
    setBookmarked((items) =>
      items.includes(item.id) ? items.filter((id) => id !== item.id) : [...items, item.id],
    );
  }
  function replay() {
    if (replayTimer.current) return;
    const activityId = item.id;
    const id = `replay-${Date.now()}`;
    const words =
      '这是一条样板回放消息。切换到其他会话再回来，会保留你的阅读位置。正在阅读历史时，界面只提示新内容；点击回到最新后才会继续跟随。此回放没有运行任何 Agent。'.split(
        '',
      );
    let count = 0;
    setStreaming(true);
    setExtra((prev) => ({
      ...prev,
      [activityId]: [
        ...(prev[activityId] || []),
        { id, role: 'assistant', text: '', time: '现在' },
      ],
    }));
    replayTimer.current = setInterval(() => {
      count += 4;
      setExtra((prev) => ({
        ...prev,
        [activityId]: prev[activityId].map((m) =>
          m.id === id ? { ...m, text: words.slice(0, count).join('') } : m,
        ),
      }));
      if (count >= words.length) {
        clearInterval(replayTimer.current!);
        replayTimer.current = null;
        setStreaming(false);
      }
    }, 90);
  }
  useEffect(() => {
    const contract = document.createComment(
      'THESIS: Read team work beside its evidence. OWN-WORLD: graphite, cool neutral index, white reader, copper peanut, Google Sans, Phosphor. STORY: activity to conversation to file to saved state. FIRST VIEWPORT: project bar, activity index, reader, contextual evidence. FORM: user-pinned professional workbench; seed 30c8b911 overridden by brief. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md',
    );
    document.body.prepend(contract);
    return () => contract.remove();
  }, []);
  useEffect(
    () => () => {
      if (replayTimer.current) clearInterval(replayTimer.current);
    },
    [],
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const changed = () => setNarrow(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setHideIndex(false);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const messages = [...item.messages, ...(extra[item.id] || [])];
  const selectedFile = Math.max(
    0,
    Math.min(Number(params.get('file')) || 0, item.files.length - 1),
  );

  const activityIndex = (
    <section className="pn-index" aria-label="团队活动索引">
      <div className="pn-index-heading">
        <h1>团队动态</h1>
        <span>{filtered.length}</span>
        <Menu.Root>
          <Menu.Trigger asChild>
            <button className="pn-icon-button" aria-label="按成员筛选">
              <AppIcon name="filter" size={17} />
            </button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="pn-surface pn-menu" sideOffset={8} align="end">
              <Menu.Label className="pn-menu-label">查看成员</Menu.Label>
              <Menu.RadioGroup value={member} onValueChange={setMember}>
                {[
                  ['all', '所有成员'],
                  ['你', '你'],
                  ['林舟', '林舟'],
                  ['陈一', '陈一'],
                ].map(([value, label]) => (
                  <Menu.RadioItem className="pn-menu-item" value={value} key={value}>
                    <span>{label}</span>
                    <Menu.ItemIndicator>
                      <AppIcon name="check" size={16} />
                    </Menu.ItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <nav className="pn-index-views" aria-label="活动范围">
        <button
          aria-current={!onlySaved ? 'page' : undefined}
          onClick={() => {
            setOnlySaved(false);
            setScene('ready');
          }}
        >
          全部活动
        </button>
        <button
          aria-current={onlySaved ? 'page' : undefined}
          onClick={() => {
            setOnlySaved(true);
            setScene('ready');
          }}
        >
          我的关注<span>{bookmarked.length}</span>
        </button>
      </nav>
      <label className="pn-search">
        <AppIcon name="search" size={16} />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索动态、成员或文件"
          aria-label="搜索动态"
        />
        <kbd>Ctrl K</kbd>
      </label>
      {member !== 'all' && (
        <button className="pn-filter-clear" onClick={() => setMember('all')}>
          {member}
          <AppIcon name="close" size={13} />
          清除筛选
        </button>
      )}
      <div className="pn-index-scroll">
        {scene === 'loading' ? (
          <div className="pn-skeletons" aria-label="正在加载活动" role="status">
            {[1, 2, 3, 4].map((n) => (
              <div className="pn-skeleton" key={n}>
                <i />
                <b />
                <span />
              </div>
            ))}
          </div>
        ) : scene === 'error' ? (
          <Empty
            icon="warning"
            title="暂时无法读取动态"
            text="已保留你的选择。重新连接后继续查看。"
          >
            <button className="pn-button" onClick={() => setScene('ready')}>
              重新连接
            </button>
          </Empty>
        ) : scene === 'empty' || filtered.length === 0 ? (
          <Empty
            icon="search"
            title={query || member !== 'all' ? '没有匹配的动态' : '这里还没有动态'}
            text="尝试清除筛选，或回到示例场景。"
          >
            <button
              className="pn-button"
              onClick={() => {
                setScene('ready');
                setQuery('');
                setMember('all');
                setOnlySaved(false);
              }}
            >
              显示所有动态
            </button>
          </Empty>
        ) : (
          <>
            <div className="pn-day">
              最近动态<span>10 月 24—25 日</span>
            </div>
            {filtered.map((activity) => (
              <button
                key={activity.id}
                data-activity={activity.id}
                className={`pn-activity${item.id === activity.id ? ' is-selected' : ''}`}
                aria-current={item.id === activity.id ? 'true' : undefined}
                onClick={() =>
                  navigate(activity.id, activity.messages.length ? 'conversation' : 'changes')
                }
              >
                <div className="pn-activity-person">
                  <Avatar item={activity} small />
                  <strong>{activity.person}</strong>
                  <span>{activity.agent}</span>
                  <time>{activity.time}</time>
                </div>
                <div className="pn-activity-title">{activity.title}</div>
                <div className="pn-activity-foot">
                  <Status item={activity} />
                  <SyncNotice item={activity} />
                  <span className="pn-file-count">{activity.files.length} 个文件</span>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
      <div className="pn-index-bottom">
        <AppIcon name="members" size={15} />
        <span>产品开发小组</span>
        <span>3 位成员</span>
      </div>
    </section>
  );

  return (
    <div
      className={`pn-surface pn-lab${compact ? ' pn-compact' : ''}${reduceMotion ? ' pn-reduce-motion' : ''}`}
      data-testid="design-lab"
    >
      <a className="pn-skip" href="#pn-reading">
        跳到工作详情
      </a>
      <header className="pn-topbar">
        <a className="pn-brand" href="/design-lab">
          <PeanutMark />
          <span>ColloSys</span>
        </a>
        <div className="pn-project-scope">
          <AppIcon name="folder" size={16} />
          <strong>协作工作台</strong>
          <span>项目</span>
        </div>
        <div className="pn-topbar-actions">
          <span className="pn-test-label">设计样板 · 示例数据</span>
          <a href={originalPath} className="pn-original">
            当前产品
            <AppIcon name="external" size={14} />
          </a>
          <IconButton icon="settings" label="显示设置" onClick={() => openModal('settings')} />
          <Avatar item={designActivities[2]} small />
        </div>
      </header>
      <div className="pn-workspace">
        <div className="pn-stage">
          <Group
            id="design-workbench"
            defaultLayout={layout}
            onLayoutChange={(value) => {
              if (narrow || hideIndex) return;
              try {
                localStorage.setItem('collo.design.layout.v2', JSON.stringify(value));
              } catch {}
            }}
          >
            {!hideIndex && (
              <>
                <Panel
                  id="index"
                  defaultSize={narrow ? '100%' : '23%'}
                  minSize={narrow ? '0px' : '280px'}
                  maxSize={narrow ? '100%' : '45%'}
                >
                  {activityIndex}
                </Panel>
                {!narrow && <Separator className="pn-separator" aria-label="调整活动列表宽度" />}
              </>
            )}
            {(!narrow || hideIndex) && (
              <Panel id="reader" minSize={narrow ? '0px' : '380px'}>
                <main className="pn-reader" id="pn-reading" tabIndex={-1}>
                  <ConversationHeaderBar
                    className="pn-context-header"
                    lead={
                      <IconButton
                        icon={hideIndex ? 'list' : 'panel'}
                        label={hideIndex ? '显示活动列表' : '收起活动列表'}
                        onClick={() => setHideIndex(!hideIndex)}
                      />
                    }
                    title={
                      <div className="pn-context-title">
                        <h2 title={item.title}>{item.title}</h2>
                        <div>
                          <span>{item.person}</span>
                          <span>{item.agent}</span>
                          <span>{item.task}</span>
                          <time>{item.time}</time>
                        </div>
                      </div>
                    }
                    actions={
                      <>
                        <Status item={item} />
                        <IconButton
                          icon="bookmark"
                          label={bookmarked.includes(item.id) ? '取消关注' : '关注这项工作'}
                          onClick={toggleBookmark}
                          aria-pressed={bookmarked.includes(item.id)}
                        />
                        <Menu.Root>
                          <Menu.Trigger asChild>
                            <button className="pn-icon-button" aria-label="更多操作">
                              <AppIcon name="more" size={22} />
                            </button>
                          </Menu.Trigger>
                          <Menu.Portal>
                            <Menu.Content className="pn-surface pn-menu" align="end" sideOffset={7}>
                              <Menu.Item
                                className="pn-menu-item"
                                onSelect={() => {
                                  navigator.clipboard
                                    .writeText(location.href)
                                    .then(() => setNotice('已复制此场景链接'))
                                    .catch(() => setNotice('复制失败，请从地址栏复制链接'));
                                }}
                              >
                                <AppIcon name="copy" />
                                复制当前链接
                              </Menu.Item>
                              <Menu.Item
                                className="pn-menu-item"
                                disabled={streaming}
                                onSelect={replay}
                              >
                                <AppIcon name="play" />
                                回放一条新回复
                              </Menu.Item>
                              <Menu.Item
                                className="pn-menu-item"
                                onSelect={() =>
                                  setParams((old) => {
                                    const next = new URLSearchParams(old);
                                    next.set('reference', 'codecast');
                                    return next;
                                  })
                                }
                              >
                                <AppIcon name="external" />
                                同内容原生会话对照
                              </Menu.Item>
                              <Menu.Separator className="pn-menu-separator" />
                              <Menu.Label className="pn-menu-label">设计状态检查</Menu.Label>
                              {(
                                [
                                  ['ready', '正常内容'],
                                  ['loading', '加载状态'],
                                  ['empty', '空状态'],
                                  ['error', '连接失败'],
                                ] as const
                              ).map(([value, label]) => (
                                <Menu.Item
                                  className="pn-menu-item"
                                  key={value}
                                  onSelect={() => setScene(value)}
                                >
                                  {label}
                                  {scene === value && <AppIcon name="check" size={15} />}
                                </Menu.Item>
                              ))}
                            </Menu.Content>
                          </Menu.Portal>
                        </Menu.Root>
                      </>
                    }
                  />
                  <details className="pn-compact-evidence" ref={compactEvidenceRef}>
                    <summary>
                      资料与状态 <Status item={item} />
                      <AppIcon name="chevron" size={14} />
                    </summary>
                    <Evidence
                      item={item}
                      onFiles={(file) => {
                        if (compactEvidenceRef.current) compactEvidenceRef.current.open = false;
                        setParams((old) => {
                          const next = new URLSearchParams(old);
                          next.set('view', 'changes');
                          next.set('file', String(file));
                          return next;
                        });
                      }}
                      onHistory={() => navigate(item.id, 'checkpoints')}
                    />
                  </details>
                  <Tabs.Root
                    className="pn-detail-tabs"
                    value={tab}
                    onValueChange={(value) => navigate(item.id, value as DesignTab)}
                  >
                    <Tabs.List className="pn-tab-list" aria-label="工作详情">
                      <Tabs.Trigger value="conversation">
                        <AppIcon name="conversation" size={16} />
                        会话<span>{messages.length}</span>
                      </Tabs.Trigger>
                      <Tabs.Trigger value="changes">
                        <AppIcon name="code" size={16} />
                        文件变化<span>{item.files.length}</span>
                      </Tabs.Trigger>
                      <Tabs.Trigger value="checkpoints">
                        <AppIcon name="checkpoint" size={16} />
                        检查点<span>2</span>
                      </Tabs.Trigger>
                    </Tabs.List>
                    <Tabs.Content
                      value="conversation"
                      className="pn-tab-content"
                      forceMount
                      hidden={tab !== 'conversation'}
                    >
                      <div className="pn-reading-layout">
                        <Conversation
                          key={item.id}
                          item={item}
                          messages={messages}
                          streaming={streaming}
                          onFiles={() => navigate(item.id, 'changes')}
                        />
                        <Evidence
                          item={item}
                          onFiles={(file) => {
                            if (compactEvidenceRef.current) compactEvidenceRef.current.open = false;
                            setParams((old) => {
                              const next = new URLSearchParams(old);
                              next.set('view', 'changes');
                              next.set('file', String(file));
                              return next;
                            });
                          }}
                          onHistory={() => navigate(item.id, 'checkpoints')}
                        />
                      </div>
                    </Tabs.Content>
                    <Tabs.Content
                      value="changes"
                      className="pn-tab-content"
                      forceMount
                      hidden={tab !== 'changes'}
                    >
                      <Changes
                        item={item}
                        selected={selectedFile}
                        onSelect={(file) =>
                          setParams((old) => {
                            const next = new URLSearchParams(old);
                            next.set('file', String(file));
                            return next;
                          })
                        }
                      />
                    </Tabs.Content>
                    <Tabs.Content
                      value="checkpoints"
                      className="pn-tab-content"
                      forceMount
                      hidden={tab !== 'checkpoints'}
                    >
                      <Checkpoints
                        key={item.id}
                        item={item}
                        onPreview={(index) => openModal('restore', index)}
                      />
                    </Tabs.Content>
                  </Tabs.Root>
                </main>
              </Panel>
            )}
          </Group>
        </div>
      </div>
      {notice && (
        <div className="pn-toast" role="status">
          <AppIcon name="check" />
          {notice}
        </div>
      )}
      <Dialog.Root
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="pn-surface pn-overlay" />
          <Dialog.Content
            aria-modal="true"
            className={`pn-surface pn-dialog${reduceMotion ? ' pn-reduce-motion' : ''}`}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              focusReturn.current?.focus();
            }}
          >
            <Dialog.Close asChild>
              <button className="pn-icon-button pn-dialog-close" aria-label="关闭对话框">
                <AppIcon name="close" />
              </button>
            </Dialog.Close>
            {modal === 'settings' ? (
              <>
                <Dialog.Title>显示设置</Dialog.Title>
                <Dialog.Description>这些设置仅作用于当前设计样板。</Dialog.Description>
                <label className="pn-setting">
                  <div>
                    <strong>紧凑活动列表</strong>
                    <span>缩短行间距，保留完整标题与状态。</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={compact}
                    onChange={(e) => setCompact(e.target.checked)}
                  />
                </label>
                <label className="pn-setting">
                  <div>
                    <strong>减少动效</strong>
                    <span>系统的减少动态效果设置也始终生效。</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={reduceMotion}
                    onChange={(e) => setReduceMotion(e.target.checked)}
                  />
                </label>
                <Dialog.Close asChild>
                  <button className="pn-button pn-button-primary">完成</button>
                </Dialog.Close>
              </>
            ) : (
              <>
                <div className="pn-dialog-symbol">
                  <AppIcon name={restored ? 'complete' : 'checkpoint'} size={24} />
                </div>
                <Dialog.Title>{restored ? '恢复流程演练完成' : '预览这份检查点'}</Dialog.Title>
                <Dialog.Description>
                  {restored
                    ? '这次只验证操作流程，没有修改任何真实文件。'
                    : ownWorkspace
                      ? '先核对来源、目标目录与影响范围，再决定是否恢复。'
                      : '这是队友设备上的检查点。可以查看范围，不能恢复到你的目录。'}
                </Dialog.Description>
                <div className="pn-restore-meta">
                  <div>
                    <span>检查点</span>
                    <code>{previewCheckpoint.id}</code>
                  </div>
                  <div>
                    <span>捕获时间</span>
                    <strong>{previewCheckpoint.time}</strong>
                  </div>
                  <div>
                    <span>源设备</span>
                    <strong>
                      {item.person}的工作区 · {ownWorkspace ? '本机' : '队友设备'}示例
                    </strong>
                  </div>
                  <div>
                    <span>{ownWorkspace ? '目标目录' : '源目录'}</span>
                    <code>
                      {ownWorkspace
                        ? 'D:/Projects/collosys-workbench'
                        : `${item.person}的设备 / collosys-workbench`}
                    </code>
                  </div>
                  <div>
                    <span>保存情况</span>
                    <strong>{ownWorkspace ? '本机' : '源设备'}已保存 · 尚无异地备份</strong>
                  </div>
                </div>
                <div className="pn-restore-files">
                  {item.files.map((file) => (
                    <div key={file.path}>
                      <AppIcon name="file" size={15} />
                      <span title={file.path}>{file.path}</span>
                    </div>
                  ))}
                </div>
                <div className="pn-restore-boundary">
                  <AppIcon name="lock" size={16} />
                  <p>
                    {ownWorkspace
                      ? '正式恢复会先备份当前状态，并再次检查文件是否变化。队友的目录保持独立。'
                      : '仅来源成员可在自己的设备上执行恢复。此处仅查看示例范围。'}
                  </p>
                </div>
                {stale && (
                  <p className="pn-inline-error" role="alert">
                    预览后文件发生了变化。需要重新预览，当前不能确认。
                  </p>
                )}
                {!restored && ownWorkspace && (
                  <>
                    <label className="pn-confirm">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      我已核对范围，进行一次不写入文件的恢复演练
                    </label>
                    <div className="pn-dialog-actions">
                      <button
                        className="pn-text-button"
                        onClick={() => {
                          setStale(!stale);
                          setConsent(false);
                        }}
                      >
                        {stale ? '重新预览' : '模拟预览失效'}
                      </button>
                      <button
                        className="pn-button pn-button-primary"
                        disabled={!consent || stale}
                        onClick={() => setRestored(true)}
                      >
                        确认演练
                        <AppIcon name="next" size={15} />
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: AppIconName;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="pn-empty">
      <AppIcon name={icon} size={25} />
      <strong>{title}</strong>
      <p>{text}</p>
      {children}
    </div>
  );
}

const readingPositions = new Map<string, { top: number; reading: boolean }>();
function Conversation({
  item,
  messages,
  streaming,
  onFiles,
}: {
  item: DesignActivity;
  messages: DesignMessage[];
  streaming: boolean;
  onFiles: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const reading = useRef(readingPositions.get(item.id)?.reading ?? true);
  const [unread, setUnread] = useState(false);
  const initialized = useRef(false);
  const previousTail = useRef(messages.at(-1)?.text);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (!initialized.current) {
      el.scrollTop = readingPositions.get(item.id)?.top ?? 0;
      initialized.current = true;
      return;
    }
    if (previousTail.current !== messages.at(-1)?.text) {
      if (shouldFollowStreaming(reading.current)) el.scrollTop = el.scrollHeight;
      else setUnread(true);
    }
    previousTail.current = messages.at(-1)?.text;
  }, [messages]);
  return (
    <div className="pn-conversation-wrap">
      <div
        className="pn-conversation"
        ref={scroller}
        data-testid="design-conversation"
        onScroll={() => {
          const el = scroller.current!;
          reading.current = el.scrollHeight - el.clientHeight - el.scrollTop > 30;
          readingPositions.set(item.id, { top: el.scrollTop, reading: reading.current });
          if (!reading.current) setUnread(false);
        }}
      >
        {messages.length === 0 ? (
          <Empty
            icon="code"
            title="这次是手动保存的改动"
            text="没有关联的 Agent 会话。文件变化和检查点仍然可以查看。"
          >
            <button className="pn-button" onClick={onFiles}>
              查看文件变化
              <AppIcon name="next" size={15} />
            </button>
          </Empty>
        ) : (
          <div className="pn-transcript">
            {messages.map((message) => (
              <article className={`pn-message pn-message-${message.role}`} key={message.id}>
                <div className="pn-message-heading">
                  {message.role === 'user' ? (
                    <Avatar item={item} small />
                  ) : (
                    <span className="pn-agent-mark">
                      <AppIcon name="agent" size={16} />
                    </span>
                  )}
                  <strong>{message.role === 'user' ? item.person : item.agent}</strong>
                  <span>{message.role === 'user' ? '需求' : 'Agent'}</span>
                  <time>{message.time}</time>
                </div>
                <div className="pn-message-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={syntaxPlugins}>
                    {message.text}
                  </ReactMarkdown>
                </div>
              </article>
            ))}
            <button className="pn-related-files" onClick={onFiles}>
              <span className="pn-related-icon">
                <AppIcon name="code" size={19} />
              </span>
              <span>
                <strong>查看这项工作的文件变化</strong>
                <small>{item.files.length} 个文件</small>
              </span>
              <AppIcon name="next" size={18} />
            </button>
            {streaming && (
              <div className="pn-stream-status" role="status">
                <AppIcon name="loading" className="pn-spin" size={15} />
                正在回放示例回复
              </div>
            )}
          </div>
        )}
      </div>
      {unread && (
        <button
          className="pn-unread"
          onClick={() => {
            const el = scroller.current!;
            reading.current = false;
            el.scrollTop = el.scrollHeight;
            setUnread(false);
          }}
        >
          <AppIcon name="down" size={14} />
          有新内容 · 回到最新
        </button>
      )}
    </div>
  );
}

function Evidence({
  item,
  onFiles,
  onHistory,
}: {
  item: DesignActivity;
  onFiles: (index: number) => void;
  onHistory: () => void;
}) {
  return (
    <aside className="pn-evidence" aria-label="当前工作的关联资料">
      <h3>关联资料</h3>
      <p className="pn-evidence-summary">{item.description}</p>
      <dl className="pn-context-facts">
        <div>
          <dt>任务</dt>
          <dd>{item.task}</dd>
        </div>
        <div>
          <dt>分支</dt>
          <dd>
            <AppIcon name="branch" size={14} />
            <span title={item.branch}>{item.branch}</span>
          </dd>
        </div>
      </dl>
      <section>
        <div className="pn-evidence-heading">
          <h4>文件变化</h4>
          <span>{item.files.length}</span>
        </div>
        <div className="pn-evidence-files">
          {item.files.map((file, index) => (
            <button key={file.path} onClick={() => onFiles(index)} title={file.path}>
              <AppIcon name="file" size={16} />
              <span>
                <strong>{file.path.split('/').at(-1)}</strong>
                <small>{file.path.split('/').slice(0, -1).join('/')}</small>
              </span>
              <em className={`pn-file-${file.status}`}>
                {file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
              </em>
            </button>
          ))}
        </div>
      </section>
      <section className="pn-evidence-history">
        <div className="pn-evidence-heading">
          <h4>保存状态</h4>
          <AppIcon name="checkpoint" size={15} />
        </div>
        <p>
          <AppIcon name="complete" size={15} />
          {item.person === '你' ? '本机' : '源设备'}已保存<time>{item.time}</time>
        </p>
        <p className="pn-backup-state">
          <AppIcon name="cloud" size={15} />
          未异地备份
        </p>
        <button className="pn-history-link" onClick={onHistory}>
          查看检查点历史
          <AppIcon name="next" size={15} />
        </button>
      </section>
      {item.sync !== 'received' && (
        <section className="pn-transport-notice">
          <SyncNotice item={item} />
          <p>
            {item.sync === 'offline'
              ? '当前显示此前收到的记录。'
              : '记录保留在源设备，等待重新发送。'}
          </p>
        </section>
      )}
      <div className="pn-evidence-boundary">
        <AppIcon name="lock" size={14} />
        <span>查看不会修改你的目录</span>
      </div>
    </aside>
  );
}
function Changes({
  item,
  selected,
  onSelect,
}: {
  item: DesignActivity;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const file = item.files[selected] || item.files[0];
  return (
    <div className="pn-changes">
      <aside className="pn-change-index">
        <div className="pn-change-summary">
          <span>{item.files.length} 个文件</span>
          <span className="pn-diff-totals">
            <b>+{item.files.reduce((n, f) => n + f.added, 0)}</b>
            <i>−{item.files.reduce((n, f) => n + f.removed, 0)}</i>
          </span>
        </div>
        <div className="pn-file-list" aria-label="变化文件">
          {item.files.map((f, i) => (
            <button
              key={f.path}
              onClick={() => onSelect(i)}
              aria-pressed={selected === i}
              className={selected === i ? 'is-selected' : ''}
              title={f.path}
            >
              <AppIcon name="file" size={16} />
              <span>
                <strong>{f.path.split('/').at(-1)}</strong>
                <small>{f.path.split('/').slice(0, -1).join('/')}</small>
              </span>
              <em className={`pn-file-${f.status}`}>
                {f.status === 'added' ? 'A' : f.status === 'deleted' ? 'D' : 'M'}
              </em>
            </button>
          ))}
        </div>
        <p className="pn-change-owner">
          <AppIcon name="device" size={14} />
          {item.person}的工作区
        </p>
      </aside>
      <div className="pn-diff-reader">
        <div className="pn-diff-caption">
          <span>上次捕获</span>
          <AppIcon name="next" size={13} />
          <span>当前检查点</span>
          <small>统一差异</small>
        </div>
        <div className="pn-file-path">{file.path}</div>
        <div className="pn-diff" data-testid="design-diff">
          <FilePatchDiff patch={file.patch} fileName={file.path} maxLines={120} showLineNumbers />
        </div>
        <div className="pn-evidence-note">
          <AppIcon name="lock" size={14} />
          这里只查看差异。完整文件保留在源设备，查看不会应用到你的目录。
        </div>
      </div>
    </div>
  );
}

function Checkpoints({
  item,
  onPreview,
}: {
  item: DesignActivity;
  onPreview: (index: number) => void;
}) {
  const [inspected, setInspected] = useState<number | null>(null);
  return (
    <div className="pn-checkpoints">
      <div className="pn-checkpoint-intro">
        <div>
          <h3>检查点历史</h3>
          <p>{item.person}的工作区 · 完整文件保留在源设备</p>
        </div>
        <span>2 个保存状态</span>
      </div>
      {checkpointStates(item).map((checkpoint, index) => (
        <div className="pn-checkpoint-row" key={checkpoint.id}>
          <div className="pn-checkpoint-line">
            <span />
            <i />
          </div>
          <div className="pn-checkpoint-content">
            <div>
              <strong>{index === 0 ? '当前捕获' : '修改前'}</strong>
              <time>{checkpoint.time}</time>
            </div>
            <p>{checkpoint.title}</p>
            <code>{checkpoint.id}</code>
            <div className="pn-storage-states">
              <span>
                <AppIcon name="complete" size={14} />
                {item.person === '你' ? '本机' : '源设备'}已保存
              </span>
              <span>
                <AppIcon name="cloud" size={14} />
                未异地备份
              </span>
            </div>
            {item.person === '你' ? (
              <button className="pn-button" onClick={() => onPreview(index)}>
                预览恢复范围
                <AppIcon name="next" size={14} />
              </button>
            ) : (
              <>
                <button
                  className="pn-button pn-scope-toggle"
                  aria-expanded={inspected === index}
                  aria-controls={`scope-${checkpoint.id}`}
                  onClick={() => setInspected(inspected === index ? null : index)}
                >
                  {inspected === index ? '收起文件范围' : '查看文件范围'}
                  <AppIcon name="chevron" size={14} />
                </button>
                <div
                  className="pn-inline-preview"
                  id={`scope-${checkpoint.id}`}
                  data-open={inspected === index}
                  aria-hidden={inspected !== index}
                  inert={inspected !== index}
                >
                  <div>
                    <section aria-label="检查点文件范围">
                      <div className="pn-scope-owner">
                        <AppIcon name="device" size={15} />
                        <strong>{item.person}的设备</strong>
                        <span>
                          {checkpoint.id} · {item.files.length} 个文件
                        </span>
                      </div>
                      <p>源目录：{item.person}的设备 / collosys-workbench</p>
                      <ul>
                        {item.files.map((file) => (
                          <li key={file.path}>
                            <AppIcon name="file" size={14} />
                            <span>{file.path}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="pn-scope-boundary">
                        <AppIcon name="lock" size={14} />
                        仅来源成员可在自己的设备上恢复。此处只查看测试范围。
                      </p>
                    </section>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
      <div className="pn-evidence-note">
        <AppIcon name="lock" size={15} />
        设计样板中的检查点不含真实备份。可以演练确认与预览失效流程。
      </div>
    </div>
  );
}
