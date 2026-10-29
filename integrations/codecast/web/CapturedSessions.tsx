import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { colloApi as api } from './colloApi';
import type { Id } from '@codecast/convex/convex/_generated/dataModel';
import {
  Chats,
  ArrowLeft,
  ArrowRight,
  MagnifyingGlass,
  ArrowsLeftRight,
} from '@phosphor-icons/react';
import { ConversationView } from '../components/ConversationView';
import type { ConversationData } from '../components/conversation/types';
import { Button } from '../components/ui/button';
import { DetailSplitLayout } from '../components/DetailSplitLayout';
import { useProductQuery as useQueryNoThrow } from './useProductQuery';
import { useAuthPrincipal } from '../lib/authPrincipal';
import { AgentBadge } from './AgentBadge';
import { formatAgentType } from '../components/AgentTypeIcon';
import { readView, writeView, viewKey, clearProjectViews } from './productViewState';

export function capturedHref(
  projectId: string,
  workspaceId: string,
  sessionId: string,
  throughSeq?: number,
) {
  const p = new URLSearchParams({ tab: 'sessions', workspace: workspaceId, session: sessionId });
  if (throughSeq !== undefined) p.set('through', String(throughSeq));
  return `/projects/${projectId}?${p}`;
}
type CapturedMessage = {
  eventId: string;
  seq: number;
  userId: string;
  occurredAt: number;
  role: string;
  text: string;
  adapter: string;
};
export function CapturedReader({
  projectId,
  workspaceId,
  sessionId,
  throughSeq,
  backHref,
}: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  throughSeq?: number;
  backHref?: string;
}) {
  const principal = useAuthPrincipal();
  return (
    <Reader
      key={`${principal.epoch}:${projectId}:${workspaceId}:${sessionId}:${throughSeq ?? ''}`}
      projectId={projectId}
      workspaceId={workspaceId}
      sessionId={sessionId}
      throughSeq={throughSeq}
      backHref={backHref}
    />
  );
}
function Reader({
  projectId,
  workspaceId,
  sessionId,
  throughSeq,
  backHref,
}: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  throughSeq?: number;
  backHref?: string;
}) {
  const router = useRouter();
  const key = viewKey(projectId, `conversation:${workspaceId}:${sessionId}:${throughSeq ?? ''}`);
  const saved = useRef(readView<{ cursor: number; anchor?: string; offset?: number }>(key));
  const restored = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const [after, setAfter] = useState(0);
  const [pages, setPages] = useState<Record<number, CapturedMessage[]>>({});
  const page = useQueryNoThrow(api.colloSessions.messages, {
    projectId: projectId as Id<'projects'>,
    workspaceId,
    sessionId,
    after,
    ...(throughSeq === undefined ? {} : { throughSeq }),
  });
  const members = useQueryNoThrow(api.collo.projectMembers, {
    projectId: projectId as Id<'projects'>,
  });
  const access = useRef(true);
  access.current = !page.denied && !members.denied;
  // Replay only previously requested pages through the existing authorized query.
  // Reading hints contain no message text and are useless without fresh access.
  useEffect(() => {
    if (page.denied || members.denied) {
      clearProjectViews(projectId);
      saved.current = undefined;
      return;
    }
    if (page.data?.hasMore && page.data.cursor <= (saved.current?.cursor ?? 0))
      setAfter(page.data.cursor);
  }, [page.data, page.denied, members.denied, projectId]);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const remember = () => {
      if (!access.current) return;
      const sc = root.querySelector<HTMLElement>('[data-sv-feed]');
      if (!sc || !sc.clientHeight) return;
      const top = sc.getBoundingClientRect().top;
      const anchors = [...sc.querySelectorAll<HTMLElement>('[data-reading-message]')];
      const row = anchors.find((el) => el.getBoundingClientRect().bottom > top + 8);
      const anchor = row?.dataset.readingMessage;
      writeView(key, {
        cursor: after,
        anchor,
        offset: row ? row.getBoundingClientRect().top - top : 0,
      });
    };
    root.addEventListener('scroll', remember, true);
    return () => {
      remember();
      root.removeEventListener('scroll', remember, true);
    };
  }, [key, after, !!page.data]);
  useEffect(() => {
    if (page.denied || members.denied) {
      setPages({});
      return;
    }
    const data = page.data;
    if (data)
      setPages((previous) => ({ ...previous, [after]: data.messages as CapturedMessage[] }));
  }, [page.data, page.denied, members.denied, after]);
  const rows = useMemo(() => {
    if (page.denied || members.denied) return [];
    const unique = new Map<string, CapturedMessage>();
    for (const row of [
      ...Object.values(pages).flat(),
      ...((page.data?.messages ?? []) as CapturedMessage[]),
    ])
      unique.set(row.eventId, row);
    return [...unique.values()].sort((a, b) => a.seq - b.seq);
  }, [pages, page.data, page.denied, members.denied]);
  const first = rows[0];
  const member = members.data?.members.find((m: { id: string }) => m.id === first?.userId);
  const conversation: ConversationData = useMemo(
    () => ({
      _id: `capture:${workspaceId}:${sessionId}` as Id<'conversations'>,
      session_id: sessionId,
      user_id: first?.userId,
      is_own: false,
      title: rows.find((r) => r.role === 'user')?.text.slice(0, 100) || 'Captured conversation',
      agent_type: first?.adapter,
      started_at: first?.occurredAt,
      updated_at: rows.at(-1)?.occurredAt,
      message_count: rows.length,
      user: { name: member?.name || 'Member' },
      messages: rows.map((r) => ({
        _id: r.eventId,
        role: r.role,
        content: r.text,
        timestamp: r.occurredAt,
      })),
    }),
    [rows, member?.name, workspaceId, sessionId],
  );
  if (page.denied || members.denied || ((page.error || members.error) && !rows.length))
    return (
      <div className="collo-empty" role="alert">
        <p>Could not read this conversation. Access may have changed.</p>
        <Button
          variant="outline"
          onClick={() => {
            page.retry();
            members.retry();
          }}
        >
          Retry
        </Button>
      </div>
    );
  if (!page.data && !rows.length)
    return (
      <div className="collo-reader-loading" role="status" aria-label="Loading conversation">
        <div className="collo-reader-heading">Loading conversation…</div>
        <div className="collo-skeleton-list">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  if (!first) return <div className="collo-empty">No captured messages in this conversation.</div>;
  return (
    <div ref={container} className="collo-captured-reader" data-testid="captured-conversation">
      <div className="collo-reader-heading">
        <div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Back to conversations"
            onClick={() => router.push(backHref ?? `/projects/${projectId}?tab=sessions`)}
          >
            <ArrowLeft size={17} />
          </Button>
          <AgentBadge agent={first.adapter} />
          <span className="collo-reader-owner" title={member?.name || 'Member'}>{member?.name || 'Member'}</span>
          <span className="collo-tag">Captured session</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            router.push(
              `/projects/${projectId}?${new URLSearchParams({ tab: 'handoffs', fromWorkspace: workspaceId, fromSession: sessionId })}`,
            )
          }
        >
          <ArrowsLeftRight size={16} />
          Handoff
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ConversationView
          conversation={conversation}
          backHref={backHref ?? `/projects/${projectId}?tab=sessions`}
          targetMessageId={
            rows.some((r) => r.eventId === saved.current?.anchor)
              ? saved.current?.anchor
              : undefined
          }
          onTargetSettled={() => {
            if (restored.current || saved.current?.offset === undefined) return;
            const sc = container.current?.querySelector<HTMLElement>('[data-sv-feed]');
            const row = [
              ...(sc?.querySelectorAll<HTMLElement>('[data-reading-message]') ?? []),
            ].find((el) => el.dataset.readingMessage === saved.current?.anchor);
            if (sc && row) {
              restored.current = true;
              sc.scrollTop +=
                row.getBoundingClientRect().top -
                sc.getBoundingClientRect().top -
                saved.current.offset;
            }
          }}
          guest
          isOwner={false}
          showMessageInput={false}
          hideHeader
          initialDensity="full"
          openAtTop
          stickyPrompt={false}
          hasMoreBelow={page.data?.hasMore ?? false}
          isLoadingNewer={!page.data}
          onLoadNewer={() => {
            if (page.data) setAfter(page.data.cursor);
          }}
        />
      </div>
      {(page.data?.hasMore || !page.data) && (
        <div className="collo-reader-pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={!page.data}
            onClick={() => {
              if (page.data) setAfter(page.data.cursor);
            }}
          >
            {page.data ? 'Load next messages' : 'Loading messages…'} <ArrowRight size={15} />
          </Button>
        </div>
      )}
    </div>
  );
}

