import { memo, useCallback, useDeferredValue, useEffect, useState, useRef, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthToken } from '@convex-dev/auth/react';
import {
  FolderOpen,
  History,
  RefreshCw,
  Plus,
  Plug,
  Pause,
  Play,
  MessageSquare,
  ArrowLeft,
} from './ProductIcons';
import { AgentBadge } from './AgentBadge';
import { CheckpointSource } from './CheckpointSource';
import { DirectoryStorage } from './DirectoryStorage';
import { formatAgentType } from '../components/AgentTypeIcon';
import { capturedHref } from './CapturedSessions';
import { FileDiffLayout } from '../components/FileDiffLayout';
import { MemberFace } from './MemberFace';
import { readView, writeView, viewKey } from './productViewState';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { parsePatch } from '../lib/patchParser';
import { DetailSplitLayout } from '../components/DetailSplitLayout';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { RailDay, RailRow } from '../components/timeline/Rail';
import { groupByDay } from '../lib/timelineRail';
import { useTabVisible } from '../hooks/usePagePresence';
import { useAuthPrincipal, authPrincipal } from '../lib/authPrincipal';
import { useCollaboration } from './useCollaboration';
import type { FileChange, Checkpoint } from './protocol';
import type {
  LocalDirectory,
  DirectoryStatus,
  RestorePreview,
  AgentPreview,
} from './workspaceTypes';
import { isPaired, localRequest, chooseDirectory, LOCAL_INSPECTION_INTERVAL_MS } from './local';

const field =
  'w-full rounded-md border border-sol-border bg-sol-bg px-3 py-2 text-sm text-sol-text';
