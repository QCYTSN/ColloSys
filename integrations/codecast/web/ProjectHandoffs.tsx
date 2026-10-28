import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { colloApi as api } from './colloApi';
import type { GenericId as Id } from 'convex/values';
import { ArrowsLeftRight, Plus, ArrowLeft, ArrowRight, Check, X } from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { DetailSplitLayout } from '../components/DetailSplitLayout';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { useAuthPrincipal } from '../lib/authPrincipal';
import { useInboxStore } from '../store/inboxStore';
import { capturedHref } from './CapturedSessions';
import { readView, writeView, viewKey, clearProjectViews } from './productViewState';

type Draft = {
  recipient: string;
  title: string;
  context: string;
  nextSteps: string;
  taskId: string;
  source?: { workspaceId: string; sessionId: string };
};
const emptyDraft: Draft = { recipient: '', title: '', context: '', nextSteps: '', taskId: '' };
// Unsaved form drafts only. Records and status always come from Convex.
export function ProjectHandoffs({ projectId }: { projectId: string }) {
  const principal = useAuthPrincipal();
  return (
    <Handoffs
      key={`${principal.epoch}:${projectId}`}
      projectId={projectId}
      scope={viewKey(projectId, 'handoff-draft')}
    />
  );
}
function Handoffs({ projectId, scope }: { projectId: string; scope: string }) {
  const router = useRouter(),
    search = useSearchParams();
  const selected = search.get('handoff');
  const incomingSource =
    search.get('fromWorkspace') && search.get('fromSession')
      ? { workspaceId: search.get('fromWorkspace')!, sessionId: search.get('fromSession')! }
      : undefined;
  const [open, setOpen] = useState(!!incomingSource || !!search.get('fromTask'));
  const [draft, setDraft] = useState<Draft>(() => ({
    ...(readView<Draft>(scope) ?? emptyDraft),
    ...(incomingSource ? { source: incomingSource } : {}),
    ...(search.get('fromTask') ? { taskId: search.get('fromTask')! } : {}),
  }));
  const source = draft.source;
  const sourceWorkspace = search.get('fromWorkspace'),
    sourceSession = search.get('fromSession'),
    sourceTask = search.get('fromTask');
  useEffect(() => {
    if ((sourceWorkspace && sourceSession) || sourceTask) {
      setOpen(true);
      setDraft((previous) => ({
        ...previous,
        ...(sourceTask ? { taskId: sourceTask } : {}),
        source:
          sourceWorkspace && sourceSession
            ? { workspaceId: sourceWorkspace, sessionId: sourceSession }
            : undefined,
      }));
    }
  }, [sourceWorkspace, sourceSession, sourceTask, projectId, router]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const request = useRef<{ contents: string; id: string } | null>(null);
  const viewer = useInboxStore((s) => s.currentUser?._id);
  const tasks = useInboxStore((s) => s.tasks);
  const members = useQueryNoThrow(api.collo.projectMembers, {
    projectId: projectId as Id<'projects'>,
  });
  const page = useQueryNoThrow(api.colloHandoffs.list, {
    projectId: projectId as Id<'projects'>,
    paginationOpts: { numItems: 30, cursor: cursors.at(-1) ?? null },
  });
  const detail = useQueryNoThrow(
    api.colloHandoffs.get,
    selected ? { id: selected as Id<'collo_handoffs'> } : 'skip',
  );
  const send = useMutation(api.colloHandoffs.send),
    respond = useMutation(api.colloHandoffs.respond);
  const closeHref = `/projects/${projectId}?tab=handoffs`;
  function changeOpen(value: boolean) {
    if (busy) return;
    setOpen(value);
    // Consume after the project route has canonicalized. An effect competing
    // with that route replacement can restore the stale open-intent parameters.
    if (!value && (sourceWorkspace || sourceSession || sourceTask)) router.replace(closeHref);
  }
  useEffect(() => {
    if (!members.error && !page.error) writeView(scope, draft);
  }, [scope, draft, members.error, page.error, projectId]);
  useEffect(() => {
    if (members.error || page.error) {
      clearProjectViews(projectId);
      setOpen(false);
      setDraft({ ...emptyDraft });
    }
  }, [members.error, page.error, projectId]);
  const edit = (key: keyof Draft, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const name = (id: string) =>
    members.data?.members.find((m: { id: string }) => m.id === id)?.name ?? 'Member';
  const handoff =
    !detail.error && !members.error && detail.data?.projectId === projectId ? detail.data : null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const contents = JSON.stringify({ ...draft, source });
    if (request.current?.contents !== contents)
      request.current = { contents, id: crypto.randomUUID() };
    try {
      const result = await send({
        projectId: projectId as Id<'projects'>,
        requestId: request.current.id,
        recipient: draft.recipient as Id<'users'>,
        title: draft.title,
        context: draft.context,
        nextSteps: draft.nextSteps,
        ...(draft.taskId ? { taskId: draft.taskId as Id<'tasks'> } : {}),
        ...(source ? { source } : {}),
      });
      writeView(scope, { ...emptyDraft });
      setDraft({ ...emptyDraft });
      setOpen(false);
      request.current = null;
      router.push(`${closeHref}&handoff=${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Handoff could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function answer(status: 'accepted' | 'declined' | 'cancelled') {
    if (!handoff) return;
    setBusy(true);
    setError('');
    try {
      await respond({ id: handoff._id, revision: handoff.revision, status });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Handoff changed. Reload and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="h-full collo-handoffs" data-testid="project-handoffs">
      <DetailSplitLayout
        closeHref={closeHref}
        accessValid={!page.error && !members.error && !detail.error}
        list={
          <div className="collo-session-list">
            <div className="collo-page-heading">
              <div>
                <h2>Handoffs</h2>
                <p>Give the next person the context to continue.</p>
              </div>
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus size={16} />
                New handoff
              </Button>
            </div>
            {(page.error || members.error) && (
              <p role="alert" className="collo-inline-notice">
                Handoffs could not be loaded.{' '}
                <Button
                  variant="ghost"
                  onClick={() => {
                    page.retry();
                    members.retry();
                  }}
                >
                  Retry
                </Button>
              </p>
            )}
            {!page.data && !page.error && <p role="status">Loading handoffs…</p>}
            {!page.error &&
              !members.error &&
              page.data?.page.map((h) => (
                <button
                  key={h._id}
                  data-handoff-id={h._id}
                  className={`collo-session-row ${selected === h._id ? 'selected' : ''}`}
                  onClick={() => router.push(`${closeHref}&handoff=${h._id}`)}
                >
                  <span className="collo-session-glyph">
                    <ArrowsLeftRight size={21} />
                  </span>
                  <span className="collo-session-summary">
                    <strong>{h.title}</strong>
                    <span>
                      {name(h.sender)} → {name(h.recipient)}
                    </span>
                  </span>
                  <span className="collo-tag" data-status={h.status}>
                    {h.status}
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            {page.data?.page.length === 0 && (
              <div className="collo-empty">
                <ArrowsLeftRight size={30} />
                <h3>A clear next step</h3>
                <p>Share a conversation, a task and what needs to happen next.</p>
                <Button variant="outline" onClick={() => setOpen(true)}>
                  Create a handoff
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
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!page.data || page.data.isDone}
                onClick={() => setCursors((v) => [...v, page.data!.continueCursor])}
              >
                Next
              </Button>
            </div>
          </div>
        }
      >
        {selected ? (
          <div className="collo-handoff-detail">
            <Button variant="ghost" size="sm" onClick={() => router.push(closeHref)}>
              <ArrowLeft size={16} /> Back to handoffs
            </Button>
            {detail.error && (
              <p role="alert">
                Could not read this handoff.{' '}
                <Button variant="ghost" onClick={detail.retry}>
                  Retry
                </Button>
              </p>
            )}
            {handoff ? (
              <>
                <span className="collo-tag" data-status={handoff.status}>
                  {handoff.status}
                </span>
                <h2>{handoff.title}</h2>
                <p className="collo-handoff-people">
                  {name(handoff.sender)} <ArrowRight size={14} /> {name(handoff.recipient)}
                </p>
                <section>
                  <h3>Context</h3>
                  <p>{handoff.context}</p>
                </section>
                <section>
                  <h3>Next steps</h3>
                  <p>{handoff.nextSteps || 'No additional steps specified.'}</p>
                </section>
                <div className="collo-handoff-links">
                  {handoff.source && (
                    <Link
                      href={capturedHref(
                        projectId,
                        handoff.source.workspaceId,
                        handoff.source.sessionId,
                        handoff.source.throughSeq,
                      )}
                    >
                      Read captured conversation <ArrowRight size={16} />
                    </Link>
                  )}
                  {handoff.taskId && (
                    <Link href={`/projects/${projectId}/${handoff.taskId}`}>
                      Open task and comments <ArrowRight size={16} />
                    </Link>
                  )}
                  {handoff.checkpoint && (
                    <p className="collo-inline-notice">
                      Checkpoint {handoff.checkpoint.checkpointId} ·{' '}
                      {handoff.checkpoint.workspaceId}
                    </p>
                  )}
                </div>
                {error && (
                  <p role="alert" className="collo-inline-notice">
                    {error}
                  </p>
                )}
                {handoff.status === 'pending' && (
                  <div className="collo-handoff-actions">
                    {viewer === handoff.recipient ? (
                      <>
                        <Button disabled={busy} onClick={() => answer('accepted')}>
                          <Check size={16} />
                          Accept handoff
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => answer('declined')}
                        >
                          <X size={16} />
                          Decline
                        </Button>
                      </>
                    ) : viewer === handoff.sender ? (
                      <Button variant="outline" disabled={busy} onClick={() => answer('cancelled')}>
                        Cancel handoff
                      </Button>
                    ) : null}
                  </div>
                )}
              </>
            ) : !detail.error ? (
              <p role="status">
                {detail.data === null ? 'Handoff not found.' : 'Loading handoff…'}
              </p>
            ) : null}
          </div>
        ) : null}
      </DetailSplitLayout>
      <Dialog open={open} onOpenChange={changeOpen}>
        {!members.error && !page.error && (
          <DialogContent className="collo-handoff-form">
            <DialogHeader>
              <DialogTitle>New handoff</DialogTitle>
              <DialogDescription>
                A recipient, the context and a useful next step.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit}>
              <label>
                To
                <select
                  required
                  aria-label="Handoff recipient"
                  value={draft.recipient}
                  onChange={(e) => edit('recipient', e.target.value)}
                >
                  <option value="">Choose a project member</option>
                  {members.data?.members
                    .filter((m: { id: string }) => m.id !== viewer)
                    .map((m: { id: string; name: string }) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Title
                <input
                  required
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) => edit('title', e.target.value)}
                  placeholder="What is ready to continue?"
                />
              </label>
              <label>
                Context
                <textarea
                  required
                  rows={4}
                  maxLength={12000}
                  value={draft.context}
                  onChange={(e) => edit('context', e.target.value)}
                  placeholder="What has happened, and what should they know?"
                />
              </label>
              <label>
                Next steps
                <textarea
                  rows={3}
                  maxLength={8000}
                  value={draft.nextSteps}
                  onChange={(e) => edit('nextSteps', e.target.value)}
                  placeholder="A clear next action"
                />
              </label>
              <label>
                Related task <span className="text-sol-text-dim">(optional)</span>
                <select value={draft.taskId} onChange={(e) => edit('taskId', e.target.value)}>
                  <option value="">No related task</option>
                  {!members.error &&
                    Object.values(
                      tasks as Record<string, { _id: string; title: string; project_id?: string }>,
                    )
                      .filter((t) => t.project_id === projectId)
                      .map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.title}
                        </option>
                      ))}
                </select>
              </label>
              {source && (
                <p className="collo-inline-notice">
                  The current captured conversation will be attached.
                </p>
              )}
              {error && (
                <p role="alert" className="collo-inline-notice">
                  {error}
                </p>
              )}
              <div className="collo-handoff-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => changeOpen(false)}
                  disabled={busy}
                >
                  Keep draft
                </Button>
                <Button type="submit" disabled={busy || !!members.error || !draft.recipient}>
                  {busy ? 'Sending…' : 'Send handoff'}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
