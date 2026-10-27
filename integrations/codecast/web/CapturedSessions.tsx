import { useEffect, useMemo, useState } from 'react';
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
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { useAuthPrincipal } from '../lib/authPrincipal';
import { AgentBadge } from './AgentBadge';
import { formatAgentType } from '../components/AgentTypeIcon';

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
}: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  throughSeq?: number;
}) {
  const principal = useAuthPrincipal();
  return (
    <Reader
      key={`${principal.epoch}:${projectId}:${workspaceId}:${sessionId}:${throughSeq ?? ''}`}
      projectId={projectId}
      workspaceId={workspaceId}
      sessionId={sessionId}
      throughSeq={throughSeq}
    />
  );
}
function Reader({
  projectId,
  workspaceId,
  sessionId,
  throughSeq,
}: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  throughSeq?: number;
}) {
  const router = useRouter();
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
  useEffect(() => {
    if (page.error) {
      setPages({});
      return;
    }
    const data = page.data;
    if (data)
      setPages((previous) => ({ ...previous, [after]: data.messages as CapturedMessage[] }));
  }, [page.data, page.error, after]);
  const rows = useMemo(() => {
    if (page.error || members.error) return [];
    const unique = new Map<string, CapturedMessage>();
    for (const row of [
      ...Object.values(pages).flat(),
      ...((page.data?.messages ?? []) as CapturedMessage[]),
    ])
      unique.set(row.eventId, row);
    return [...unique.values()].sort((a, b) => a.seq - b.seq);
  }, [pages, page.data, page.error, members.error]);
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
  if (page.error || members.error)
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
      <div className="collo-empty" role="status">
        Loading conversation…
      </div>
    );
  if (!first) return <div className="collo-empty">No captured messages in this conversation.</div>;
  return (
    <div className="collo-captured-reader" data-testid="captured-conversation">
      <div className="collo-reader-heading">
        <div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Back to conversations"
            onClick={() => router.push(`/projects/${projectId}?tab=sessions`)}
          >
            <ArrowLeft size={17} />
          </Button>
          <AgentBadge agent={first.adapter} />
          <span className="collo-reader-owner">{member?.name || 'Member'}</span>
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
          backHref={`/projects/${projectId}?tab=sessions`}
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

export function CapturedSessions({ projectId }: { projectId: string }) {
  const principal = useAuthPrincipal();
  return <SessionList key={`${principal.epoch}:${projectId}`} projectId={projectId} />;
}
function SessionList({ projectId }: { projectId: string }) {
  const router = useRouter(),
    search = useSearchParams();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [filter, setFilter] = useState('');
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
  const through = search.get('through');
  const throughSeq =
    through && /^\d+$/.test(through) && Number.isSafeInteger(Number(through))
      ? Number(through)
      : undefined;
  const closeHref = `/projects/${projectId}?tab=sessions`;
  const name = (id: string) =>
    members.data?.members.find((m: { id: string }) => m.id === id)?.name ?? 'Member';
  return (
    <div className="collo-sessions h-full" data-testid="captured-sessions">
      <DetailSplitLayout
        closeHref={closeHref}
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
                placeholder="Filter by member or session…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
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
            {!page.data && !page.error && <p role="status">Loading conversations…</p>}
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
            {!page.error &&
              !members.error &&
              page.data?.page
                .filter((s: { userId: string; sessionId: string }) =>
                  `${name(s.userId)} ${s.sessionId}`.toLowerCase().includes(filter.toLowerCase()),
                )
                .map(
                  (s: {
                    _id: string;
                    workspaceId: string;
                    sessionId: string;
                    userId: string;
                    updatedAt: number;
                    messageCount: number;
                    adapter?: string;
                  }) => (
                    <button
                      key={s._id}
                      data-captured-session={s.sessionId}
                      className={`collo-session-row ${sessionId === s.sessionId && workspaceId === s.workspaceId ? 'selected' : ''}`}
                      onClick={() =>
                        router.push(capturedHref(projectId, s.workspaceId, s.sessionId))
                      }
                    >
                      <span className="collo-session-glyph">
                        <AgentBadge agent={s.adapter} compact />
                      </span>
                      <span className="collo-session-summary">
                        <strong>{name(s.userId)}</strong>
                        <span>
                          {formatAgentType(s.adapter)} · {s.messageCount} messages · {s.sessionId}
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
          />
        ) : null}
      </DetailSplitLayout>
    </div>
  );
}