type FilesProps = { files: FileChange[]; scope: string };
function Files({ files, scope }: FilesProps) {
  // Commit the selected checkpoint and its real status before mounting the
  // expensive diff tree. React schedules the content; there is no timed delay.
  // This component is keyed by event and unmounted on access loss, so deferred
  // data can only belong to the same currently authorized checkpoint.
  const ready = useDeferredValue<FileChange[] | null>(files, null);
  return (
    <div className="collo-files-slot" aria-busy={ready !== files}>
      {ready ? (
        <FileContent files={ready} scope={scope} />
      ) : (
        <div className="collo-reader-loading" role="status">
          Preparing file changes…
        </div>
      )}
    </div>
  );
}
const FileContent = memo(function FileContent({ files, scope }: FilesProps) {
  const saved = useRef(readView<{ file?: string; line?: number }>(scope));
  const projected = useMemo(
    () =>
      files.map((file) => {
        const lines = parsePatch(file.patch || '').hunks.flatMap((hunk) => hunk.lines);
        const additions = lines.filter((line) => line.type === 'addition').length;
        const deletions = lines.filter((line) => line.type === 'deletion').length;
        return {
          filename: file.path,
          status: file.status,
          additions,
          deletions,
          changes: additions + deletions,
          patch: file.status === 'excluded' || file.binary ? undefined : file.patch,
        };
      }),
    [files],
  );
  return (
    <div className="collo-checkpoint-diff">
      <FileDiffLayout
        files={projected}
        title="Changed files"
        focusFile={saved.current?.file}
        focusLine={saved.current?.line}
        onPositionChange={(position) => writeView(scope, position)}
        onFileSelected={(file) => writeView(scope, { file })}
        renderFileExtra={(rendered) => {
          const file = files.find(
            (f) => f.path === (rendered.originalFilename ?? rendered.filename),
          );
          if (!file) return null;
          return (
            <>
              {file.status === 'excluded' && (
                <p className="collo-inline-notice">
                  No longer shared. Current content was not captured and cannot be restored from
                  this record.
                </p>
              )}
              {file.binary && (
                <p className="collo-inline-notice">
                  Binary file · full content stays on the source device.
                </p>
              )}
              {file.truncated && (
                <p className="collo-inline-notice">
                  Shared diff truncated · full captured content stays on the source device.
                </p>
              )}
            </>
          );
        }}
      />
    </div>
  );
});
export function LocalWorkspaces({ projectId }: { projectId: string }) {
  const token = useAuthToken();
  const principal = useAuthPrincipal();
  const visible = useTabVisible();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const current = search.get('event');
  const pane = search.get('workspaceView') === 'history' ? 'history' : 'activity';
  const collaboration = useCollaboration(projectId, current);
  const { events, workspaces, selectedEvent, checkpoint } = collaboration;
  const link = (event: string | null, nextPane = pane) => {
    const params = new URLSearchParams(search);
    params.set('tab', 'workspaces');
    if (event) params.set('event', event);
    else params.delete('event');
    if (nextPane === 'history') params.set('workspaceView', 'history');
    else params.delete('workspaceView');
    return `${pathname}?${params}`;
  };
  const closeHref = link(null);
  const setCurrent = (event: string | null) => router.push(link(event));
  const setPane = (nextPane: string) => router.push(link(null, nextPane));
  const [directories, setDirectories] = useState<LocalDirectory[]>([]);
  const requestedDirectory = search.get('directory');
  const [selected, setSelected] = useState<string | null>(requestedDirectory);
  const [memberFilter, setMemberFilter] = useState('');
  const [details, setDetails] = useState<DirectoryStatus | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [root, setRoot] = useState('');
  const [label, setLabel] = useState('');
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [log, setLog] = useState('');
  const [agentPreview, setAgentPreview] = useState<(AgentPreview & { path: string }) | null>(null);
  const [history, setHistory] = useState(false);
  const directory = directories.find((d) => d.workspaceId === selected);
  const identity = `${principal.principalId}:${principal.epoch}:${projectId}`;
  const scope = `${identity}:${directory?.workspaceId}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const activeIdentity = useRef(identity);
  activeIdentity.current = identity;
  const refresh = useCallback(async () => {
    if (!token || !isPaired()) return;
    const requestedIdentity = identity;
    const data = await localRequest<{ connectors: LocalDirectory[] }>(token, '/api/connectors');
    if (activeIdentity.current !== requestedIdentity || authPrincipal.epoch() !== principal.epoch)
      return;
    const own = data.connectors.filter((d: LocalDirectory) => d.projectId === projectId);
    setDirectories(own);
    setSelected((old) =>
      own.some((d: LocalDirectory) => d.workspaceId === old) ? old : (own[0]?.workspaceId ?? null),
    );
  }, [token, projectId, identity, principal.epoch]);
  const inspectionGeneration = useRef(0);
  const inspect = useCallback(async () => {
    const generation = ++inspectionGeneration.current;
    const requestedScope = scope;
    if (!directory?.running) {
      setDetails(null);
      setCheckpoints([]);
      return;
    }
    const current = () =>
      generation === inspectionGeneration.current &&
      activeScope.current === requestedScope &&
      authPrincipal.epoch() === principal.epoch;
    try {
      const snapshot = await localRequest<{ status: DirectoryStatus; checkpoints: Checkpoint[] }>(
        token,
        '/api/inspect',
        undefined,
        directory.url,
      );
      if (current()) {
        setDetails(snapshot.status);
        setCheckpoints(snapshot.checkpoints);
      }
    } catch (error) {
      if (current()) throw error;
    }
  }, [token, directory?.url, directory?.running, scope, principal.epoch]);
  useEffect(() => {
    setDirectories([]);
    setSelected(null);
    setConnectOpen(false);
    setAgentOpen(false);
    setStorageOpen(false);
    setRoot('');
    setLog('');
    setError('');
  }, [identity]);
  useEffect(() => {
    if (requestedDirectory) setSelected(requestedDirectory);
  }, [requestedDirectory, identity]);
  useEffect(() => {
    setDetails(null);
    setCheckpoints([]);
    setPreview(null);
    setAgentPreview(null);
    setStorageOpen(false);
  }, [scope]);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void refresh().catch((e) => {
      if (alive && authPrincipal.epoch() === principal.epoch) setError(e.message);
    });
    return () => {
      alive = false;
    };
  }, [refresh, visible, principal.epoch]);
  // Local capture commits before its first part is sent. Refresh once per new
  // checkpoint, not for every transport part or every teammate's message.
  const localCheckpoint = events.find(
    (event) => event.workspaceId === directory?.workspaceId && event.kind === 'checkpoint',
  );
  const localCheckpointId =
    localCheckpoint?.kind === 'checkpoint' ? localCheckpoint.payload.checkpointId : null;
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      if (alive) {
        await inspect().catch((e) => {
          if (alive) setError(e.message);
        });
        if (alive) timer = setTimeout(update, LOCAL_INSPECTION_INTERVAL_MS);
      }
    };
    void update();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [inspect, visible, localCheckpointId]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    const requestedScope = scope;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (activeScope.current === requestedScope && authPrincipal.epoch() === principal.epoch)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const local = async <T = unknown,>(route: string, body?: unknown): Promise<T> => {
    if (!directory?.running) throw new Error('Start your local directory first.');
    const requestedScope = scope;
    const result = await localRequest<T>(token, route, body, directory.url);
    if (activeScope.current !== requestedScope || authPrincipal.epoch() !== principal.epoch)
      throw new Error('The active directory or account changed.');
    return result;
  };
  // A checkpoint can span many transport events. The activity is the saved
  // state, so the list has one entry and the detail reads its complete parts.
  const activities = useMemo(() => {
    const seen = new Set<string>();
    return events.filter((event) => {
      const key =
        event.kind === 'checkpoint'
          ? `${event.workspaceId}:${event.payload.checkpointId}`
          : event.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [events]);
  const days = groupByDay(
    activities
      .filter((event) => !memberFilter || event.actor.id === memberFilter)
      .map((event) => ({ ...event, ts: event.occurredAt })),
    Date.now(),
  );
  return (
    <div
      className="collo-workspaces flex min-h-0 flex-1 flex-col text-sol-text"
      data-testid="local-workspaces"
      data-pane={pane}
      data-has-detail={!!current}
    >
      <div
        className={`collo-directory-toolbar flex flex-wrap items-center gap-3 border-b border-sol-border px-5 py-3 ${pane === 'activity' ? 'hidden' : ''}`}
      >
        <FolderOpen className="h-4 w-4 text-sol-text-muted" />
        <select
          aria-label="Your local directory"
          disabled={busy}
          className="max-w-64 bg-transparent text-sm"
          value={selected ?? ''}
          onChange={(e) => {
            setSelected(e.target.value);
            setPreview(null);
            setCurrent(null);
          }}
        >
          <option value="">Your local directories</option>
          {directories.map((d) => (
            <option key={d.workspaceId} value={d.workspaceId}>
              {d.label}
            </option>
          ))}
        </select>
        {directory && (
          <span className="text-xs text-sol-text-muted">
            {!directory.running
              ? 'Stopped'
              : !details
                ? 'Connecting…'
                : details.offline
                  ? 'Sharing paused'
                  : details.deliveryState === 'access-denied'
                    ? 'Access denied'
                    : details.deliveryState === 'reauth-required'
                      ? 'Reconnect required'
                      : details.pending
                        ? `${details.pending} waiting to send`
                        : details.error
                          ? 'Capture needs attention'
                          : 'Connected'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {directory && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await localRequest(
                    token,
                    directory.running ? '/api/connectors/stop' : '/api/connectors/start',
                    { workspaceId: directory.workspaceId },
                  );
                  await refresh();
                })
              }
            >
              {directory.running ? <Pause /> : <Play />}
              {directory.running ? 'Stop' : 'Start'}
            </Button>
          )}
        </div>
      </div>
      {!isPaired() && pane === 'history' && (
        <p className="border-b border-sol-border px-5 py-3 text-sm text-sol-text-muted">
          Open this page from the local launcher to connect a directory. Shared activity remains
          available here.
        </p>
      )}
      {error && (
        <div role="alert" className="border-b border-sol-border px-5 py-3 text-sm text-red-400">
          {error}
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              run(async () => {
                await refresh();
                await inspect();
              })
            }
          >
            Retry connection
          </Button>
        </div>
      )}
      <div
        className={`collo-workspace-tabs flex items-center gap-3 border-b border-sol-border/40 px-5 py-2 ${current ? 'hidden' : ''}`}
      >
        <SegmentedToggle
          value={pane}
          onChange={setPane}
          items={[
            { key: 'activity', label: 'Team activity', icon: MessageSquare },
            { key: 'history', label: 'Local history', icon: History },
          ]}
        />
        {pane === 'activity' && (
          <select
            className="collo-member-filter"
            aria-label="Filter activity by member"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
          >
            <option value="">All members</option>
            {[...new Map(activities.map((e) => [e.actor.id, e.actor.name])).entries()].map(
              ([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ),
            )}
          </select>
        )}
        <span className="ml-auto text-xs text-sol-text-dim">
          {workspaces.length} shared {workspaces.length === 1 ? 'workspace' : 'workspaces'}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !isPaired()}
          onClick={() => setConnectOpen(true)}
        >
          <Plus />
          Connect directory
        </Button>
      </div>
      {collaboration.error && (
        <div
          role="alert"
          className="border-b border-sol-border/40 px-5 py-3 text-xs text-sol-text-muted"
        >
          {collaboration.error.message}
          <Button variant="ghost" size="xs" onClick={collaboration.retry}>
            Retry activity
          </Button>
        </div>
      )}
      {directory && pane === 'history' && (
        <details className="border-b border-sol-border/40 px-5 py-2 text-xs">
          <summary className="cursor-pointer text-sol-text-dim">
            This directory · {directory.label}
          </summary>
          <p className="my-3 break-all text-sol-text-muted">{directory.root}</p>
          <div className="flex flex-wrap gap-2 pb-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!directory.running}
              onClick={() => setStorageOpen(true)}
            >
              Storage &amp; backups
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !directory.running}
              onClick={() =>
                run(async () => {
                  await local('/api/offline', { offline: !details?.offline });
                  await inspect();
                })
              }
            >
              {details?.offline ? <Play /> : <Pause />}
              {details?.offline ? 'Resume sharing' : 'Pause sharing'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !directory.running}
              onClick={() => {
                setAgentOpen(true);
                setAgentPreview(null);
                setHistory(false);
              }}
            >
              <Plug />
              Connect Codex log
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await refresh();
                  await inspect();
                })
              }
            >
              <RefreshCw />
              Refresh
            </Button>
          </div>
          {(details?.error || details?.deliveryError || details?.agent.error) && (
            <p role="alert" className="pb-2 text-sol-text-muted">
              {details.error || details.deliveryError || details.agent.error}
            </p>
          )}
          <p className="pb-2 text-sol-text-dim">
            {details?.pending ?? 0} waiting to share · recoverable files are stored on this device
          </p>
        </details>
      )}
      <div className="min-h-0 flex-1">
        <DetailSplitLayout
          closeHref={closeHref}
          accessValid={collaboration.accessValid}
          list={
            <div className="collo-activity-list" data-testid="collaboration-list">
              <div className="collo-activity-inner">
                {pane === 'activity' ? (
                  <>
                    {activities.length === 0 && (
                      <div className="py-12 text-center text-sm text-sol-text-muted">
                        <History className="mx-auto mb-3 h-5 w-5 text-sol-text-dim" />
                        <p>
                          {collaboration.loading ? 'Loading activity…' : 'No captured changes yet.'}
                        </p>
                        {!collaboration.loading && (
                          <p className="mt-2 text-xs">
                            Connect your project directory, then save a file to share its changes.
                          </p>
                        )}
                      </div>
                    )}
                    {days.map((day) => (
                      <RailDay key={day.label} label={day.label}>
                        {day.events.map((event) => (
                          <RailRow
                            key={event.id}
                            icon={event.kind === 'checkpoint' ? History : MessageSquare}
                            color={
                              event.kind === 'checkpoint' ? 'text-sol-blue' : 'text-sol-violet'
                            }
                            ts={event.occurredAt}
                            clock
                          >
                            <button
                              onClick={() => setCurrent(event.id)}
                              data-event-id={event.id}
                              className="collo-activity-event min-w-0 flex-1 text-left hover:bg-sol-bg-alt focus-visible:outline focus-visible:outline-sol-cyan"
                            >
                              <div className="collo-event-identity">
                                <MemberFace id={event.actor.id} name={event.actor.name} size={30} />
                                <div className="collo-event-copy">
                                  <strong
                                    title={
                                      event.kind === 'checkpoint'
                                        ? event.payload.label
                                        : event.payload.text
                                    }
                                  >
                                    {event.kind === 'checkpoint'
                                      ? event.payload.label
                                      : event.payload.text.slice(0, 180)}
                                  </strong>
                                  <div className="collo-event-context">
                                    <span className="collo-event-member" title={event.actor.name}>
                                      {event.actor.name}
                                    </span>
                                    <span>·</span>
                                    {event.kind === 'checkpoint' ? (
                                      <span>
                                        {event.payload.totalFiles}{' '}
                                        {event.payload.totalFiles === 1 ? 'file' : 'files'}
                                      </span>
                                    ) : (
                                      <AgentBadge agent={event.payload.adapter} />
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="collo-event-directory">
                                {workspaces.find((w) => w.workspaceId === event.workspaceId)
                                  ?.label ?? 'Workspace'}
                              </div>
                            </button>
                          </RailRow>
                        ))}
                      </RailDay>
                    ))}
                    {collaboration.hasMore && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={collaboration.loadingMore}
                        onClick={collaboration.loadMore}
                      >
                        {collaboration.loadingMore
                          ? 'Loading earlier activity…'
                          : 'Earlier activity'}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <p className="text-xs text-sol-text-muted">
                        Checkpoints saved on this device
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || !directory?.running}
                        onClick={() =>
                          run(async () => {
                            await local('/api/capture', {});
                            await inspect();
                          })
                        }
                      >
                        <Plus />
                        Save checkpoint
                      </Button>
                    </div>
                    {!directory ? (
                      <p className="py-8 text-sm text-sol-text-muted">
                        Choose your connected directory to see its recoverable history.
                      </p>
                    ) : !directory.running ? (
                      <p className="py-8 text-sm text-sol-text-muted">
                        Start this directory to read its local checkpoints.
                      </p>
                    ) : checkpoints.length === 0 ? (
                      <p className="py-8 text-sm text-sol-text-muted">
                        No local checkpoints available yet.
                      </p>
                    ) : (
                      checkpoints.map((cp) => (
                        <button
                          key={cp.id}
                          disabled={busy || cp.integrity === 'invalid'}
                          className="flex w-full items-start gap-3 border-b border-sol-border/30 px-2 py-3 text-left hover:bg-sol-bg-alt disabled:opacity-50"
                          onClick={() =>
                            run(async () =>
                              setPreview(
                                await local<RestorePreview>('/api/restore/preview', {
                                  checkpointId: cp.id,
                                }),
                              ),
                            )
                          }
                        >
                          <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sol-text-dim" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm">{cp.label}</div>
                            <div className="mt-1 text-xs text-sol-text-dim">
                              {new Date(cp.createdAt).toLocaleString()} · {cp.fileCount} files
                            </div>
                          </div>
                          <span className="text-xs text-sol-text-muted">
                            {cp.integrity === 'invalid'
                              ? 'Checkpoint unavailable'
                              : 'Preview restore'}
                          </span>
                        </button>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          }
        >
          {current ? (
            <div key={current} className="collo-review" data-testid="collaboration-detail">
              <div className="collo-review-content">
                <Button variant="ghost" size="sm" onClick={() => setCurrent(null)}>
                  <ArrowLeft />
                  Back to activity
                </Button>
                {selectedEvent ? (
                  <>
                    <div className="collo-review-heading">
                      <div>
                        <h3 className="text-base font-medium">
                          {selectedEvent.kind === 'checkpoint'
                            ? selectedEvent.payload.label
                            : `${formatAgentType(selectedEvent.payload.adapter)} message`}
                        </h3>
                        <p className="mt-2 text-xs text-sol-text-muted">
                          {selectedEvent.actor.name} ·{' '}
                          {workspaces.find((w) => w.workspaceId === selectedEvent.workspaceId)
                            ?.label ?? 'Workspace'}{' '}
                          · {new Date(selectedEvent.occurredAt).toLocaleString()}
                        </p>
                      </div>
                      {selectedEvent.kind === 'checkpoint' &&
                        directory?.running &&
                        selectedEvent.workspaceId === directory.workspaceId && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              run(async () =>
                                setPreview(
                                  await local<RestorePreview>('/api/restore/preview', {
                                    checkpointId: selectedEvent.payload.checkpointId,
                                  }),
                                ),
                              )
                            }
                          >
                            Preview restore
                          </Button>
                        )}
                    </div>
                    {selectedEvent.kind === 'checkpoint' ? (
                      <>
                        <details className="collo-review-provenance">
                          <summary data-testid="checkpoint-completeness">
                            {checkpoint.files.length} of {selectedEvent.payload.totalFiles} file
                            changes
                            {checkpoint.complete
                              ? ' · Complete checkpoint'
                              : checkpoint.integrity === 'invalid'
                                ? ' · Inconsistent checkpoint'
                                : checkpoint.loading
                                  ? ' · Loading checkpoint…'
                                  : checkpoint.integrity === 'legacy-unverified'
                                    ? ' · Earlier checkpoint, server integrity not verified'
                                    : ' · Checkpoint incomplete'}
                            <span>Source &amp; recovery details</span>
                          </summary>
                          <p>
                            Full files stay on the source device. Restore is available while that
                            checkpoint is retained; shared differences are not a file backup.
                          </p>
                        </details>
                        <CheckpointSource
                          projectId={projectId}
                          compact
                          source={{
                            workspaceId: selectedEvent.workspaceId,
                            checkpointId: selectedEvent.payload.checkpointId,
                          }}
                          compose
                        />
                        {checkpoint.error && (
                          <div role="alert" className="mb-4 text-xs text-sol-text-muted">
                            {checkpoint.error.message}
                            <Button variant="ghost" size="xs" onClick={checkpoint.retry}>
                              Retry checkpoint
                            </Button>
                          </div>
                        )}
                        <Files
                          key={current}
                          files={checkpoint.files}
                          scope={viewKey(projectId, `checkpoint:${current}`)}
                        />
                        {checkpoint.hasMore && (
                          <Button
                            className="mt-4"
                            variant="outline"
                            size="sm"
                            disabled={checkpoint.loading}
                            onClick={checkpoint.loadMore}
                          >
                            Load remaining files
                          </Button>
                        )}
                        {!checkpoint.hasMore &&
                          !checkpoint.complete &&
                          !checkpoint.loading &&
                          !checkpoint.error && (
                            <p className="mt-4 text-xs text-sol-text-muted">
                              Some checkpoint parts have not arrived. The view will update when the
                              source device finishes sharing.
                            </p>
                          )}
                      </>
                    ) : (
                      <>
                        <div className="collo-captured-action">
                          <AgentBadge agent={selectedEvent.payload.adapter} />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              router.push(
                                capturedHref(
                                  projectId,
                                  selectedEvent.workspaceId,
                                  selectedEvent.payload.sessionId,
                                ),
                              )
                            }
                          >
                            Open conversation
                          </Button>
                        </div>
                        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {selectedEvent.payload.text}
                        </div>
                        <p className="mt-5 text-xs text-sol-text-dim">
                          Captured from an authorized log. File authorship is recorded separately.
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <p className="py-12 text-sm text-sol-text-muted">
                    {collaboration.selectedLoading
                      ? 'Loading this activity…'
                      : collaboration.selectedMissing
                        ? 'This activity is unavailable or you no longer have access.'
                        : 'Could not load this activity. Retry the activity connection above.'}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </DetailSplitLayout>
      </div>
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect your directory</DialogTitle>
            <DialogDescription>
              Share captured file differences with this project's members. Files stay on your
              computer.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm">
            Directory
            <div className="flex gap-2">
              <input
                aria-label="Directory path"
                className={field}
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="D:\\Projects\\my-project"
              />
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await chooseDirectory(token);
                    if (
                      result.path &&
                      activeIdentity.current === identity &&
                      authPrincipal.epoch() === principal.epoch
                    )
                      setRoot(result.path);
                  })
                }
              >
                Browse
              </Button>
            </div>
          </label>
          <label className="space-y-2 text-sm">
            Name
            <input
              aria-label="Directory name"
              className={field}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My workstation"
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Share saved-file changes from this directory. Credentials and generated files are
            excluded.
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              disabled={busy || !consent || !root.trim() || !label.trim()}
              onClick={() =>
                run(async () => {
                  const created = await localRequest<{ workspaceId: string }>(
                    token,
                    '/api/connectors/create',
                    {
                      root,
                      label,
                      projectId,
                      confirmed: true,
                    },
                  );
                  if (
                    activeIdentity.current !== identity ||
                    authPrincipal.epoch() !== principal.epoch
                  )
                    return;
                  setSelected(created.workspaceId);
                  await refresh();
                  setConnectOpen(false);
                  setConsent(false);
                })
              }
            >
              {busy ? 'Connecting…' : 'Connect and share'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview restore</DialogTitle>
            <DialogDescription>
              Only {directory?.label} will change. Your current state will be backed up first.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <>
              <p className="text-xs text-sol-text-muted">
                {preview.files.length} files · preview expires{' '}
                {new Date(preview.expiresAt).toLocaleTimeString()}
              </p>
              <Files
                files={preview.files}
                scope={viewKey(projectId, `restore-preview:${preview.id}`)}
              />
              {error && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreview(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy || !preview.files.length}
                  onClick={() =>
                    run(async () => {
                      await local('/api/restore/confirm', {
                        previewId: preview.id,
                        confirmed: true,
                      });
                      setPreview(null);
                      await inspect();
                    })
                  }
                >
                  Back up current state and restore
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={agentOpen} onOpenChange={setAgentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect a Codex log</DialogTitle>
            <DialogDescription>
              Choose one session log for this directory. Messages are read only; no Agent is
              started.
            </DialogDescription>
          </DialogHeader>
          <input
            className={field}
            aria-label="Codex log path"
            disabled={busy}
            value={log}
            onChange={(e) => {
              setLog(e.target.value);
              setAgentPreview(null);
            }}
            placeholder="Absolute path to a Codex session .jsonl"
          />
          {agentPreview?.path === log && (
            <>
              <p className="text-sm">
                {agentPreview.userMessages + agentPreview.assistantMessages} messages available
              </p>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={history}
                  onChange={(e) => setHistory(e.target.checked)}
                />
                Also share existing messages
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              disabled={busy || !log}
              onClick={() =>
                run(async () => {
                  if (!agentPreview || agentPreview.path !== log)
                    setAgentPreview({
                      ...(await local<AgentPreview>('/api/agent/preview', { path: log })),
                      path: log,
                    });
                  else {
                    await local('/api/agent/connect', {
                      path: agentPreview.path,
                      importHistory: history,
                      confirmed: true,
                    });
                    setAgentOpen(false);
                    await inspect();
                  }
                })
              }
            >
              {agentPreview?.path === log ? 'Connect and share messages' : 'Preview log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={storageOpen && collaboration.accessValid} onOpenChange={setStorageOpen}>
        <DialogContent className="collo-storage-dialog">
          <DialogHeader>
            <DialogTitle>Storage &amp; backups</DialogTitle>
            <DialogDescription>
              {directory?.label} · this directory on this device
            </DialogDescription>
          </DialogHeader>
          {storageOpen && directory?.running && collaboration.accessValid && (
            <DirectoryStorage
              key={`${scope}:${directory.url}`}
              token={token}
              directory={directory}
              checkpoints={checkpoints}
              onChanged={inspect}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
