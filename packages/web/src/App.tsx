import { WorkspaceBrowser } from './components/WorkspaceBrowser';
import { SectionRow, RailHeading } from './components/codecast/Rail';
import { Patch } from './components/Patch';
import { AccountForm } from './components/AccountForm';
import { TeamSettings } from './components/TeamSettings';
import { CollaborationPanel } from './components/CollaborationPanel';
import { ProjectSetup } from './components/ProjectSetup';
import { StoragePanel } from './components/StoragePanel';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Menu,
  Moon,
  Sun,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  GitBranch,
  History,
  LogOut,
  MessageSquare,
  Plus,
  ShieldCheck,
  Terminal,
  Users,
  Wifi,
  WifiOff,
  X,
  AlertCircle,
  HardDrive,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { LocalSettings } from './components/LocalSettings';
import { Dialog } from './components/Dialog';
import { api, post, managerApi, useProjectFeed, type Auth } from './api';
import type { FileChange, Member, Checkpoint } from '../../shared/src/protocol';

type Status = {
  workspaceId: string;
  projectId: string;
  userId: string;
  root: string;
  pending: number;
  deliveryError: string | null;
  deliveryState?: 'ready' | 'retrying' | 'reauth-required' | 'access-denied' | 'paused';
  offline: boolean;
  lastScan: number | null;
  lastSent: number | null;
  error: string | null;
  excluded: string[];
  latest: string | null;
  agent: { adapter: string | null; source: string | null; error: string | null };
};
type RestorePreview = {
  id: string;
  checkpointId: string;
  directory: string;
  files: FileChange[];
  expiresAt: number;
};
const time = (n: number) =>
  new Date(n).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
const date = (n: number) =>
  new Date(n).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
