import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  FileCode2,
  MessageSquare,
  RefreshCw,
  Search,
  Link2,
} from 'lucide-react';
import { api, type Auth } from '../api';
import type { StoredEvent, Checkpoint } from '../../../shared/src/protocol';
import type { ActivitySummary, HistoryPage } from '../../../shared/src/history';
import { DetailSplitLayout } from './codecast/DetailSplitLayout';
import { ConversationHeaderBar, ConversationHeaderTitle } from './codecast/ConversationHeaderBar';
import { CheckpointReader } from './CheckpointReader';
import { SessionReader } from './SessionReader';
import { Button } from './ui/button';

export function WorkspaceBrowser({
  auth,
  project,
  mode,
  member,
  dark,
  revision,
  denied,
  checkpoints,
  onPreview,
  refresh,
  linkedEvent,
  onNavigate,
}: {
  auth: Auth;
  project: string;
  mode: 'activity' | 'agent';
  member: string;
  dark: boolean;
  revision: number;
  denied: boolean;
  checkpoints: Checkpoint[];
  onPreview: (id: string) => Promise<void>;
  refresh: () => void;
  linkedEvent: string | null;
  onNavigate: (id: string | null) => void;
}) {
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState<HistoryPage | null>(null),
    [selected, setSelected] = useState<StoredEvent | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(linkedEvent),
    [open, setOpen] = useState(!!linkedEvent),
    [error, setError] = useState(''),
    [detailError, setDetailError] = useState(''),
    [detailAttempt, setDetailAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [linkNotice, setLinkNotice] = useState('');
  const requestId = useRef(0),
    alive = useRef(true),
    list = useRef<HTMLDivElement>(null),
    selectedButton = useRef<HTMLButtonElement | null>(null);
  const base = `/api/projects/${project}`;
  const key = (item: ActivitySummary) =>
    mode === 'agent' ? `${item.workspaceId}:${item.sessionId}` : item.id;
  async function load(more = false, reset = false) {
    if (denied) return;
    const id = ++requestId.current;
    setBusy(true);
    const params = new URLSearchParams({ q: search, member: member === 'all' ? '' : member });
    if (more && page?.next) {
      params.set('before', String(page.next));
      params.set('head', String(page.head));
    } else if (page && !reset) params.set('after', String(page.head));
    try {
      const endpoint = `${base}/${mode === 'agent' ? 'sessions' : 'history'}`;
      const result = await api<HistoryPage>(`${endpoint}?${params}`, auth.token);
      // Reconcile every new page before moving the head; otherwise a burst can
      // leave a permanent hole between the fresh first page and retained history.
      if (page && !more && !reset) {
        let next = result.next;
        while (next !== null) {
          if (!alive.current || id !== requestId.current) return;
          params.set('head', String(result.head));
          params.set('before', String(next));
          const continuation = await api<HistoryPage>(`${endpoint}?${params}`, auth.token);
          result.items.push(...continuation.items);
          next = continuation.next;
        }
      }
      if (!alive.current || id !== requestId.current) return;
      setPage((old) => {
        if (!old || reset) return result;
        const first = more ? old.items : result.items,
          second = more ? result.items : old.items;
        const items = [...first, ...second.filter((x) => !first.some((y) => key(x) === key(y)))];
        return { ...result, items, next: more ? result.next : old.next };
      });
      setError('');
      // Desktop may show the newest detail; mobile keeps the list until an explicit selection.
      if (!selectedId && result.items[0]) setSelectedId(result.items[0].id);
    } catch (e) {
      if (alive.current && id === requestId.current) setError(String(e));
    } finally {
      if (alive.current && id === requestId.current) setBusy(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    alive.current = true;
    setPage(null);
    setError('');
    requestId.current++;
    void load(false, true);
    return () => {
      alive.current = false;
      requestId.current++;
    };
  }, [search, member, denied]);
  useEffect(() => {
    if (!denied) void load(false, !page);
  }, [revision]);
  useEffect(() => {
    if (!linkedEvent) {
      setOpen(false);
      return;
    }
    setSelectedId(linkedEvent);
    setOpen(true);
  }, [linkedEvent]);
  useEffect(() => {
    if (!selectedId || denied) {
      setSelected(null);
      return;
    }
    const abort = new AbortController();
    setSelected(null);
    setDetailError('');
    void api<StoredEvent>(`${base}/event?id=${encodeURIComponent(selectedId)}`, auth.token, {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]),
    })
      .then(setSelected)
      .catch((e) => {
        if (!abort.signal.aborted) setDetailError(String(e));
      });
    return () => abort.abort();
  }, [selectedId, denied, detailAttempt]);
  const close = () => {
    setOpen(false);
    onNavigate(null);
    selectedButton.current?.focus();
  };
  const choose = (item: ActivitySummary, button: HTMLButtonElement) => {
    selectedButton.current = button;
    setSelectedId(item.id);
    setOpen(true);
    onNavigate(item.id);
    setLinkNotice('');
  };
  async function shareLink(id: string) {
    onNavigate(id);
    setSelectedId(id);
    setOpen(true);
    try {
      await navigator.clipboard.writeText(location.href);
      setLinkNotice('链接已复制，仅项目成员可以打开');
    } catch {
      setLinkNotice('已定位到此活动，可复制地址栏链接');
    }
  }
  const activity = (
    <section className="activity-column">
      <div className="list-toolbar">
        <strong>{mode === 'agent' ? '会话' : '项目活动'}</strong>
        <span>{page?.items.length ?? 0}</span>
        <button
          aria-label="刷新活动"
          disabled={busy}
          onClick={() => {
            refresh();
            void load();
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <label className="search">
        <Search size={15} />
        <input
          aria-label="搜索活动"
          placeholder="搜索项目历史…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {(error || detailError) && (
        <div role="alert" className="reader-error">
          {error || detailError}
          <button
            onClick={() => {
              setDetailAttempt((n) => n + 1);
              void load();
            }}
          >
            重试
          </button>
        </div>
      )}
      <div className="event-list" ref={list}>
        {!denied &&
          page?.items.map((item) => (
            <button
              key={key(item)}
              className={`event-card ${item.id === selectedId || (mode === 'agent' && selected?.kind === 'agent.message' && selected.workspaceId === item.workspaceId && selected.payload.sessionId === item.sessionId) ? 'selected' : ''}`}
              onClick={(e) => choose(item, e.currentTarget)}
            >
              <div className="event-card-top">
                <span className="avatar small">{item.actor.name.slice(0, 1)}</span>
                <strong>{item.actor.name}</strong>
                <time>
                  {new Date(item.occurredAt).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <div className="event-card-title">
                {item.kind === 'checkpoint' ? <FileCode2 size={15} /> : <MessageSquare size={15} />}
                <strong>{item.title}</strong>
              </div>
              <p>{item.preview || '已保存当前工作区状态'}</p>
              <div className="event-card-bottom">
                <span>
                  {item.kind === 'checkpoint'
                    ? `${item.fileCount} 个文件变化`
                    : mode === 'agent'
                      ? `${item.messageCount} 条消息`
                      : 'Codex'}
                </span>
                {item.kind === 'checkpoint' && <span>本地修改</span>}
              </div>
            </button>
          ))}
        {busy && !page && (
          <p role="status" className="patch-empty">
            正在读取项目历史…
          </p>
        )}
        {!busy && !page?.items.length && (
          <div className="empty-state compact">
            <Activity />
            <h2>{search ? '没有匹配的历史' : '等待第一条活动'}</h2>
            <p>
              {search
                ? '尝试其他文件名或消息内容。'
                : '保存文件，或在连接设置中授权共享 Codex 会话。'}
            </p>
          </div>
        )}
        {page?.next !== null && page && (
          <Button
            className="page-button"
            variant="ghost"
            disabled={busy}
            onClick={() => void load(true)}
          >
            加载更早的{mode === 'agent' ? '会话' : '活动'}
          </Button>
        )}
      </div>
    </section>
  );
  return (
    <DetailSplitLayout list={activity} open={open} onClose={close}>
      <section className="detail-column">
        {!selected || denied ? (
          <div className="empty-state">
            <FileCode2 />
            <h2>{selectedId && !denied ? '正在读取活动…' : '选择一条活动'}</h2>
          </div>
        ) : (
          <>
            <ConversationHeaderBar
              className="detail-header"
              lead={
                <button
                  className="mobile-back icon-button"
                  aria-label="返回活动列表"
                  onClick={close}
                >
                  <ArrowLeft size={16} />
                </button>
              }
              title={
                <ConversationHeaderTitle
                  text={selected.kind === 'checkpoint' ? selected.payload.label : 'Codex 会话'}
                />
              }
              facts={
                <span className="detail-facts">
                  {selected.actor.name} · {new Date(selected.occurredAt).toLocaleString('zh-CN')}
                </span>
              }
              end={
                <button
                  className="icon-button"
                  aria-label="复制活动链接"
                  onClick={() => void shareLink(selected.id)}
                >
                  <Link2 size={15} />
                </button>
              }
            />
            {linkNotice && (
              <div role="status" className="reader-notice">
                {linkNotice}
              </div>
            )}
            {selected.kind === 'checkpoint' ? (
              <>
                <CheckpointReader
                  key={selected.id}
                  base={base}
                  token={auth.token}
                  event={selected}
                  dark={dark}
                  revision={revision}
                />
                <footer className="detail-footer">
                  <span>文件内容保存在创建者的本地检查点</span>
                  {selected.actor.id === auth.user.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        !checkpoints.some(
                          (cp) =>
                            cp.id === selected.payload.checkpointId && cp.integrity !== 'invalid',
                        )
                      }
                      onClick={() => void onPreview(selected.payload.checkpointId)}
                    >
                      预览此检查点
                    </Button>
                  )}
                </footer>
              </>
            ) : (
              <SessionReader
                key={`${selected.workspaceId}:${selected.payload.sessionId}:${mode === 'activity' ? selected.id : (linkedEvent ?? '')}`}
                base={base}
                token={auth.token}
                event={selected}
                anchor={mode === 'activity' ? selected.id : (linkedEvent ?? undefined)}
                revision={revision}
                onLink={(id) => void shareLink(id)}
              />
            )}
          </>
        )}
      </section>
    </DetailSplitLayout>
  );
}
