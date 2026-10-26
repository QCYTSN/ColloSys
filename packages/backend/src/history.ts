import { z } from 'zod';
import { idSchema, relativePathSchema, type StoredEvent } from '../../shared/src/protocol';
import type { ActivitySummary } from '../../shared/src/history';
import { HttpError, json } from './http';

// Small SQL interface also used by the real SQLite regression suite.
export type HistorySQL = {
  exec: <T extends Record<string, any>>(sql: string, ...args: any[]) => { toArray(): T[] };
};
const integer = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const MAX = Number.MAX_SAFE_INTEGER;
const field = (name: string) => `json_extract(body,'$.${name}')`;
const workspace = field('workspaceId'),
  kind = field('kind'),
  session = field('payload.sessionId'),
  checkpoint = field('payload.checkpointId');
const summary = `seq,event_id AS id,${workspace} AS workspaceId,${kind} AS kind,${field('occurredAt')} AS occurredAt,
 ${field('actor.id')} AS actorId,${field('actor.name')} AS actorName,
 ${checkpoint} AS checkpointId,${session} AS sessionId,COALESCE(${field('payload.totalFiles')},0) AS fileCount,
 CASE WHEN ${kind}='checkpoint' THEN ${field('payload.label')} ELSE 'Codex 会话' END AS title,
 CASE WHEN ${kind}='checkpoint' THEN COALESCE((SELECT group_concat(json_extract(value,'$.path'), ' · ') FROM json_each(body,'$.payload.files') WHERE CAST(key AS INTEGER)<5),'') ELSE substr(${field('payload.text')},1,500) END AS preview`;
const mapSummary = (row: any): ActivitySummary => {
  const { actorId, actorName, ...rest } = row;
  return { ...rest, actor: { id: actorId, name: actorName } };
};
const mapEvent = (row: { seq: number; body: string }): StoredEvent => ({
  ...JSON.parse(row.body),
  seq: row.seq,
});

export function initializeHistory(sql: HistorySQL) {
  sql.exec(
    `CREATE INDEX IF NOT EXISTS events_sessions ON events (${kind},${workspace},${session},seq)`,
  );
  sql.exec(
    `CREATE INDEX IF NOT EXISTS events_checkpoints ON events (${kind},${workspace},${checkpoint},seq)`,
  );
}