const initialAuth = () => {
  try {
    return JSON.parse(sessionStorage.getItem('collosys.auth') ?? 'null') as Auth | null;
  } catch {
    return null;
  }
};
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      className={`avatar ${small ? 'small' : ''} ${name.toLowerCase() === 'bob' ? 'bob' : 'alice'}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function App() {
  const [navOpen, setNavOpen] = useState(false);
  const [linkedEvent, setLinkedEvent] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('event'),
  );
  const navigateEvent = (id: string | null, mode = tab) => {
    const url = new URL(location.href);
    if (project) url.searchParams.set('project', project);
    url.searchParams.set('view', mode);
    if (id) url.searchParams.set('event', id);
    else url.searchParams.delete('event');
    history.pushState(null, '', url);
    setLinkedEvent(id);
  };
  const [dark, setDark] = useState(() => localStorage.getItem('collosys.theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('collosys.theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    if (!navOpen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [navOpen]);
  const [teamSettings, setTeamSettings] = useState(false),
    [setup, setSetup] = useState(false),
    [development, setDevelopment] = useState(false),
    [projectRevision, setProjectRevision] = useState(0);
  useEffect(() => {
    const pair = new URLSearchParams(location.hash.slice(1)).get('pair');
    if (pair) {
      sessionStorage.setItem('collosys.pairing', pair);
      history.replaceState(null, '', location.pathname + location.search);
    }
    void api('/api/health')
      .then((d) => setDevelopment(d.auth === 'development'))
      .catch(() => {});
  }, []);
  const [auth, setAuth] = useState<Auth | null>(initialAuth),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [project, setProject] = useState<string | undefined>(
      () => new URLSearchParams(location.search).get('project') ?? undefined,
    ),
    [members, setMembers] = useState<Member[]>([]);
  const [tab, setTab] = useState<'activity' | 'agent' | 'history' | 'collaboration'>(() =>
      new URLSearchParams(location.search).get('view') === 'agent' ? 'agent' : 'activity',
    ),
    [member, setMember] = useState('all'),
    [status, setStatus] = useState<Status | null>(null),
    [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]),
    [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<RestorePreview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [help, setHelp] = useState(false),
    [loginError, setLoginError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false),
    [connectorOverride, setConnectorOverride] = useState<{ context: string; url: string } | null>(
      null,
    );
  const feed = useProjectFeed(project, auth);
  useEffect(() => {
    const expired = (event: Event) => {
      if ((event as CustomEvent).detail !== auth?.token) return;
      sessionStorage.removeItem('collosys.auth');
      setAuth(null);
      setLoginError('登录已过期，请重新登录。待发送的文件活动仍保存在本机。');
    };
    window.addEventListener('collosys:session-expired', expired);
    return () => window.removeEventListener('collosys:session-expired', expired);
  }, [auth?.token]);
  const connectorContext = `${auth?.user.id ?? ''}:${project ?? ''}`;
  const connector =
    (connectorOverride?.context === connectorContext
      ? connectorOverride.url
      : auth && project
        ? localStorage.getItem(`collosys.connector:${connectorContext}`)
        : null) ??
    (auth && ['alice', 'bob'].includes(auth.user.id) && project === 'demo-project'
      ? `/connector/${auth.user.id}`
      : null);
  const chooseConnector = (value: string) => {
    setConnectorOverride({ context: connectorContext, url: value });
    if (auth && project)
      localStorage.setItem(`collosys.connector:${auth.user.id}:${project}`, value);
  };
  const localContext = useRef('');
  localContext.current = `${auth?.token ?? ''}|${connector ?? ''}|${project ?? ''}`;
  const localRefresh = async () => {
    if (!auth || !connector) return;
    const context = `${auth.token}|${connector}|${project ?? ''}`;
    try {
      const [next, history] = await Promise.all([
        api<Status>(connector + '/api/status', auth.token),
        api<{ checkpoints: Checkpoint[] }>(connector + '/api/checkpoints', auth.token),
      ]);
      if (localContext.current !== context) return;
      if (next.projectId && next.projectId !== project)
        throw new Error('此连接程序属于另一个项目，请重新选择工作区');
      setStatus(next);
      setCheckpoints(history.checkpoints);
      setLocalError(null);
    } catch (e) {
      if (localContext.current !== context) return;
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    if (!auth) return;
    let active = true;
    api<{ projects: { id: string; name: string }[] }>('/api/projects', auth.token)
      .then((data) => {
        if (active) {
          setProjects(data.projects);
          setProject((current) =>
            data.projects.some((p) => p.id === current) ? current : data.projects[0]?.id,
          );
        }
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      });
    return () => {
      active = false;
    };
  }, [auth, projectRevision]);
  useEffect(() => {
    if (!project || !auth) return;
    let active = true;
    const load = () =>
      api<{ members: Member[] }>(`/api/projects/${project}/members`, auth.token)
        .then((a) => {
          if (active) {
            setMembers(a.members);
          }
        })
        .catch((e) => {
          if (active) setNotice(e.message);
        });
    void load();
    const interval = setInterval(() => void load(), 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [project, auth]);
  useEffect(() => {
    if (!auth) return;
    setStatus(null);
    setCheckpoints([]);
    setLocalError(null);
    setPreview(null);
    void localRefresh();
    const interval = setInterval(() => void localRefresh(), 2500);
    return () => clearInterval(interval);
  }, [auth?.token, connector, project]);
  useEffect(() => {
    const pop = () => {
      const params = new URLSearchParams(location.search);
      const p = params.get('project');
      if (p && projects.some((x) => x.id === p)) setProject(p);
      setTab(params.get('view') === 'agent' ? 'agent' : 'activity');
      setLinkedEvent(params.get('event'));
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [projects]);
  const pageTitle = {
    activity: '团队活动',
    agent: 'Agent 会话',
    history: '我的检查点',
    collaboration: '任务与交接',
  }[tab];
  async function login(user: string) {
    setBusy(true);
    setLoginError(null);
    try {
      const next = await post('/api/dev/login', '', { user });
      sessionStorage.setItem('collosys.auth', JSON.stringify(next));
      setConnectorOverride(null);
      setAuth(next);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      await localRefresh();
      feed.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function showPreview(checkpointId: string) {
    if (!auth || !connector) return;
    await action(async () => {
      const next = await post(connector + '/api/restore/preview', auth.token, { checkpointId });
      setPreview(next);
      setConfirmed(false);
    });
  }
  if (!auth)
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="brand-mark">
            <GitBranch size={28} />
          </div>
          <h1>ColloSys</h1>
          <p>登录你的协作工作区</p>
          {loginError && (
            <div role="alert" className="error-box">
              {loginError}
            </div>
          )}
          <AccountForm
            onLogin={(next) => {
              sessionStorage.setItem('collosys.auth', JSON.stringify(next));
              setConnectorOverride(null);
              setAuth(next);
            }}
          />
          {development && (
            <>
              <div className="login-accounts">
                <button disabled={busy} onClick={() => void login('alice')}>
                  <Avatar name="Alice" />
                  <span>
                    <strong>Alice</strong>
                    <small>进入 Alice 的独立工作区</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
                <button disabled={busy} onClick={() => void login('bob')}>
                  <Avatar name="Bob" />
                  <span>
                    <strong>Bob</strong>
                    <small>进入 Bob 的独立工作区</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="local-note">
                <ShieldCheck size={16} />
                <span>
                  本地开发账号 · 文件与记录真实保存
                  <br />
                  可在另一浏览器会话中登录另一位成员
                </span>
              </div>
              <button className="text-button outsider" onClick={() => void login('outsider')}>
                以非项目成员验证访问限制
              </button>
            </>
          )}
        </div>
      </main>
    );
  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      {navOpen && (
        <button className="nav-scrim" aria-label="关闭导航" onClick={() => setNavOpen(false)} />
      )}
      <aside className="sidebar" data-sv-nav aria-label="工作区导航">
        <div className="brand">
          <div className="brand-mark small">
            <GitBranch size={18} />
          </div>
          <strong>ColloSys</strong>
          <span className="local-pill">LOCAL</span>
        </div>
        <button className="team-picker" onClick={() => setTeamSettings(true)}>
          <span className="team-icon">C</span>
          <span>
            <strong>团队与账号</strong>
            <small>{members.length} 位项目成员</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <nav className="rail-scroll">
          <RailHeading label="工作区" isNarrow={false} />
          {(
            [
              [
                'activity',
                '团队活动',
                <Activity size={16} />,
                feed.events.filter((e) => e.kind === 'checkpoint').length,
              ],
              [
                'agent',
                'Agent 会话',
                <MessageSquare size={16} />,
                new Set(
                  feed.events.flatMap((e) =>
                    e.kind === 'agent.message' ? [e.workspaceId + ':' + e.payload.sessionId] : [],
                  ),
                ).size,
              ],
              ['collaboration', '任务与交接', <Users size={16} />, 0],
              ['history', '我的检查点', <History size={16} />, 0],
            ] as const
          ).map(([id, label, icon, count]) => (
            <SectionRow
              key={id}
              row={{
                id,
                name: label,
                icon,
                active: tab === id,
                trailing: count ? <span className="rail-count">{count}</span> : null,
                onSelect: () => {
                  setTab(id);
                  setNavOpen(false);
                },
              }}
            />
          ))}
          <RailHeading
            label="项目"
            isNarrow={false}
            action={
              <button
                className="rail-action"
                aria-label="管理项目"
                onClick={() => setTeamSettings(true)}
              >
                <Plus size={13} />
              </button>
            }
          />
          {projects.map((p) => (
            <SectionRow
              key={p.id}
              row={{
                id: p.id,
                name: p.name,
                icon: <FolderGit2 size={15} />,
                active: p.id === project,
                onSelect: () => {
                  setProject(p.id);
                  setNavOpen(false);
                },
              }}
            />
          ))}
          {!projects.length && <p className="sidebar-empty">还没有可访问的项目</p>}
          <RailHeading label="成员" isNarrow={false} />
          <SectionRow
            row={{
              id: 'all',
              name: '全部成员',
              icon: <Users size={16} />,
              active: member === 'all',
              onSelect: () => {
                setMember('all');
                setNavOpen(false);
              },
            }}
          />
          {members.map((m) => (
            <SectionRow
              key={m.id}
              row={{
                id: m.id,
                name: m.name + (m.id === auth.user.id ? ' · 你' : ''),
                icon: <Avatar name={m.name} small />,
                active: member === m.id,
                trailing: (
                  <i className={'presence ' + (feed.online.includes(m.id) ? 'online' : '')} />
                ),
                onSelect: () => {
                  setMember(m.id);
                  setNavOpen(false);
                },
              }}
            />
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="rail-utility" onClick={() => setHelp(true)}>
            <Terminal size={15} />
            使用说明
          </button>
          <button className="rail-utility" onClick={() => setDark(!dark)}>
            {dark ? <Sun size={15} /> : <Moon size={15} />}切换到{dark ? '浅色' : '深色'}
          </button>
          <button
            className="profile"
            onClick={() => {
              void post('/api/logout', auth.token, {}).catch(() => {});
              sessionStorage.removeItem('collosys.auth');
              setAuth(null);
              setStatus(null);
              setProject(undefined);
            }}
          >
            <Avatar name={auth.user.name} small />
            <span>{auth.user.name}</span>
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <main className="workspace" id="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-nav icon-button"
              aria-label="打开导航"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <Menu size={17} />
            </button>
            <FolderGit2 size={16} />
            <span>{projects.find((p) => p.id === project)?.name ?? '项目访问'}</span>
            <ChevronRight size={13} />
            <h1>
              {tab === 'activity'
                ? '团队活动'
                : tab === 'agent'
                  ? 'Agent 会话'
                  : tab === 'collaboration'
                    ? '任务与交接'
                    : '我的检查点'}
            </h1>
          </div>
          <div className="top-actions">
            <Button
              className="mobile-team"
              variant="ghost"
              size="sm"
              aria-label="团队设置"
              onClick={() => setTeamSettings(true)}
            >
              <Users />
            </Button>
            {project && (
              <Button variant="outline" size="sm" onClick={() => setSetup(true)}>
                <FolderGit2 />
                接入项目目录
              </Button>
            )}
            <span className={`live-state ${feed.connection === 'live' ? 'is-live' : ''}`}>
              <i />
              {feed.connection === 'live'
                ? '实时连接'
                : feed.connection === 'connecting'
                  ? '正在连接'
                  : feed.connection === 'denied'
                    ? '访问已失效'
                    : '重连中'}
            </span>
            {connector && (
              <Button variant="ghost" size="sm" onClick={() => setSettings(true)}>
                <HardDrive />
                连接设置
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !status || !project}
              onClick={() =>
                void action(async () => {
                  await post(connector + '/api/capture', auth.token, {});
                  setNotice('检查点已保存在本地。');
                })
              }
            >
              <Plus />
              保存检查点
            </Button>
          </div>
        </header>
        {(notice || feed.error) && (
          <div role="alert" className="notice">
            <AlertCircle size={16} />
            <span>{notice ?? feed.error}</span>
            <button aria-label="关闭提示" onClick={() => setNotice(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        {connector && (
          <div className={`connector-strip ${localError ? 'warning' : ''}`}>
            <HardDrive size={16} />
            <strong>{auth.user.name} 的连接程序</strong>
            <span className="connector-path" title={status?.root}>
              {status?.root ?? '正在读取工作区…'}
            </span>
            {localError ? (
              <span className="strip-warning">无法取得状态：{localError}</span>
            ) : (
              <>
                <span className="queue-count">
                  {!status
                    ? '等待状态'
                    : status.deliveryState === 'reauth-required'
                      ? '连接程序需要重新认证'
                      : status.deliveryState === 'access-denied'
                        ? '项目写入权限已失效'
                        : status.pending
                          ? `${status.pending} 条待发送`
                          : '队列已清空'}
                </span>
                {status?.deliveryState === 'reauth-required' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const result = await managerApi('connectors/start', auth.token, {
                          workspaceId: status.workspaceId,
                        });
                        chooseConnector(result.url);
                        await localRefresh();
                        setNotice('已重新认证，正在补发本机队列。');
                      })
                    }
                  >
                    重新连接工作区
                  </Button>
                )}
                <button
                  disabled={!status || busy}
                  className={`network-toggle ${status?.offline ? 'paused' : ''}`}
                  onClick={() =>
                    void action(async () => {
                      await post(connector + '/api/offline', auth.token, {
                        offline: !status?.offline,
                      });
                    })
                  }
                >
                  {status?.offline ? <WifiOff size={14} /> : <Wifi size={14} />}{' '}
                  {status?.offline ? '恢复发送' : '暂停发送'}
                </button>
              </>
            )}
          </div>
        )}
        {!project ? (
          <div className="empty-state full">
            <ShieldCheck size={34} />
            <h2>没有项目访问权限</h2>
            <p>该账号无法读取团队活动、文件差异或会话。</p>
          </div>
        ) : tab === 'collaboration' ? (
          <CollaborationPanel
            key={project}
            auth={auth}
            project={project}
            members={members}
            events={feed.events}
            onOpenEvent={(id) => {
              setTab('activity');
              navigateEvent(id, 'activity');
            }}
          />
        ) : tab === 'history' ? (
          <div className="history-layout">
            <div className="section-heading">
              <span>本地检查点</span>
              <Badge variant="secondary">{checkpoints.length} 条</Badge>
              <span className="subtle">本地检查点；备份状态见下方</span>
            </div>
            {checkpoints.length === 0 ? (
              <div className="empty-state">
                <History />
                <h2>等待第一个检查点</h2>
                <p>连接程序会在首次扫描后保存允许纳管的文件。</p>
              </div>
            ) : (
              <div className="checkpoint-list">
                {checkpoints.map((cp, i) => (
                  <div className="checkpoint-row" key={cp.id}>
                    <div className={`checkpoint-node ${i === 0 ? 'latest' : ''}`}>
                      <Check size={13} />
                    </div>
                    <div className="checkpoint-title">
                      <strong>{cp.label}</strong>
                      <small>
                        {date(cp.createdAt)} · {cp.fileCount} 个文件 · {cp.id.slice(0, 8)}
                      </small>
                    </div>
                    {i === 0 && <Badge variant="secondary">最新</Badge>}
                    <span className="local-storage">
                      <HardDrive size={13} />
                      {cp.integrity === 'invalid'
                        ? '内容不完整，无法恢复'
                        : cp.integrity === 'verified'
                          ? '本地已校验'
                          : '旧检查点，使用前校验'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || cp.integrity === 'invalid'}
                      onClick={() => void showPreview(cp.id)}
                    >
                      <History />
                      预览恢复
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {connector && (
              <StoragePanel
                key={`${project}|${connector}|${auth.token}`}
                connector={connector}
                token={auth.token}
                checkpoints={checkpoints}
              />
            )}
            <div className="history-footnote">
              <ShieldCheck size={16} />
              <p>
                预览在独立目录重建文件。确认恢复只影响当前成员工作区；敏感文件和排除目录不参与恢复。
              </p>
            </div>
          </div>
        ) : (
          <WorkspaceBrowser
            key={project + ':' + tab + ':' + member}
            auth={auth}
            project={project}
            mode={tab}
            member={member}
            dark={dark}
            revision={feed.events.at(-1)?.seq ?? 0}
            denied={feed.connection === 'denied'}
            checkpoints={checkpoints}
            onPreview={showPreview}
            refresh={feed.refresh}
            linkedEvent={
              new URLSearchParams(location.search).get('project') === project ? linkedEvent : null
            }
            onNavigate={navigateEvent}
          />
        )}
        <footer className="statusbar">
          <span>
            <i className="presence online" />
            本机协作界面
          </span>
          <span>{pageTitle} · 各成员目录独立</span>
          <span className="statusbar-right">
            {status?.lastScan ? `最近扫描 ${time(status.lastScan)}` : '等待连接程序'}
            {(status?.error || status?.deliveryError) &&
              ` · ${status.error ?? status.deliveryError}`}
          </span>
        </footer>
      </main>
      {teamSettings && (
        <TeamSettings
          auth={auth}
          onClose={() => setTeamSettings(false)}
          onChanged={() => setProjectRevision((n) => n + 1)}
        />
      )}
      {setup && project && (
        <ProjectSetup
          auth={auth}
          project={project}
          onClose={() => setSetup(false)}
          onConnected={(value) => {
            chooseConnector(value);
            setSetup(false);
          }}
        />
      )}
      {settings && connector && (
        <LocalSettings
          token={auth.token}
          userId={auth.user.id}
          connector={connector}
          source={status?.agent.source ?? null}
          sourceError={status?.agent.error ?? null}
          excluded={status?.excluded ?? []}
          onConnector={(value) => {
            localContext.current = `${auth.token}|${value}|${project ?? ''}`;
            chooseConnector(value);
            setStatus(null);
            setCheckpoints([]);
          }}
          onClose={() => setSettings(false)}
          onRefresh={() => void localRefresh()}
        />
      )}
      {preview && (
        <Dialog
          titleId="restore-title"
          className="restore-modal"
          busy={busy}
          onClose={() => setPreview(null)}
        >
          <header>
            <div>
              <span className="eyebrow">RESTORE PREVIEW</span>
              <h2 id="restore-title">确认前，先检查恢复范围。</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="关闭恢复预览"
              onClick={() => setPreview(null)}
            >
              <X />
            </Button>
          </header>
          <p>
            将恢复 <strong>{auth.user.name}</strong>{' '}
            的工作区。确认后先备份当前状态，再应用以下变化。
          </p>
          <div className="preview-location">
            <FolderGit2 size={16} />
            <span>
              独立预览目录<code>{preview.directory}</code>
            </span>
          </div>
          <div className="preview-files">
            {preview.files.map((f) => (
              <details key={f.path}>
                <summary>
                  <span className={`file-status ${f.status}`}>
                    {f.status === 'added' ? '+' : f.status === 'deleted' ? '−' : 'M'}
                  </span>
                  {f.path}
                  <ChevronDown size={14} />
                </summary>
                <Patch file={f} />
              </details>
            ))}
            {!preview.files.length && <p>文件内容已经与此检查点一致，无需恢复。</p>}
          </div>
          <label className="confirm-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            我已检查范围，确认恢复我的工作区
          </label>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setPreview(null)}>
              取消
            </Button>
            <Button
              disabled={!confirmed || busy || !preview.files.length}
              onClick={() =>
                void action(async () => {
                  const result = await post(connector + '/api/restore/confirm', auth.token, {
                    previewId: preview.id,
                    confirmed: true,
                  });
                  setPreview(null);
                  setNotice(`已恢复 ${result.restored} 个文件；恢复前备份已保留。`);
                })
              }
            >
              <History />
              {busy ? '正在恢复…' : '备份当前状态并恢复'}
            </Button>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog titleId="help-title" className="help-modal" onClose={() => setHelp(false)}>
          <header>
            <h2 id="help-title">在两个真实目录中协作</h2>
            <Button
              aria-label="关闭使用说明"
              variant="ghost"
              size="icon"
              onClick={() => setHelp(false)}
            >
              <X />
            </Button>
          </header>
          <ol>
            <li>在另一个浏览器会话中，以另一成员登录。</li>
            <li>在下方目录中编辑并保存文件；另一成员的活动流会自动出现变化。</li>
            <li>用“暂停发送”测试离线积压，再恢复发送。</li>
            <li>在“我的检查点”预览历史，确认后恢复当前成员目录。</li>
          </ol>
          <code className="help-path">{status?.root ?? '.local/demo/alice/project'}</code>
          <p>
            支持新增、修改、删除；重命名记录为删除＋新增。二进制文件保存原始内容，页面只显示变化信息。超过
            2 MiB 的文件暂不纳管。
          </p>
          <p>
            在“连接设置”中主动选择当前项目的 Codex 日志并确认共享。默认仅记录后续消息，
            已有聊天历史需要单独勾选导入。
          </p>
          <p className="muted">
            界面基础组件和快照模块复用
            Codecast（MIT）。当前在本地运行，尚未部署公网。加密备份及其存储位置可在“我的检查点”中查看。
          </p>
          <Button onClick={() => setHelp(false)}>
            开始使用
            <ArrowRight />
          </Button>
        </Dialog>
      )}
    </div>
  );
}
