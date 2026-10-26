/** UI projections retain the versioned connector protocol as their source. */
import type { FileChange, StoredEvent } from './protocol';
export type { FileChange, StoredEvent } from './protocol';
export type CachedEvent = StoredEvent & { _id: string; projectId: string; workspace: string };
export type WorkspaceRow = {
  workspaceId: string;
  projectId: string;
  userId: string;
  label: string;
  own: boolean;
  _id: string;
  workspace: string;
};
export type FeedPage = { page: StoredEvent[]; continueCursor: string; isDone: boolean };
export type FeedRange = {
  head: number;
  oldest: number;
  cursor: string | null;
  done: boolean;
};
export type PartsPage = {
  events: StoredEvent[];
  cursor: number;
  hasMore: boolean;
  totalParts: number | null;
  receivedParts: number | null;
  complete: boolean | null;
  integrity: 'verified' | 'legacy-unverified' | 'missing';
};

export const cacheId = (projectId: string, id: string) => `collo:${projectId}:${id}`;
export const feedKey = (projectId: string) => `collo:feed:${projectId}`;
export function cacheEvents(
  projectId: string,
  workspace: string,
  events: StoredEvent[],
): CachedEvent[] {
  return events.map((event) => ({
    ...event,
    _id: cacheId(projectId, event.id),
    projectId,
    workspace,
  }));
}
export function readRange(value: string | null | undefined): FeedRange | null {
  try {
    const range = JSON.parse(value ?? 'null') as FeedRange | null;
    return range &&
      Number.isSafeInteger(range.head) &&
      Number.isSafeInteger(range.oldest) &&
      range.head >= range.oldest &&
      range.oldest >= 0 &&
      typeof range.done === 'boolean' &&
      (range.cursor === null || typeof range.cursor === 'string')
      ? range
      : null;
  } catch {
    return null;
  }
}
export function pageRange(page: FeedPage): FeedRange {
  return {
    head: page.page[0]?.seq ?? 0,
    oldest: page.page.at(-1)?.seq ?? 0,
    cursor: page.isDone ? null : page.continueCursor,
    done: page.isDone,
  };
}

/** Bridge the live head to the previous confirmed head, never the next cached cursor.
 * That cursor points behind the OLD tail and would skip a burst of new events. */
export async function bridgeHead(
  first: FeedPage,
  previousHead: number,
  fetchPage: (cursor: string) => Promise<FeedPage>,
  alive: () => boolean,
): Promise<StoredEvent[] | null> {
  const events = [...first.page];
  let page = first;
  const cursors = new Set<string>();
  while (
    previousHead > 0 &&
    !page.isDone &&
    (!page.page.length || page.page.at(-1)!.seq > previousHead)
  ) {
    if (!alive()) return null;
    if (cursors.has(page.continueCursor))
      throw new Error('Activity cursor did not advance. Retry.');
    cursors.add(page.continueCursor);
    page = await fetchPage(page.continueCursor);
    events.push(...page.page);
  }
  return alive() ? events : null;
}

export function permissionFailure(error: unknown): boolean {
  const value = error as { data?: unknown; message?: string } | null;
  let data = value?.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      /* ordinary network error */
    }
  }
  const status = (data as { status?: number } | null)?.status;
  return (
    status === 401 ||
    status === 403 ||
    /\b(?:UNAUTHENTICATED|UNAUTHORIZED|FORBIDDEN)\b|Project access denied|Session expired|Sign in required/.test(
      value?.message ?? '',
    )
  );
}

export function samePrincipal(
  captured: { principalId: string | null; epoch: number },
  current: { principalId: string | null; epoch: number },
): boolean {
  return (
    captured.principalId !== null &&
    captured.principalId === current.principalId &&
    captured.epoch === current.epoch
  );
}

/** A partial/local cache is never proof that a checkpoint was completely uploaded. */
export function assembleCheckpoint(
  events: StoredEvent[],
  selected: StoredEvent | null,
  summary?: PartsPage,
) {
  const files: FileChange[] = [];
  if (!selected || selected.kind !== 'checkpoint')
    return {
      files,
      receivedParts: 0,
      totalParts: 0,
      complete: false,
      integrity: 'missing' as const,
    };
  const expected = selected.payload;
  const parts = new Map<number, StoredEvent & { kind: 'checkpoint' }>();
  let invalid = !Number.isSafeInteger(expected.parts) || expected.parts < 1;
  for (const event of events) {
    if (
      event.kind !== 'checkpoint' ||
      event.workspaceId !== selected.workspaceId ||
      event.payload.checkpointId !== expected.checkpointId
    )
      continue;
    const p = event.payload;
    if (
      !Number.isSafeInteger(p.part) ||
      p.part < 1 ||
      p.part > expected.parts ||
      p.parts !== expected.parts ||
      p.totalFiles !== expected.totalFiles ||
      p.parentId !== expected.parentId ||
      p.label !== expected.label
    ) {
      invalid = true;
      continue;
    }
    const previous = parts.get(p.part);
    if (previous && JSON.stringify(previous.payload) !== JSON.stringify(p)) invalid = true;
    else parts.set(p.part, event);
  }
  const paths = new Set<string>();
  for (const [, event] of [...parts].sort(([a], [b]) => a - b)) {
    for (const file of event.payload.files) {
      if (paths.has(file.path)) invalid = true;
      else {
        paths.add(file.path);
        files.push(file);
      }
    }
  }
  if (summary?.totalParts != null && summary.totalParts !== expected.parts) invalid = true;
  if (
    summary?.receivedParts != null &&
    (!Number.isSafeInteger(summary.receivedParts) ||
      summary.receivedParts < 0 ||
      summary.receivedParts > expected.parts ||
      (summary.complete === true && summary.receivedParts !== expected.parts))
  )
    invalid = true;
  if (files.length > expected.totalFiles) invalid = true;
  const allParts = parts.size === expected.parts;
  if (allParts && files.length !== expected.totalFiles) invalid = true;
  const integrity = invalid ? 'invalid' : (summary?.integrity ?? 'legacy-unverified');
  return {
    files,
    receivedParts: summary?.receivedParts ?? parts.size,
    totalParts: summary?.totalParts ?? expected.parts,
    complete:
      !invalid &&
      allParts &&
      files.length === expected.totalFiles &&
      summary?.integrity === 'verified' &&
      summary.complete === true,
    integrity,
  };
}