export function queryHistory(sql: HistorySQL, url: URL): Response {
  const p = url.searchParams,
    route = url.pathname;
  const rows = <T extends Record<string, any>>(query: string, ...values: any[]) =>
    sql.exec<T>(query, ...values).toArray();
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .parse(p.get('limit') ?? 30);
  if (route === '/history' || route === '/sessions') {
    const head = integer.parse(
      p.get('head') ??
        rows<{ head: number }>('SELECT COALESCE(MAX(seq),0) head FROM events')[0].head,
    );
    const before = integer.parse(p.get('before') ?? MAX),
      after = integer.parse(p.get('after') ?? 0),
      member = p.get('member') ?? '',
      q = (p.get('q') ?? '').trim();
    z.string().max(200).parse(q);
    if (member) idSchema.parse(member);
    const common = `seq<=? AND (?='' OR ${field('actor.id')}=?)`;
    let result: any[];
    if (route === '/sessions') {
      result = rows(
        `WITH grouped AS (
        SELECT MAX(seq) latest,COUNT(*) messageCount FROM events
        WHERE ${kind}='agent.message' AND ${common} GROUP BY ${workspace},${session}
        HAVING MAX(seq)<? AND MAX(seq)>? AND (?='' OR MAX(instr(lower(${field('payload.text')}),lower(?)))>0)
      ) SELECT ${summary},grouped.messageCount FROM events JOIN grouped ON events.seq=grouped.latest ORDER BY seq DESC LIMIT ?`,
        head,
        member,
        member,
        before,
        after,
        q,
        q,
        limit + 1,
      );
    } else {
      // One row per checkpoint; its file inventory is loaded separately across all parts.
      result = rows(
        `WITH activity AS (
         SELECT event_id,body,CASE WHEN ${kind}='checkpoint' THEN
          (SELECT MAX(related.seq) FROM events related WHERE related.seq<=? AND json_extract(related.body,'$.kind')='checkpoint'
           AND json_extract(related.body,'$.workspaceId')=json_extract(events.body,'$.workspaceId')
           AND json_extract(related.body,'$.payload.checkpointId')=json_extract(events.body,'$.payload.checkpointId')) ELSE seq END seq
         FROM events WHERE ${common} AND (${kind}!='checkpoint' OR json_extract(body,'$.payload.part')=1)
        ) SELECT ${summary} FROM activity events WHERE seq<? AND seq>?
       AND (?='' OR instr(lower(body),lower(?))>0 OR (${kind}='checkpoint' AND EXISTS(
         SELECT 1 FROM events related WHERE json_extract(related.body,'$.workspaceId')=json_extract(events.body,'$.workspaceId')
         AND json_extract(related.body,'$.kind')='checkpoint' AND json_extract(related.body,'$.payload.checkpointId')=json_extract(events.body,'$.payload.checkpointId')
         AND related.seq<=? AND instr(lower(related.body),lower(?))>0))) ORDER BY seq DESC LIMIT ?`,
        head,
        head,
        member,
        member,
        before,
        after,
        q,
        q,
        head,
        q,
        limit + 1,
      );
    }
    const page = result.slice(0, limit);
    return json({
      items: page.map(mapSummary),
      head,
      next: result.length > limit ? page.at(-1)!.seq : null,
    });
  }
  if (route === '/event') {
    const id = idSchema.parse(p.get('id'));
    const row = rows<{ seq: number; body: string }>(
      'SELECT seq,body FROM events WHERE event_id=?',
      id,
    )[0];
    if (!row) throw new HttpError(404, 'Activity not found');
    return json(mapEvent(row));
  }
  const ws = idSchema.parse(p.get('workspace'));
  if (route === '/messages') {
    const sid = z.string().min(1).max(160).parse(p.get('session'));
    const base = `${kind}='agent.message' AND ${workspace}=? AND ${session}=?`;
    let result: { seq: number; body: string }[];
    if (p.has('around')) {
      const anchor = rows<{ seq: number }>(
        `SELECT seq FROM events WHERE ${base} AND event_id=?`,
        ws,
        sid,
        idSchema.parse(p.get('around')),
      )[0];
      if (!anchor) throw new HttpError(404, 'Message not found in this session');
      const half = Math.max(1, Math.floor(limit / 2));
      result = [
        ...rows<{ seq: number; body: string }>(
          `SELECT seq,body FROM events WHERE ${base} AND seq<=? ORDER BY seq DESC LIMIT ?`,
          ws,
          sid,
          anchor.seq,
          half,
        ).reverse(),
        ...rows<{ seq: number; body: string }>(
          `SELECT seq,body FROM events WHERE ${base} AND seq>? ORDER BY seq LIMIT ?`,
          ws,
          sid,
          anchor.seq,
          limit - half,
        ),
      ];
    } else {
      const forward = p.has('after'),
        cursor = integer.parse(p.get(forward ? 'after' : 'before') ?? (forward ? 0 : MAX));
      result = rows(
        `SELECT seq,body FROM events WHERE ${base} AND seq${forward ? '>' : '<'}? ORDER BY seq ${forward ? 'ASC' : 'DESC'} LIMIT ?`,
        ws,
        sid,
        cursor,
        limit,
      );
      if (!forward) result.reverse();
    }
    const first = result[0]?.seq,
      last = result.at(-1)?.seq;
    const exists = (operator: string, cursor: number | undefined) =>
      cursor !== undefined &&
      rows(`SELECT 1 FROM events WHERE ${base} AND seq${operator}? LIMIT 1`, ws, sid, cursor)
        .length > 0;
    return json({
      items: result.map(mapEvent),
      older: exists('<', first) ? first : null,
      newer: exists('>', last) ? last : null,
    });
  }
  if (route === '/checkpoint-files' || route === '/checkpoint-file') {
    const cp = idSchema.parse(p.get('checkpoint'));
    const base = `${kind}='checkpoint' AND ${workspace}=? AND ${checkpoint}=?`;
    const aggregate = rows<any>(
      `SELECT COUNT(*) records,COUNT(DISTINCT ${field('payload.part')}) receivedParts,
      MAX(${field('payload.parts')}) expectedParts,MAX(${field('payload.totalFiles')}) expectedFiles,
      COUNT(DISTINCT ${field('payload.parts')}) partCounts,COUNT(DISTINCT ${field('payload.totalFiles')}) fileCounts,
      MIN(${field('payload.part')}) firstPart, MAX(${field('payload.part')}) lastPart FROM events WHERE ${base}`,
      ws,
      cp,
    )[0];
    if (!aggregate.records) throw new HttpError(404, 'Checkpoint not found');
    const fileFrom = `events,json_each(body,'$.payload.files') f WHERE ${base}`;
    if (route === '/checkpoint-file') {
      const filepath = relativePathSchema.parse(p.get('path'));
      const found = rows<{ value: string }>(
        `SELECT f.value FROM ${fileFrom} AND json_extract(f.value,'$.path')=? LIMIT 2`,
        ws,
        cp,
        filepath,
      );
      if (found.length !== 1)
        throw new HttpError(
          found.length ? 409 : 404,
          'File is missing or duplicated in checkpoint',
        );
      return json(JSON.parse(found[0].value));
    }
    const counts = rows<any>(
      `SELECT COUNT(*) count, COUNT(DISTINCT json_extract(f.value,'$.path')) uniqueCount FROM ${fileFrom}`,
      ws,
      cp,
    )[0];
    const after = p.get('after') ?? '';
    if (after) relativePathSchema.parse(after);
    const list = rows<{ file: string; path: string }>(
      `SELECT json_remove(f.value,'$.patch') file,json_extract(f.value,'$.path') path FROM ${fileFrom} AND json_extract(f.value,'$.path')>? GROUP BY json_extract(f.value,'$.path') ORDER BY json_extract(f.value,'$.path') LIMIT ?`,
      ws,
      cp,
      after,
      limit + 1,
    );
    const page = list.slice(0, limit);
    return json({
      files: page.map((r) => JSON.parse(r.file)),
      next: list.length > limit ? page.at(-1)!.path : null,
      receivedParts: aggregate.receivedParts,
      expectedParts: aggregate.expectedParts,
      receivedFiles: counts.uniqueCount,
      expectedFiles: aggregate.expectedFiles,
      complete:
        aggregate.records === aggregate.expectedParts &&
        aggregate.receivedParts === aggregate.expectedParts &&
        aggregate.firstPart === 1 &&
        aggregate.lastPart === aggregate.expectedParts &&
        aggregate.partCounts === 1 &&
        aggregate.fileCounts === 1 &&
        counts.count === counts.uniqueCount &&
        counts.count === aggregate.expectedFiles,
    });
  }
  throw new HttpError(404, 'History query not found');
}