export function CapturedSessions({
  projectId,
  global = false,
}: {
  projectId: string;
  global?: boolean;
}) {
  const principal = useAuthPrincipal();
  return (
    <SessionList key={`${principal.epoch}:${projectId}`} projectId={projectId} global={global} />
  );
}
function SessionList({ projectId, global }: { projectId: string; global: boolean }) {
  const router = useRouter(),
    search = useSearchParams();
  const listKey = viewKey(projectId, global ? 'global-conversations' : 'project-conversations');
  const [cursors, setCursors] = useState<(string | null)[]>(
    () => readView<{ cursors: (string | null)[] }>(listKey)?.cursors ?? [null],
  );
  const [filter, setFilter] = useState(() => readView<{ filter: string }>(listKey)?.filter ?? '');
  const [indexing, setIndexing] = useState(false),
    [error, setError] = useState('');
  const indexHistory = useMutation(api.colloSessions.indexHistory);
  const page = useQueryNoThrow(api.colloSessions.list, {
    projectId: projectId as Id<'projects'>,
    paginationOpts: { numItems: 30, cursor: cursors.at(-1) ?? null },
  });
  const members = useQueryNoThrow(api.collo.projectMembers, {
    projectId: projectId as Id<'projects'>,
  });
  const workspaceId = search.get('workspace'),
    sessionId = search.get('session');
  useEffect(() => {
    if (page.denied || members.denied) {
      clearProjectViews(projectId);
      return;
    }
    writeView(listKey, { cursors, filter });
  }, [cursors, filter, listKey, page.error, members.error, projectId]);
  const through = search.get('through');
  const throughSeq =
    through && /^\d+$/.test(through) && Number.isSafeInteger(Number(through))
      ? Number(through)
      : undefined;
  const closeHref = global ? `/inbox?project=${projectId}` : `/projects/${projectId}?tab=sessions`;
  const name = (id: string) =>
    members.data?.members.find((m: { id: string }) => m.id === id)?.name ?? 'Member';
  const matching =
    page.data?.page.filter((s: { userId: string; sessionId: string; preview?: string }) =>
      `${name(s.userId)} ${s.sessionId} ${s.preview ?? ''}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  return (
    <div className="collo-sessions h-full" data-testid="captured-sessions">
      <DetailSplitLayout
        closeHref={closeHref}
        accessValid={!page.denied && !members.denied}
        list={
          <div className="collo-session-list">
            <div className="collo-page-heading">
              <div>
                <h2>Conversations</h2>
                <p>Captured work from your team's connected directories.</p>
              </div>
            </div>
            <label className="collo-search">
              <MagnifyingGlass size={17} />
              <input
                aria-label="Filter captured conversations"
                placeholder="Filter this page…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <p className="collo-search-scope">
              Filters this page’s member, session ID and opening message. Use Next for older
              conversations.
            </p>
            {(page.error || members.error || error) && (
              <div className="collo-inline-notice" role="alert">
                {error || 'Conversations could not be loaded.'}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    page.retry();
                    members.retry();
                    setError('');
                  }}
                >
                  Retry
                </Button>
              </div>
            )}
            {!page.data && !page.error && (
              <div className="collo-skeleton-list" role="status" aria-label="Loading conversations">
                <i />
                <i />
                <i />
              </div>
            )}
            {page.data && !page.data.historyIndexed && (
              <div className="collo-inline-notice">
                Older activity is available to index.{' '}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={indexing}
                  onClick={async () => {
                    setIndexing(true);
                    setError('');
                    try {
                      await indexHistory({ projectId: projectId as Id<'projects'> });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Indexing failed');
                    } finally {
                      setIndexing(false);
                    }
                  }}
                >
                  Index next batch
                </Button>
              </div>
            )}
            {!page.denied &&
              !members.denied &&
              matching.map(
                (s: {
                  _id: string;
                  workspaceId: string;
                  sessionId: string;
                  userId: string;
                  updatedAt: number;
                  messageCount: number;
                  adapter?: string;
                  preview?: string;
                }) => (
                  <button
                    key={s._id}
                    data-captured-session={s.sessionId}
                    className={`collo-session-row ${sessionId === s.sessionId && workspaceId === s.workspaceId ? 'selected' : ''}`}
                    onClick={() =>
                      router.push(
                        global
                          ? `${closeHref}&workspace=${encodeURIComponent(s.workspaceId)}&session=${encodeURIComponent(s.sessionId)}`
                          : capturedHref(projectId, s.workspaceId, s.sessionId),
                      )
                    }
                  >
                    <span className="collo-session-glyph">
                      <AgentBadge agent={s.adapter} compact />
                    </span>
                    <span className="collo-session-summary">
                      <strong>{s.preview || `${formatAgentType(s.adapter)} conversation`}</strong>
                      <span title={`${name(s.userId)} · ${formatAgentType(s.adapter)} · ${s.messageCount} messages`}>
                        {name(s.userId)} · {formatAgentType(s.adapter)} · {s.messageCount} messages
                      </span>
                    </span>
                    <time>
                      {new Date(s.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                    <ArrowRight size={16} />
                  </button>
                ),
              )}
            {!!filter && !!page.data?.page.length && !matching.length && (
              <div className="collo-empty">
                <h3>No matches on this page</h3>
                <p>Try a different phrase or browse older conversations.</p>
                <Button variant="outline" onClick={() => setFilter('')}>
                  Clear filter
                </Button>
              </div>
            )}
            {page.data?.page.length === 0 && (
              <div className="collo-empty">
                <Chats size={28} />
                <h3>No conversations yet</h3>
                <p>Connect a Codex log from My directories to capture a session.</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(`/projects/${projectId}?tab=workspaces&workspaceView=history`)
                  }
                >
                  Open my directories
                </Button>
              </div>
            )}
            <div className="collo-list-pagination">
              <Button
                variant="ghost"
                size="sm"
                disabled={cursors.length === 1}
                onClick={() => setCursors((v) => v.slice(0, -1))}
              >
                <ArrowLeft size={15} />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!page.data || page.data.isDone}
                onClick={() => setCursors((v) => [...v, page.data!.continueCursor])}
              >
                Next
                <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        }
      >
        {workspaceId && sessionId ? (
          <CapturedReader
            projectId={projectId}
            workspaceId={workspaceId}
            sessionId={sessionId}
            throughSeq={throughSeq}
            backHref={closeHref}
          />
        ) : null}
      </DetailSplitLayout>
    </div>
  );
}
