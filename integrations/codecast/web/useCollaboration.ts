import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { api } from '@codecast/convex/convex/_generated/api';
import { useInboxStore } from '../store/inboxStore';
import { useCollectionRows } from '../hooks/useCollectionRows';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { useServerAuthState } from '../hooks/useServerAuthSettled';
import { authPrincipal, useAuthPrincipal } from '../lib/authPrincipal';
import { clearProjectViews } from './productViewState';
import {
  assembleCheckpoint,
  bridgeHead,
  cacheEvents,
  cacheId,
  feedKey,
  pageRange,
  permissionFailure,
  readRange,
  samePrincipal,
  type CachedEvent,
  type FeedPage,
  type PartsPage,
  type StoredEvent,
  type WorkspaceRow,
} from './collaborationModel';

const newestFirst = (a: CachedEvent, b: CachedEvent) => b.seq - a.seq;
const eventSignature = (event: CachedEvent) => `${event.seq}:${event.actor.id}:${event.actor.name}`;
const workspaceSignature = (row: WorkspaceRow) => JSON.stringify(row);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// IDs are explicitly client keys, so the original durable-delete policy removes
// these rows from IDB as well as memory. A paginated omission never calls this.
function purgeProject(projectId: string) {
  clearProjectViews(projectId);
  const store = useInboxStore.getState();
  for (const key of ['colloEvents', 'colloWorkspaces'] as const) {
    const rows = store[key] as Record<string, { projectId: string }>;
    store.dropRows(
      key,
      Object.keys(rows).filter((id) => rows[id].projectId === projectId),
    );
  }
  store.setFeedCursor(feedKey(projectId), null);
  store.setFeedHasMore(feedKey(projectId), false);
}

/** Feeders write original Codecast collections; all surfaces read the store.
 * This is deliberately NOT a sync-log bootstrap: connector writes have a
 * separate append/ACK protocol and do not publish the original sync log. */
