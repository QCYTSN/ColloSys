import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle,
  CaretDown,
  CaretRight,
  ChatCircleText,
  Clock,
  CloudSlash,
  Code,
  FileCode,
  FunnelSimple,
  GitBranch,
  MagnifyingGlass,
  Monitor,
  Plus,
  Robot,
  Stack,
  WarningCircle,
  WifiSlash,
  X,
  SquaresFour,
  SidebarSimple,
  PaperPlaneTilt,
  Circle,
  ListChecks,
  ArrowsClockwise,
  LockSimple,
} from '@phosphor-icons/react';
import mark from '../../integrations/codecast/assets/design/peanut-reference.png';
import { workItems, states, needsAttention, type Work } from './fixtures';
import './styles.css';

type Layout = 'queue' | 'focus';
type HandoffDraft = {
  workId: string;
  title: string;
  recipient: string;
  request: string;
  source: string;
  files: string[];
};
type Scene = 'ready' | 'loading' | 'empty' | 'error' | 'denied';
const initial = new URLSearchParams(location.search);
const statusIcon = {
  review: ChatCircleText,
  waiting: Clock,
  running: Circle,
  offline: WifiSlash,
  done: CheckCircle,
  unknown: WarningCircle,
};
function Status({ work }: { work: Work }) {
  const Icon = statusIcon[work.state];
  return (
    <span className={`status ${work.state}`}>
      <Icon size={14} weight={work.state === 'running' ? 'fill' : 'regular'} />
      {states[work.state]}
    </span>
  );
}
function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={7}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <Tip label={label}>
      <button className="icon-button" aria-label={label} aria-pressed={pressed} onClick={onClick}>
        {children}
      </button>
    </Tip>
  );
}
function Avatar({ person }: { person: string }) {
  return (
    <span
      className={`avatar person-${person === '你' ? 'me' : person === '林舟' ? 'lin' : 'chen'}`}
    >
      {person === '你' ? '你' : person.slice(0, 1)}
    </span>
  );
}
function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) previous.current = document.activeElement as HTMLElement;
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className="dialog"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (!document.querySelector('[role="dialog"][data-state="open"]'))
              previous.current?.focus();
          }}
        >
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="关闭对话框">
              <X size={20} />
            </Dialog.Close>
          </header>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function App() {
  const [layout, setLayout] = useState<Layout>(
    initial.get('layout') === 'focus' ? 'focus' : 'queue',
  );
  const [selected, setSelected] = useState(initial.get('work') || 'CW-42');
  const [scope, setScope] = useState('attention');
  const [query, setQuery] = useState('');
  const [member, setMember] = useState('all');
  const [scene, setScene] = useState<Scene>('ready');
  const [context, setContext] = useState(true);
  const [modal, setModal] = useState<'search' | 'handoff' | 'draft' | 'create' | 'project' | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Record<string, string[]>>({});
  const [seen, setSeen] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<Record<string, number>>({});
  const [tab, setTab] = useState(initial.get('view') || 'discussion');
  const [smallTab, setSmallTab] = useState('record');
  const [created, setCreated] = useState<Work[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [recipient, setRecipient] = useState('陈一');
  const [draft, setDraft] = useState<HandoffDraft | null>(null);
  const [handoff, setHandoff] = useState(
    '请检查手动编辑与 Agent 同时修改时的归属，并留下审查意见。',
  );
  const [pending, setPending] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const works = [...created, ...workItems];
  const current = works.find((w) => w.id === selected) || workItems[0];
  const visible = works.filter(
    (w) =>
      (scope === 'all' || (scope === 'attention' ? needsAttention(w) : w.state === 'running')) &&
      (member === 'all' || w.person === member) &&
      `${w.title} ${w.id} ${w.person} ${w.agent} ${w.files.map((f) => f.path).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const choose = (id: string) => {
    setSelected(id);
    setComment('');
    setSmallTab('record');
    setPending(0);
    setRestoring(false);
    setOutdated(false);
  };
  useEffect(() => {
    const params = new URLSearchParams({ layout, work: selected, view: tab });
    history.replaceState(null, '', `?${params}`);
  }, [layout, selected, tab]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'k' &&
        !document.querySelector(
          '[role="dialog"][data-state="open"],[role="menu"][data-state="open"]',
        )
      ) {
        e.preventDefault();
        setModal('search');
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  const viewed = seen.includes(current.id);
  const currentFile = current.files[file[current.id] || 0];
  const positions = useRef<Record<string, number>>({});
  const hasAgent = !['手动编辑', '来源未确认'].includes(current.agent);
  const primaryLabel =
    current.state === 'review' ? '写审查意见' : current.state === 'waiting' ? '补充决定' : '写评论';
  const focusComment = () => {
    setTab('discussion');
    setSmallTab('record');
    requestAnimationFrame(() => document.getElementById('comment')?.focus());
  };
  const changeScene = (s: Scene) => {
    setScene(s);
    if (s === 'loading') window.setTimeout(() => setScene('ready'), 900);
  };
  const addComment = () => {
    if (!comment.trim()) return;
    setComments((c) => ({ ...c, [current.id]: [...(c[current.id] || []), comment.trim()] }));
    setComment('');
    setNotice('评论已加入当前预览，未发送到团队。');
  };
  const source = (
    <div className="source-sheet">
      <h3>来源与保存</h3>
      <dl>
        <div>
          <dt>工作目录</dt>
          <dd>{current.person}的独立目录</dd>
        </div>
        <div>
          <dt>归属依据</dt>
          <dd>{current.source}</dd>
        </div>
        <div>
          <dt>本地保存</dt>
          <dd>
            <CheckCircle size={15} /> {current.files.length ? '已在来源设备保存' : '尚未创建检查点'}
          </dd>
        </div>
        <div>
          <dt>服务接收</dt>
          <dd>
            {current.state === 'offline' ? (
              <>
                <WifiSlash size={15} /> 2 条活动待同步
              </>
            ) : (
              <>
                <CheckCircle size={15} /> {current.files.length ? '已接收示例记录' : '未发送到服务'}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>异机备份</dt>
          <dd>
            <CloudSlash size={15} /> 尚未备份
          </dd>
        </div>
      </dl>
      <p className="note">查看团队活动不会修改你的文件。服务接收活动，不代表文件已有异机备份。</p>
      {current.own && current.files.length > 0 ? (
        <button
          className="button"
          onClick={() => {
            setRestoring(true);
            setOutdated(false);
          }}
        >
          <Stack size={16} />
          预览本地恢复
        </button>
      ) : (
        <p className="ownership">
          <LockSimple size={15} /> {current.own ? '没有可恢复的检查点' : '这是队友的目录，只能查看'}
        </p>
      )}
      {restoring && (
        <div className="restore-preview">
          <strong>{outdated ? '预览已过期' : '恢复影响预览 · 演示'}</strong>
          <p>
            {outdated
              ? '预览后文件已变化。请重新生成预览，再核对影响。'
              : `将比较 ${current.files.length} 个文件。正式恢复需要先备份当前状态，再显式确认。`}
          </p>
          {!outdated && (
            <button className="text-button" onClick={() => setOutdated(true)}>
              模拟预览后继续编辑
            </button>
          )}
          <button
            className="button"
            onClick={() => (outdated ? setOutdated(false) : setRestoring(false))}
          >
            {outdated ? '重新生成预览' : '关闭预览'}
          </button>
          <small>本次设计预览没有执行恢复的能力。</small>
        </div>
      )}
    </div>
  );
  const discussion = (
    <div className="discussion">
      {current.state === 'review' && (
        <div className="review-question">
          <ChatCircleText size={16} />
          <p>
            <strong>需要你看一下</strong>
            <br />
            手动编辑与 Agent 并发时，来源是否仍然准确？
          </p>
        </div>
      )}
      <div className="message">
        <span className="message-avatar">
          <Avatar person="你" />
        </span>
        <div>
          <div className="message-meta">
            <strong>你</strong>
            <span>需求</span>
            <time>14:20</time>
          </div>
          <p>{current.request}</p>
        </div>
      </div>
      <div className="message agent-message">
        <span className="message-avatar">
          {current.agent === '手动编辑' || current.state === 'unknown' ? (
            <FileCode size={20} />
          ) : (
            <Robot size={20} />
          )}
        </span>
        <div>
          <div className="message-meta">
            <strong>{current.agent}</strong>
            <span>{current.agent === '手动编辑' ? '保存记录' : '执行结果'}</span>
            <time>{current.time}</time>
          </div>
          <p>{current.result}</p>
          <button className="execution-disclosure" onClick={() => setTab('execution')}>
            <CheckCircle size={15} /> {hasAgent ? '查看执行记录' : '查看保存记录'}{' '}
            <span>{hasAgent ? '3 个步骤' : '来源设备'}</span>
            <CaretRight size={14} />
          </button>
        </div>
      </div>
      {(comments[current.id] || []).map((c, i) => (
        <div className="message added-message" key={i}>
          <span className="message-avatar">
            <Avatar person="你" />
          </span>
          <div>
            <div className="message-meta">
              <strong>你</strong>
              <span>预览评论</span>
              <time>刚刚</time>
            </div>
            <p>{c}</p>
          </div>
        </div>
      ))}
    </div>
  );
  const execution = (
    <div className="execution-list">
      <div className="section-heading">
        <h3>执行记录</h3>
        <span>演示事件</span>
      </div>
      {(hasAgent
        ? [
            ['读取上下文', '核对任务要求和已保存的来源记录。'],
            ['修改与验证', '根据文件级证据检查归属；没有证据时保留未知。'],
            [
              current.state === 'running' ? '继续执行' : '等待后续处理',
              current.state === 'running'
                ? '当前执行尚未交付。'
                : '结果已整理，是否通过由审查者决定。',
            ],
          ]
        : [
            ['保存文件', '来源设备记录了一次文件保存。'],
            ['检查归属', '没有已验证的 Agent 执行来源，保持独立文件活动。'],
            [
              '交付状态',
              current.state === 'offline'
                ? '两条活动保留在待发送队列。'
                : '可查看文件变化；没有关联的 Agent 执行日志。',
            ],
          ]
      ).map(([title, body], i) => (
        <details key={title} open={i === 2}>
          <summary>
            <CheckCircle size={16} />
            <span>{title}</span>
            <time>14:{21 + i * 4}</time>
            <CaretDown size={14} />
          </summary>
          <p>{body}</p>
          <code>
            {hasAgent
              ? i === 1
                ? '示例验证记录'
                : 'session · ' + current.id.toLowerCase()
              : 'local activity · ' + current.id.toLowerCase()}
          </code>
        </details>
      ))}
      <p className="note">执行记录是示例，不表示本次进行了真实模型调用或这些测试已在产品中通过。</p>
    </div>
  );
  const changes = (
    <section className="changes" aria-label="文件变化">
      <div className="changes-heading">
        <h3>
          <Code size={17} />
          文件变化 <span>{current.files.length}</span>
        </h3>
        <span className="readonly">
          <LockSimple size={12} />
          只读
        </span>
      </div>
      {currentFile ? (
        <>
          <div className="file-tabs" aria-label="选择文件">
            {current.files.map((f, i) => (
              <button
                key={f.path}
                aria-pressed={(file[current.id] || 0) === i}
                onClick={() => setFile((s) => ({ ...s, [current.id]: i }))}
              >
                <FileCode size={14} />
                <span>{f.path.split('/').at(-1)}</span>
              </button>
            ))}
          </div>
          <div className="file-path" title={currentFile.path}>
            <span>{currentFile.path}</span>
            <span className="diff-stats">
              <b>+{currentFile.after.length}</b>
              <em>−{currentFile.before.length}</em>
            </span>
          </div>
          <div className="diff-scroll" tabIndex={0} aria-label="差异内容">
            <table className="diff">
              <tbody>
                {currentFile.before.map((line, i) => (
                  <tr className="removed" key={`b${i}`}>
                    <td>{i + 1}</td>
                    <td>−</td>
                    <td>
                      <code>{line}</code>
                    </td>
                  </tr>
                ))}
                {currentFile.after.map((line, i) => (
                  <tr className="added" key={`a${i}`}>
                    <td>{i + 1}</td>
                    <td>+</td>
                    <td>
                      <code>{line}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="changes-foot">
            <span>
              <GitBranch size={14} />
              {hasAgent ? `preview/${current.id.toLowerCase()}` : '本地文件记录'}
            </span>
            <button
              className="text-button"
              onClick={() => {
                setTab('source');
                setSmallTab('record');
              }}
            >
              查看来源 <ArrowUpRight size={14} />
            </button>
          </div>
        </>
      ) : (
        <div className="no-files">
          <FileCode size={26} />
          <h3>尚未关联文件</h3>
          <p>这项任务还没有捕获到文件变化。</p>
        </div>
      )}
    </section>
  );
  const reader = (
    <section className="reader" aria-label="工作记录">
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="detail-tabs" aria-label="记录类型">
          <Tabs.Trigger value="discussion">
            讨论 <span>{2 + (comments[current.id]?.length || 0)}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="execution">执行记录</Tabs.Trigger>
          <Tabs.Trigger value="source">来源与保存</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content
          value="discussion"
          className="reader-scroll"
          tabIndex={0}
          ref={(el) => {
            if (el) el.scrollTop = positions.current[current.id + '-discussion'] || 0;
          }}
          onScroll={(e) => {
            positions.current[current.id + '-discussion'] = e.currentTarget.scrollTop;
          }}
        >
          {discussion}
        </Tabs.Content>
        <Tabs.Content
          value="execution"
          className="reader-scroll"
          tabIndex={0}
          ref={(el) => {
            if (el) el.scrollTop = positions.current[current.id + '-execution'] || 0;
          }}
          onScroll={(e) => {
            positions.current[current.id + '-execution'] = e.currentTarget.scrollTop;
          }}
        >
          {execution}
        </Tabs.Content>
        <Tabs.Content
          value="source"
          className="reader-scroll"
          tabIndex={0}
          ref={(el) => {
            if (el) el.scrollTop = positions.current[current.id + '-source'] || 0;
          }}
          onScroll={(e) => {
            positions.current[current.id + '-source'] = e.currentTarget.scrollTop;
          }}
        >
          {source}
        </Tabs.Content>
      </Tabs.Root>
      {tab === 'discussion' && (
        <div className="composer">
          <label className="sr-only" htmlFor="comment">
            写评论
          </label>
          <textarea
            id="comment"
            placeholder="留下审查意见，或补充下一步…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') addComment();
            }}
          />
          <div>
            <span>评论属于这项工作</span>
            <button
              className="send-button"
              aria-label="添加预览评论"
              disabled={!comment.trim()}
              onClick={addComment}
            >
              <PaperPlaneTilt size={17} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
  const detail = (
    <div className={`work-detail ${!context ? 'no-context' : ''}`}>
      <div className="detail-top">
        <span className="detail-owner">
          <Avatar person={current.person} />
          {current.person}
          <span className="dot" />
          {current.agent}
          <span className="divider" />
          <span className="detail-id">
            {current.id}
            {layout === 'queue' && <strong>{current.title}</strong>}
          </span>
        </span>
        <div className="detail-actions">
          <Tip label={viewed ? '已查看 · 点击撤销' : '标记已查看'}>
            <button
              aria-label={viewed ? '已查看 · 点击撤销' : '标记已查看'}
              aria-pressed={viewed}
              className={`button subtle ${viewed ? 'is-seen' : ''}`}
              onClick={() =>
                setSeen((v) =>
                  v.includes(current.id) ? v.filter((x) => x !== current.id) : [...v, current.id],
                )
              }
            >
              <Check size={16} />
              {viewed ? '已查看' : '标记已查看'}
            </button>
          </Tip>
          <button
            className="button"
            onClick={() => setModal(draft?.workId === current.id ? 'draft' : 'handoff')}
          >
            {draft?.workId === current.id ? '查看交接草稿' : '准备交接'}
          </button>
          <button className="button primary" onClick={focusComment}>
            {primaryLabel}
            <ArrowRight size={16} />
          </button>
          {layout === 'focus' && (
            <IconButton
              label={context ? '收起变更面板' : '展开变更面板'}
              onClick={() => setContext((v) => !v)}
              pressed={context}
            >
              <SidebarSimple size={18} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="compact-tabs" role="group" aria-label="工作面">
        <button aria-pressed={smallTab === 'record'} onClick={() => setSmallTab('record')}>
          记录
        </button>
        <button aria-pressed={smallTab === 'changes'} onClick={() => setSmallTab('changes')}>
          变更 {current.files.length}
        </button>
      </div>
      <div className={`detail-body mobile-${smallTab}`}>
        {reader}
        {changes}
      </div>
      {pending > 0 && (
        <button
          className="new-record"
          onClick={() => {
            setPending(0);
            setComments((c) => ({
              ...c,
              [current.id]: [...(c[current.id] || []), '示例新记录：已补充来源验证的说明。'],
            }));
            setTab('discussion');
            requestAnimationFrame(() => {
              const el = document.querySelector('.reader-scroll[data-state=active]');
              el?.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
            });
          }}
        >
          <ArrowRight size={14} />
          查看 {pending} 条新记录
        </button>
      )}
    </div>
  );
  return (
    <Tooltip.Provider delayDuration={350}>
      <div className={`exploration layout-${layout}`}>
        <a href="#work-main" className="skip-link">
          跳到工作内容
        </a>
        <div className="lab-bar">
          <span>
            设计探索 <span className="lab-dot" /> 示例数据
          </span>
          <div className="layout-switch" role="group" aria-label="布局方案">
            <button aria-pressed={layout === 'queue'} onClick={() => setLayout('queue')}>
              A · 交接队列
            </button>
            <button aria-pressed={layout === 'focus'} onClick={() => setLayout('focus')}>
              B · 会话工作面
            </button>
          </div>
          <Menu.Root>
            <Menu.Trigger asChild>
              <button className="lab-scenarios">
                体验状态 <CaretDown size={12} />
              </button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="menu" sideOffset={8} align="end">
                <Menu.Label>仅改变演示数据</Menu.Label>
                {(
                  [
                    ['ready', '正常内容'],
                    ['loading', '加载中'],
                    ['empty', '首次使用'],
                    ['error', '连接失败'],
                    ['denied', '无访问权限'],
                  ] as const
                ).map(([value, label]) => (
                  <Menu.Item key={value} onSelect={() => changeScene(value)}>
                    {label}
                    {scene === value && <Check size={14} />}
                  </Menu.Item>
                ))}
                <Menu.Separator />
                <Menu.Item onSelect={() => setPending((n) => n + 1)}>模拟收到新记录</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
        <header className="app-bar">
          <div className="brand">
            <svg viewBox="470 440 245 160" role="img" aria-label="花生标志">
              <image href={mark} width="1200" height="1200" />
            </svg>
            <strong>ColloSys</strong>
          </div>
          <span className="bar-divider" />
          <Menu.Root>
            <Menu.Trigger asChild>
              <button className="project-switch">
                <span className="project-mark">
                  <SquaresFour size={16} />
                </span>
                协作工作台 <CaretDown size={13} />
              </button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="menu" sideOffset={10}>
                <Menu.Label>产品开发小组 · 演示项目</Menu.Label>
                <Menu.Item onSelect={() => setScene('ready')}>
                  <Check size={15} />
                  协作工作台
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item onSelect={() => setModal('project')}>项目与成员</Menu.Item>
                <Menu.Item onSelect={() => setScene('empty')}>查看首次使用</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
          <nav className="global-nav" aria-label="项目导航">
            <button className="active" onClick={() => setModal(null)}>
              工作
            </button>
            <button onClick={() => setModal('project')}>团队</button>
          </nav>
          <div className="app-tools">
            <button className="global-search" onClick={() => setModal('search')}>
              <MagnifyingGlass size={16} />
              <span>查找工作</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="team-presence">
              <span />
              <span />
              <span />3 位成员
            </span>
            <Avatar person="你" />
          </div>
        </header>
        <main id="work-main" tabIndex={-1}>
          {scene !== 'ready' ? (
            <div className={`state-view ${scene}`} aria-live="polite">
              {scene === 'loading' ? (
                <>
                  <div className="skeleton" />
                  <div className="skeleton" />
                  <p>正在读取项目活动…</p>
                </>
              ) : scene === 'empty' ? (
                <>
                  <Stack size={34} />
                  <h1>让团队看见你的工作</h1>
                  <p>
                    先连接自己的项目目录。手动保存的修改也会成为活动，
                    <br />
                    每位成员仍保留独立的文件。
                  </p>
                  <button className="button primary" onClick={() => setModal('project')}>
                    查看连接步骤 <ArrowRight size={16} />
                  </button>
                  <button className="text-button" onClick={() => setScene('ready')}>
                    返回示例项目
                  </button>
                </>
              ) : scene === 'error' ? (
                <>
                  <WifiSlash size={34} />
                  <h1>暂时无法连接</h1>
                  <p>本地记录仍然可读。待发送活动会保留，连接恢复后再同步。</p>
                  <button className="button primary" onClick={() => changeScene('loading')}>
                    <ArrowsClockwise size={16} />
                    重新连接
                  </button>
                  <button className="text-button" onClick={() => setScene('ready')}>
                    查看已有内容
                  </button>
                </>
              ) : (
                <>
                  <LockSimple size={34} />
                  <h1>你没有这个项目的访问权限</h1>
                  <p>当前内容不可读取。请切换到你已加入的项目。</p>
                  <button className="button" onClick={() => setScene('ready')}>
                    返回示例项目
                  </button>
                </>
              )}
            </div>
          ) : layout === 'queue' ? (
            <div className="queue-page">
              <div className="page-heading">
                <div>
                  <h1>
                    待处理的工作<span>{works.filter(needsAttention).length}</span>
                  </h1>
                  <p>先处理需要你的部分，再回到各自的工作。</p>
                </div>
                <button className="button" onClick={() => setModal('create')}>
                  <Plus size={16} />
                  创建任务
                </button>
              </div>
              <div className="queue-controls">
                <div className="scope-tabs" role="group" aria-label="工作范围">
                  {[
                    ['all', '所有工作', works.length],
                    ['attention', '需要你', works.filter(needsAttention).length],
                    ['running', '执行中', works.filter((w) => w.state === 'running').length],
                  ].map(([value, label, count]) => (
                    <button
                      key={value}
                      aria-pressed={scope === value}
                      onClick={() => setScope(String(value))}
                    >
                      {label}
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
                <div className="filter-tools">
                  <label className="queue-search">
                    <MagnifyingGlass size={15} />
                    <input
                      aria-label="搜索工作"
                      placeholder="任务、成员或文件"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <Menu.Root>
                    <Menu.Trigger asChild>
                      <button className="button filter">
                        <FunnelSimple size={16} />
                        {member === 'all' ? '成员' : member}
                        <CaretDown size={12} />
                      </button>
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Content className="menu" align="end" sideOffset={8}>
                        <Menu.RadioGroup value={member} onValueChange={setMember}>
                          {['all', '你', '林舟', '陈一'].map((v) => (
                            <Menu.RadioItem value={v} key={v}>
                              {v === 'all' ? '所有成员' : v}
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
              </div>
              <div className="ledger">
                <div className="ledger-labels">
                  <span>工作</span>
                  <span>执行者</span>
                  <span>当前情况</span>
                  <span>更新</span>
                </div>
                {visible.map((w) => (
                  <React.Fragment key={w.id}>
                    <button
                      className={`work-row ${selected === w.id ? 'selected' : ''}`}
                      aria-expanded={selected === w.id}
                      onClick={() => (selected === w.id ? setSelected('') : choose(w.id))}
                    >
                      <span className="work-name">
                        <span className="row-caret">
                          {selected === w.id ? <CaretDown size={16} /> : <CaretRight size={16} />}
                        </span>
                        <span>
                          <strong>{w.title}</strong>
                          <span className="row-sub">
                            <span>{w.id}</span>
                            <span>{w.files.length} 个文件</span>
                            {seen.includes(w.id) && (
                              <span className="viewed">
                                <Check size={12} />
                                已查看
                              </span>
                            )}
                          </span>
                        </span>
                      </span>
                      <span className="row-person">
                        <Avatar person={w.person} />
                        <span>
                          {w.person}
                          <small>{w.agent}</small>
                        </span>
                      </span>
                      <span className="row-state">
                        <Status work={w} />
                        <small>{w.reason}</small>
                      </span>
                      <time>{w.time}</time>
                    </button>
                  </React.Fragment>
                ))}
                {!visible.length && (
                  <div className="empty-results">
                    <MagnifyingGlass size={24} />
                    <h2>没有匹配的工作</h2>
                    <p>试试任务名称、成员或文件路径。</p>
                    <button
                      className="button"
                      onClick={() => {
                        setQuery('');
                        setMember('all');
                        setScope('all');
                      }}
                    >
                      清除筛选
                    </button>
                  </div>
                )}
              </div>
              {visible.some((w) => w.id === selected) && detail}
              <div className="queue-bottom">
                <span>
                  <Monitor size={14} />
                  每位成员的目录保持独立
                </span>
                <span>演示项目 · 6 项原始工作</span>
              </div>
            </div>
          ) : (
            <div className="focus-page">
              <div className="session-strip" role="group" aria-label="切换当前工作">
                {works.map((w) => (
                  <button
                    key={w.id}
                    className={selected === w.id ? 'selected' : ''}
                    aria-pressed={selected === w.id}
                    onClick={() => choose(w.id)}
                  >
                    <span className="session-person">
                      <Avatar person={w.person} />
                      {w.person}
                      <span>{w.agent}</span>
                      <Status work={w} />
                    </span>
                    <strong>{w.title}</strong>
                  </button>
                ))}
              </div>
              <div className="focus-title">
                <div>
                  <span className="task-breadcrumb">
                    <ListChecks size={14} />
                    协作工作台
                    <CaretRight size={12} />
                    {current.id}
                  </span>
                  <h1>{current.title}</h1>
                </div>
                <Status work={current} />
              </div>
              {detail}
            </div>
          )}
        </main>
        <div className="sr-only" role="status">
          {notice}
        </div>
        {notice && (
          <div className="toast">
            <CheckCircle size={17} />
            {notice}
          </div>
        )}
        <Modal
          open={modal === 'search'}
          onOpenChange={(v) => !v && setModal(null)}
          title="查找工作"
          description="按任务、成员、Agent 或文件查找当前演示项目。"
        >
          <label className="command-search">
            <MagnifyingGlass size={20} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入任务、成员或文件…"
              aria-label="查找工作内容"
            />
          </label>
          <div className="command-results">
            {works
              .filter((w) =>
                `${w.title} ${w.id} ${w.person} ${w.agent} ${w.files.map((f) => f.path)}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    choose(w.id);
                    setModal(null);
                    setScene('ready');
                    setQuery('');
                    setMember('all');
                    setScope('all');
                  }}
                >
                  <Status work={w} />
                  <span>
                    {w.title}
                    <small>
                      {w.id} · {w.person} / {w.agent}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            {!works.some((w) =>
              `${w.title} ${w.id} ${w.person} ${w.agent} ${w.files.map((f) => f.path)}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && <p>没有匹配结果。试试成员名或文件名。</p>}
          </div>
        </Modal>
        <Modal
          open={modal === 'handoff'}
          onOpenChange={(v) => !v && setModal(null)}
          title="把上下文交给下一位"
          description="整理当前任务、变更来源和下一步。预览只生成草稿，不会发送通知。"
        >
          <div className="handoff-context">
            <FileCode size={20} />
            <div>
              <strong>{current.title}</strong>
              <span>
                {current.id} · {current.files.length} 个文件 · {current.person}
              </span>
            </div>
          </div>
          <label className="field">
            交接给
            <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              <option>陈一</option>
              <option>林舟</option>
            </select>
          </label>
          <label className="field">
            需要对方做什么
            <textarea value={handoff} onChange={(e) => setHandoff(e.target.value)} rows={4} />
          </label>
          <p className="note">
            <LockSimple size={14} />
            共享上下文，不应用任何人的文件。
          </p>
          <div className="dialog-actions">
            <Dialog.Close className="button">取消</Dialog.Close>
            <button
              className="button primary"
              disabled={!handoff.trim()}
              onClick={() => {
                setDraft({
                  workId: current.id,
                  title: current.title,
                  recipient,
                  request: handoff.trim(),
                  source: current.source,
                  files: current.files.map((f) => f.path),
                });
                setModal('draft');
              }}
            >
              生成预览草稿 <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
        <Modal
          open={modal === 'draft'}
          onOpenChange={(v) => !v && setModal(null)}
          title="交接草稿"
          description="草稿只保留在当前预览内存中，未发送给任何成员。刷新页面会清除。"
        >
          {draft && (
            <div className="draft-preview">
              <div className="draft-recipient">
                <Avatar person={draft.recipient} />
                <div>
                  <span>交接给</span>
                  <strong>{draft.recipient}</strong>
                </div>
                <span className="status">
                  <Clock size={14} />
                  未发送
                </span>
              </div>
              <h3>{draft.title}</h3>
              <p className="draft-id">
                {draft.workId} · {draft.source}
              </p>
              <h4>下一步</h4>
              <p className="draft-request">{draft.request}</p>
              <h4>关联文件</h4>
              {draft.files.length ? (
                <ul>
                  {draft.files.map((f) => (
                    <li key={f}>
                      <FileCode size={14} />
                      <code>{f}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>尚未关联文件</p>
              )}
              <p className="note">共享的是上下文。查看草稿不会修改你的文件，也不会启动 Agent。</p>
              <div className="dialog-actions">
                <button className="button" onClick={() => setModal('handoff')}>
                  修改草稿
                </button>
                <Dialog.Close className="button primary">完成</Dialog.Close>
              </div>
            </div>
          )}
        </Modal>
        <Modal
          open={modal === 'create'}
          onOpenChange={(v) => !v && setModal(null)}
          title="创建任务"
          description="这项任务只加入当前设计预览，刷新后重置。"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTitle.trim()) return;
              const w: Work = {
                ...workItems[1],
                id: `DEMO-${created.length + 1}`,
                title: newTitle.trim(),
                reason: '新任务',
                time: '刚刚',
                request: newTitle.trim(),
                result: '任务尚未开始，没有执行记录或关联文件。',
                source: '当前浏览器的演示任务',
                files: [],
              };
              setCreated((v) => [w, ...v]);
              choose(w.id);
              setNewTitle('');
              setModal(null);
              setNotice('演示任务已创建。');
            }}
          >
            <label className="field">
              任务名称
              <input
                autoFocus
                maxLength={160}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="这项工作要完成什么？"
                required
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>
                取消
              </button>
              <button className="button primary" disabled={!newTitle.trim()} type="submit">
                创建演示任务
              </button>
            </div>
          </form>
        </Modal>
        <Modal
          open={modal === 'project'}
          onOpenChange={(v) => !v && setModal(null)}
          title="项目与成员"
          description="演示项目。实际账户、成员权限和目录连接继续由现有系统管理。"
        >
          <div className="project-summary">
            <SquaresFour size={24} />
            <div>
              <strong>协作工作台</strong>
              <p>产品开发小组 · 3 位成员</p>
            </div>
          </div>
          {['你', '林舟', '陈一'].map((p, i) => (
            <div className="member-row" key={p}>
              <Avatar person={p} />
              <strong>{p}</strong>
              <span>{i === 0 ? '项目管理员' : '项目成员'}</span>
              <span className="member-directory">
                <Monitor size={14} />
                独立工作目录
              </span>
            </div>
          ))}
          <div className="onboarding-steps">
            <h3>连接自己的工作目录</h3>
            <ol>
              <li>在桌面客户端选择一个明确的项目根目录。</li>
              <li>核对排除规则和需要共享的 Agent 来源。</li>
              <li>保存文件后，检查本地记录与同步状态。</li>
            </ol>
            <p className="note">本浏览器设计预览不扫描磁盘、不连接真实目录。</p>
          </div>
        </Modal>
      </div>
    </Tooltip.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
