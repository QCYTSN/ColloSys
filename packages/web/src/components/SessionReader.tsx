import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../api';
import type { StoredEvent } from '../../../shared/src/protocol';
import type { MessagePage } from '../../../shared/src/history';
import { MarkdownRenderer } from './codecast/MarkdownRenderer';
import {
  initialScrollEdge,
  shouldFollowStreaming,
  shouldAdjustScrollForResize,
} from './codecast/conversationScroll';
import { Button } from './ui/button';

export function SessionReader({
  base,
  token,
  event,
  anchor,
  revision,
  onLink,
}: {
  base: string;
  token: string;
  event: StoredEvent;
  anchor?: string;
  revision: number;
  onLink: (id: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null),
    away = useRef(false),
    lock = useRef(false),
    alive = useRef(true);
  const [page, setPage] = useState<MessagePage>({ items: [], older: null, newer: null }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [news, setNews] = useState(false);
  const landing = useRef<{ id?: string; tail?: boolean; offset?: number } | null>(null);
  const seenRevision = useRef(-1);
  const session = event.kind === 'agent.message' ? event.payload.sessionId : '';
  const endpoint = `${base}/messages?workspace=${encodeURIComponent(event.workspaceId)}&session=${encodeURIComponent(session)}`;
  const virtual = useVirtualizer({
    count: page.items.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 180,
    overscan: 5,
    getItemKey: (index) => page.items[index].id,
  });
  virtual.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
    shouldAdjustScrollForResize({
      itemStart: item.start,
      scrollOffset: instance.scrollOffset ?? 0,
      held: false,
    });
  async function load(direction: 'initial' | 'older' | 'newer' | 'latest') {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const startedRevision = revision;
    seenRevision.current = startedRevision;
    let suffix = '';
    if (direction === 'initial' && anchor) suffix = '&around=' + encodeURIComponent(anchor);
    if (direction === 'older') suffix = '&before=' + page.older;
    if (direction === 'newer') suffix = '&after=' + (page.items.at(-1)?.seq ?? 0);
    const firstVisible = virtual
      .getVirtualItems()
      .find((item) => item.end > (scroll.current?.scrollTop ?? 0));
    const restore = firstVisible
      ? {
          id: page.items[firstVisible.index].id,
          offset: (scroll.current?.scrollTop ?? 0) - firstVisible.start,
        }
      : null;
    try {
      const result = await api<MessagePage>(endpoint + suffix, token);
      if (!alive.current) return;
      seenRevision.current = startedRevision;
      if (direction === 'older') landing.current = restore;
      else if (direction === 'initial')
        landing.current =
          initialScrollEdge({ guest: false, hasExplicitTarget: !!anchor }) === 'bottom'
            ? { tail: true }
            : { id: anchor };
      else if (direction === 'latest' || shouldFollowStreaming(away.current))
        landing.current = { tail: true };
      setPage((old) => {
        if (direction === 'initial' || direction === 'latest') return result;
        const items = [
          ...old.items,
          ...result.items.filter((x) => !old.items.some((y) => y.id === x.id)),
        ].sort((a, b) => a.seq - b.seq);
        return {
          items,
          older: direction === 'older' ? result.older : old.older,
          newer: direction === 'newer' ? result.newer : old.newer,
        };
      });
      if (direction === 'latest') {
        away.current = false;
        setNews(false);
      }
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void load('initial');
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (busy || !page.items.length || seenRevision.current === revision) return;
    if (away.current || page.newer !== null) {
      setNews(true);
      seenRevision.current = revision;
      return;
    }
    void load('newer');
  }, [revision, busy, page.items.length]);
  useLayoutEffect(() => {
    const target = landing.current;
    if (!target || !page.items.length) return;
    const index = target.tail
      ? page.items.length - 1
      : page.items.findIndex((m) => m.id === target.id);
    if (index < 0) {
      landing.current = null;
      return;
    }
    let frame = 0,
      tries = 0;
    const position = () => {
      if (!landing.current) return;
      virtual.scrollToIndex(index, { align: target.tail ? 'end' : 'start' });
      if (target.offset) scroll.current!.scrollTop += target.offset;
      if (++tries < 3) frame = requestAnimationFrame(position);
      else landing.current = null;
    };
    frame = requestAnimationFrame(position);
    return () => cancelAnimationFrame(frame);
  }, [page.items]);
  return (
    <div className="session-reader">
      <div className="conversation-context">
        <span>Codex</span>
        <code>{session.slice(0, 16)}</code>
        <span>仅共享已授权的用户与最终回复</span>
      </div>
      {error && (
        <div role="alert" className="reader-error">
          {error}
          <Button
            variant="ghost"
            onClick={() => void load(page.items.length ? 'newer' : 'initial')}
          >
            重试
          </Button>
        </div>
      )}
      {page.older !== null && (
        <Button
          className="page-button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            away.current = true;
            void load('older');
          }}
        >
          加载更早的消息
        </Button>
      )}
      <div
        className="conversation virtual-conversation"
        ref={scroll}
        onWheel={(e) => {
          landing.current = null;
          if (e.deltaY < 0) away.current = true;
        }}
        onTouchStart={() => {
          landing.current = null;
          away.current = true;
        }}
        onScroll={() => {
          const el = scroll.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40 && !landing.current)
            away.current = false;
        }}
      >
        {!page.items.length && (
          <p role="status">{busy ? '正在读取会话…' : '此会话没有可显示的消息'}</p>
        )}
        <div style={{ height: virtual.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtual.getVirtualItems().map((row) => {
            const message = page.items[row.index];
            if (message.kind !== 'agent.message') return null;
            return (
              <article
                data-index={row.index}
                data-message-id={message.id}
                ref={virtual.measureElement}
                key={message.id}
                className={`transcript-message ${message.payload.role === 'user' ? 'from-user' : ''} ${message.id === anchor ? 'message-target' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <div className="transcript-author">
                  <strong>{message.payload.role === 'user' ? message.actor.name : 'Codex'}</strong>
                  <time>{new Date(message.occurredAt).toLocaleString('zh-CN')}</time>
                  <button onClick={() => onLink(message.id)} aria-label="定位此消息">
                    链接
                  </button>
                </div>
                <MarkdownRenderer content={message.payload.text} />
                {message.payload.checkpointId && (
                  <small className="association-note">
                    附近检查点 {message.payload.checkpointId.slice(0, 8)} · 不推断修改来源
                  </small>
                )}
              </article>
            );
          })}
        </div>
      </div>
      {page.newer !== null && (
        <Button
          className="page-button"
          variant="ghost"
          disabled={busy}
          onClick={() => void load('newer')}
        >
          加载后续消息
        </Button>
      )}
      <div className="transcript-readonly">
        <span>在你的 Codex 中继续对话</span>
        {news && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void load('latest')}>
            查看最新消息
          </Button>
        )}
      </div>
    </div>
  );
}