export function useCollaboration(projectId: string, currentEventId: string | null) {
  const convex = useConvex();
  const principal = useAuthPrincipal();
  const auth = useServerAuthState();
  const scope = `${principal.epoch}:${principal.principalId}:${projectId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const allowed = !!principal.principalId && auth.settled && !auth.identityLost;
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const [deniedScope, setDeniedScope] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activityState, setActivityState] = useState({
    scope: '',
    error: '',
    loading: false,
    more: false,
  });
  const inFlightMore = useRef<string | null>(null);
  const failedMore = useRef(false);
  const isLive = useCallback(
    () =>
      allowedRef.current &&
      currentScope.current === scope &&
      samePrincipal(principal, {
        principalId: authPrincipal.current(),
        epoch: authPrincipal.epoch(),
      }),
    [scope, principal.principalId, principal.epoch],
  );
  const project = useQueryNoThrow(
    (api as any).collo.projectByRef,
    allowed ? { reference: projectId } : 'skip',
  );
  const head = useQueryNoThrow(
    (api as any).collo.feed,
    allowed
      ? {
          projectId,
          paginationOpts: { cursor: null, numItems: 20 },
        }
      : 'skip',
  );
  const roster = useQueryNoThrow((api as any).collo.workspaces, allowed ? { projectId } : 'skip');
  const detail = useQueryNoThrow(
    (api as any).collo.eventById,
    allowed && currentEventId ? { projectId, eventId: currentEventId } : 'skip',
  );
  const cachedProject = useInboxStore((s) => s.projects[projectId]);
  const workspace = project.data?.workspace ?? cachedProject?.workspace;
  const whereProject = useCallback(
    (row: { projectId: string }) => row.projectId === projectId,
    [projectId],
  );
  const cachedEvents = useCollectionRows<CachedEvent>('colloEvents', {
    where: whereProject,
    sig: eventSignature,
    sort: newestFirst,
  });
  const cachedWorkspaces = useCollectionRows<WorkspaceRow>('colloWorkspaces', {
    where: whereProject,
    sig: workspaceSignature,
  });
  const serializedRange = useInboxStore((s) => s.feedCursors[feedKey(projectId)]);
  const range = readRange(serializedRange);
  const cachedSelection = useInboxStore((s) =>
    currentEventId
      ? (s.colloEvents[cacheId(projectId, currentEventId)] as CachedEvent | undefined)
      : undefined,
  );
  const selectedEvent = detail.data === null ? null : (cachedSelection ?? null);
  const checkpointId =
    selectedEvent?.kind === 'checkpoint' ? selectedEvent.payload.checkpointId : null;
  const checkpointWorkspace = selectedEvent?.workspaceId;
  const partsKey = `${scope}:${checkpointWorkspace}:${checkpointId}`;
  const partsHead = useQueryNoThrow(
    (api as any).collo.checkpointParts,
    allowed && checkpointId
      ? { projectId, workspaceId: checkpointWorkspace, checkpointId }
      : 'skip',
  );
  const [partsState, setPartsState] = useState<{
    key: string;
    cursor: number;
    hasMore: boolean;
    loading: boolean;
    error: string;
  }>({ key: '', cursor: 0, hasMore: false, loading: false, error: '' });
  const partsStateRef = useRef(partsState);
  partsStateRef.current = partsState;
  const partsGeneration = useRef(0);
  const currentPartsKey = useRef(partsKey);
  currentPartsKey.current = partsKey;
  const [partsAttempt, setPartsAttempt] = useState(0);
  const failedPartsMore = useRef<string | null>(null);
  const errors = [project.error, head.error, roster.error, detail.error, partsHead.error];
  const refused = deniedScope === scope || project.data === null || errors.some(permissionFailure);
  const refusedRef = useRef(refused);
  refusedRef.current = refused;
  const fail = useCallback(
    (error: unknown) => {
      if (!isLive()) return;
      if (permissionFailure(error)) {
        refusedRef.current = true;
        purgeProject(projectId);
        setDeniedScope(scope);
      }
      setActivityState((old) => ({
        ...old,
        scope,
        error: message(error),
        loading: false,
        more: false,
      }));
    },
    [isLive, projectId, scope],
  );
  const writeEvents = useCallback(
    (events: StoredEvent[]) => {
      if (!isLive() || refusedRef.current || !workspace) return;
      useInboxStore
        .getState()
        .syncTable('colloEvents', cacheEvents(projectId, workspace, events), { isDelta: true });
    },
    [isLive, projectId, workspace],
  );

  useEffect(() => {
    if (refused && isLive()) purgeProject(projectId);
  }, [refused, isLive, projectId]);

  useEffect(() => {
    if (!roster.data || !workspace || !isLive() || refused) return;
    const store = useInboxStore.getState();
    const rows: WorkspaceRow[] = roster.data.map((row: WorkspaceRow) => ({
      ...row,
      _id: cacheId(projectId, row.workspaceId),
      projectId,
      workspace,
    }));
    const sent = new Set(rows.map((row) => row._id));
    const gone = Object.entries(store.colloWorkspaces).filter(
      ([id, row]) => row.projectId === projectId && !sent.has(id),
    );
    store.dropRows(
      'colloWorkspaces',
      gone.map(([id]) => id),
    );
    store.syncTable('colloWorkspaces', rows, { isDelta: true });
  }, [roster.data, workspace, projectId, isLive, refused]);

  useEffect(() => {
    if (!currentEventId || !isLive() || refused) return;
    if (detail.data) writeEvents([detail.data]);
    else if (detail.data === null)
      useInboxStore.getState().dropRows('colloEvents', [cacheId(projectId, currentEventId)]);
  }, [detail.data, currentEventId, projectId, isLive, refused, writeEvents]);

  useEffect(() => {
    if (!head.data || !workspace || !allowed || refused) return;
    let cancelled = false;
    const alive = () => !cancelled && isLive() && !refusedRef.current;
    const first = head.data as FeedPage;
    const store = useInboxStore.getState();
    const previous = readRange(store.feedCursors[feedKey(projectId)]);
    // A revoked team may have purged the rows while its per-view cursor stayed.
    // Such a cursor is not a cached floor: restart from the head.
    const hasFloor =
      previous &&
      Object.values(store.colloEvents).some(
        (row) => row.projectId === projectId && row.seq === previous.head,
      );
    setActivityState((old) => ({
      ...old,
      scope,
      error: '',
      loading: true,
      more: inFlightMore.current === scope,
    }));
    void bridgeHead(
      first,
      hasFloor ? previous.head : 0,
      (cursor) =>
        convex.query((api as any).collo.feed, {
          projectId,
          paginationOpts: { cursor, numItems: 20 },
        }),
      alive,
    )
      .then((events) => {
        if (!events || !alive()) return;
        writeEvents(events);
        const now = useInboxStore.getState();
        const existing = readRange(now.feedCursors[feedKey(projectId)]);
        const fresh = pageRange(first);
        // A concurrent earlier-page fetch may have extended the tail meanwhile.
        const next =
          hasFloor && existing ? { ...existing, head: Math.max(existing.head, fresh.head) } : fresh;
        now.setFeedCursor(feedKey(projectId), JSON.stringify(next));
        now.setFeedHasMore(feedKey(projectId), !next.done);
        setActivityState((old) => ({ ...old, scope, loading: false, error: '' }));
      })
      .catch((error) => {
        if (alive()) fail(error);
      });
    return () => {
      cancelled = true;
    };
  }, [
    head.data,
    workspace,
    allowed,
    refused,
    projectId,
    scope,
    attempt,
    convex,
    isLive,
    writeEvents,
    fail,
  ]);

  const loadMore = useCallback(async () => {
    if (!allowed || refusedRef.current || !isLive() || inFlightMore.current === scope) return;
    const old = readRange(useInboxStore.getState().feedCursors[feedKey(projectId)]);
    if (!old || old.done || !old.cursor) return;
    inFlightMore.current = scope;
    failedMore.current = false;
    setActivityState((state) => ({ ...state, scope, error: '', more: true }));
    try {
      const page = (await convex.query((api as any).collo.feed, {
        projectId,
        paginationOpts: { cursor: old.cursor, numItems: 20 },
      })) as FeedPage;
      if (!isLive() || refusedRef.current) return;
      if (!page.isDone && page.continueCursor === old.cursor)
        throw new Error('Activity cursor did not advance. Retry.');
      writeEvents(page.page);
      const store = useInboxStore.getState();
      const now = readRange(store.feedCursors[feedKey(projectId)]);
      if (now?.cursor === old.cursor) {
        const tail = pageRange(page);
        const next = {
          ...tail,
          head: Math.max(now.head, tail.head),
          oldest: tail.oldest || now.oldest,
        };
        store.setFeedCursor(feedKey(projectId), JSON.stringify(next));
        store.setFeedHasMore(feedKey(projectId), !next.done);
      }
      setActivityState((state) => ({ ...state, scope, more: false }));
    } catch (error) {
      if (isLive()) failedMore.current = !permissionFailure(error);
      fail(error);
    } finally {
      if (inFlightMore.current === scope) inFlightMore.current = null;
    }
  }, [allowed, isLive, scope, convex, projectId, writeEvents, fail]);

  useEffect(() => {
    const generation = ++partsGeneration.current;
    if (!partsHead.data || !checkpointId || !workspace || !allowed || refused) return;
    failedPartsMore.current = null;
    let cancelled = false;
    const alive = () =>
      !cancelled &&
      generation === partsGeneration.current &&
      currentPartsKey.current === partsKey &&
      isLive() &&
      !refusedRef.current;
    const first = partsHead.data as PartsPage;
    const prior = partsStateRef.current;
    const through = prior.key === partsKey ? prior.cursor : 0;
    setPartsState({
      key: partsKey,
      cursor: through,
      hasMore: first.hasMore,
      loading: true,
      error: '',
    });
    void (async () => {
      let page = first;
      const events = [...page.events];
      // Re-read loaded pages when new parts arrive. A late part below the tail
      // must not be skipped by blindly continuing from the saved afterPart.
      while (page.hasMore && page.cursor < through) {
        if (!alive()) return;
        const next = (await convex.query((api as any).collo.checkpointParts, {
          projectId,
          workspaceId: checkpointWorkspace,
          checkpointId,
          afterPart: page.cursor,
        })) as PartsPage;
        if (next.hasMore && next.cursor <= page.cursor)
          throw new Error('Checkpoint cursor did not advance. Retry.');
        page = next;
        events.push(...page.events);
      }
      if (!alive()) return;
      writeEvents(events);
      setPartsState({
        key: partsKey,
        cursor: page.cursor,
        hasMore: page.hasMore,
        loading: false,
        error: '',
      });
    })().catch((error) => {
      if (!alive()) return;
      if (permissionFailure(error)) fail(error);
      setPartsState((old) => ({ ...old, key: partsKey, loading: false, error: message(error) }));
    });
    return () => {
      cancelled = true;
    };
  }, [
    partsHead.data,
    checkpointId,
    checkpointWorkspace,
    workspace,
    allowed,
    refused,
    projectId,
    partsKey,
    partsAttempt,
    convex,
    isLive,
    writeEvents,
    fail,
  ]);

  const loadMoreParts = useCallback(async () => {
    const state = partsStateRef.current;
    if (
      !allowed ||
      refusedRef.current ||
      !isLive() ||
      state.key !== partsKey ||
      state.loading ||
      !state.hasMore ||
      !checkpointId
    )
      return;
    const generation = partsGeneration.current;
    // Set the ref before awaiting so two clicks cannot send the same cursor.
    partsStateRef.current = { ...state, loading: true, error: '' };
    failedPartsMore.current = null;
    setPartsState(partsStateRef.current);
    const alive = () =>
      isLive() &&
      !refusedRef.current &&
      currentPartsKey.current === partsKey &&
      generation === partsGeneration.current;
    try {
      const page = (await convex.query((api as any).collo.checkpointParts, {
        projectId,
        workspaceId: checkpointWorkspace,
        checkpointId,
        afterPart: state.cursor,
      })) as PartsPage;
      if (!alive()) return;
      if (page.hasMore && page.cursor <= state.cursor)
        throw new Error('Checkpoint cursor did not advance. Retry.');
      writeEvents(page.events);
      setPartsState({
        key: partsKey,
        cursor: page.cursor,
        hasMore: page.hasMore,
        loading: false,
        error: '',
      });
    } catch (error) {
      if (!alive()) return;
      if (permissionFailure(error)) fail(error);
      else failedPartsMore.current = partsKey;
      setPartsState({ ...state, loading: false, error: message(error) });
    }
  }, [
    allowed,
    isLive,
    partsKey,
    checkpointId,
    checkpointWorkspace,
    projectId,
    convex,
    writeEvents,
    fail,
  ]);

  const retry = useCallback(() => {
    if (failedMore.current && deniedScope !== scope) {
      void loadMore();
      return;
    }
    setDeniedScope(null);
    setAttempt((value) => value + 1);
    project.retry();
    head.retry();
    roster.retry();
    detail.retry();
  }, [project.retry, head.retry, roster.retry, detail.retry, deniedScope, scope, loadMore]);
  const retryParts = useCallback(() => {
    const state = partsStateRef.current;
    if (
      failedPartsMore.current === partsKey &&
      state.key === partsKey &&
      state.error &&
      state.hasMore
    ) {
      void loadMoreParts();
      return;
    }
    partsHead.retry();
    setPartsAttempt((value) => value + 1);
  }, [partsHead.retry, partsKey, loadMoreParts]);
  const checkpoint = useMemo(
    () => assembleCheckpoint(cachedEvents, selectedEvent, partsHead.data as PartsPage | undefined),
    [cachedEvents, selectedEvent, partsHead.data],
  );
  const visible = !!principal.principalId && !refused;
  const activityError = errors.find(Boolean);
  return {
    accessValid: visible,
    events: visible ? cachedEvents.filter((event) => range && event.seq >= range.oldest) : [],
    workspaces: visible ? cachedWorkspaces : [],
    loading: !refused && (!head.data || (activityState.scope === scope && activityState.loading)),
    error: refused
      ? new Error('Project access is unavailable. Sign in or request access, then retry.')
      : (activityError ??
        (activityState.scope === scope && activityState.error
          ? new Error(activityState.error)
          : undefined)),
    retry,
    hasMore: visible && !!range && !range.done,
    loadingMore: activityState.scope === scope && activityState.more,
    loadMore,
    selectedEvent: visible ? selectedEvent : null,
    selectedLoading:
      visible && !!currentEventId && detail.data === undefined && !selectedEvent && !detail.error,
    selectedMissing: visible && !!currentEventId && detail.data === null,
    checkpoint: {
      ...checkpoint,
      files: visible ? checkpoint.files : [],
      complete: visible && checkpoint.complete,
      hasMore: visible && partsState.key === partsKey && partsState.hasMore,
      loading:
        visible &&
        !!checkpointId &&
        (partsHead.data === undefined || partsState.key !== partsKey || partsState.loading),
      error:
        partsHead.error ??
        (partsState.key === partsKey && partsState.error ? new Error(partsState.error) : undefined),
      loadMore: loadMoreParts,
      retry: retryParts,
    },
  };
}
