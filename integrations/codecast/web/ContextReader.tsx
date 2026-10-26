import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CaretDown, ArrowDown, ArrowClockwise, FileText, CheckCircle } from '@phosphor-icons/react';
import { shouldFollowStreaming } from '../components/conversationScroll';
import type { Activity, SourceMessage } from './ContextModel';

export type ReadingMemory = { offset: number; loaded: number; sizes: Record<string, number> };
export type ReaderHandle = {
  latest: () => void;
  simulateIncoming: () => void;
  showComments: () => void;
};
export type LocalComment = { id: string; text: string; anchor?: string };
const markdownPlugins = [remarkGfm];
const highlightPlugins = [rehypeHighlight];
export function QuotedMessage({ message }: { message: SourceMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isOutput = message.text.startsWith('原始消息中引用的检查输出');
  return isOutput ? (
    <div className="cw-output">
      <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <CaretDown size={15} className={expanded ? 'turned' : ''} />
        原始消息引用的检查输出<span>文本记录</span>
      </button>
      <div className={`cw-disclosure ${expanded ? 'open' : ''}`} inert={!expanded}>
        <div>
          <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={highlightPlugins}>
            {message.text}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  ) : (
    <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={highlightPlugins}>
      {message.text}
    </ReactMarkdown>
  );
}
export const ContextReader = forwardRef<
  ReaderHandle,
  {
    activity: Activity;
    memory: Map<string, ReadingMemory>;
    comments: LocalComment[];
    openFile: (path: string) => void;
  }
>(({ activity, memory, comments, openFile }, ref) => {
  const messages = activity.session?.messages ?? [];
  const initial = memory.get(activity.id) ?? { offset: 0, loaded: 30, sizes: {} };
  const sizes = useRef(initial.sizes);
  const [loaded, setLoaded] = useState(initial.loaded);
  const [loading, setLoading] = useState(false);
  const [extra, setExtra] = useState<SourceMessage[]>([]);
  const [pending, setPending] = useState<SourceMessage[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(true);
  const latestRequested = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visible = [...messages.slice(0, loaded), ...extra];
  const virtual = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => sizes.current[visible[i].id] ?? 210,
    measureElement: (element) => {
      const height = element.getBoundingClientRect().height;
      sizes.current[element.getAttribute('data-message-id')!] = height;
      return height;
    },
    getItemKey: (i) => visible[i].id,
    overscan: 5,
    initialOffset: initial.offset,
  });
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = initial.offset;
    memory.set(activity.id, { ...initial, sizes: sizes.current });
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!latestRequested.current) return;
    let frames = 0;
    let request = 0;
    // Let variable-height markdown settle without remounting the transcript.
    const settle = () => {
      if (userScrolled.current) return;
      virtual.scrollToIndex(visible.length - 1, { align: 'end' });
      if (++frames < 5) request = requestAnimationFrame(settle);
      else latestRequested.current = false;
    };
    request = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(request);
  }, [visible.length, loaded]);
  const latest = () => {
    userScrolled.current = false;
    latestRequested.current = true;
    setLoaded(messages.length);
    setExtra((old) => [...old, ...pending]);
    setPending([]);
    requestAnimationFrame(() =>
      virtual.scrollToIndex(Math.max(0, visible.length - 1), { align: 'end' }),
    );
  };
  useImperativeHandle(ref, () => ({
    latest,
    showComments() {
      userScrolled.current = true;
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
      });
    },
    simulateIncoming() {
      const message: SourceMessage = {
        id: `incoming-${extra.length + pending.length}`,
        seq: messages.length + extra.length + pending.length + 1,
        role: 'assistant',
        text: '新增捕获记录（模拟）：已再次核对本地保存与服务确认的区分。此提示不会启动模型或更改其他成员文件。',
        time: Date.parse('2026-10-26T12:20:00+08:00'),
      };
      if (shouldFollowStreaming(userScrolled.current)) {
        latestRequested.current = true;
        setLoaded(messages.length);
        setExtra((old) => [...old, message]);
      } else setPending((old) => [...old, message]);
    },
  }));
  const loadMore = () => {
    if (loading) return;
    setLoading(true);
    timer.current = setTimeout(() => {
      const next = Math.min(messages.length, loaded + 30);
      setLoaded(next);
      memory.set(activity.id, {
        offset: scroller.current?.scrollTop ?? 0,
        loaded: next,
        sizes: sizes.current,
      });
      setLoading(false);
    }, 160);
  };
  return (
    <div className="cw-reader-shell">
      <div
        ref={scroller}
        className="cw-reader-scroll"
        data-testid="reader-scroll"
        tabIndex={0}
        aria-label="捕获上下文"
        onWheel={(e) => {
          if (e.deltaY < 0) userScrolled.current = true;
        }}
        onKeyDown={(e) => {
          if (['PageUp', 'Home', 'ArrowUp'].includes(e.key)) userScrolled.current = true;
        }}
        onScroll={() =>
          memory.set(activity.id, {
            offset: scroller.current?.scrollTop ?? 0,
            loaded,
            sizes: sizes.current,
          })
        }
      >
        {messages.length ? (
          <>
            <div className="cw-transcript" style={{ height: virtual.getTotalSize() }}>
              {virtual.getVirtualItems().map((row) => {
                const message = visible[row.index];
                return (
                  <article
                    key={row.key}
                    ref={virtual.measureElement}
                    data-index={row.index}
                    data-message-id={message.id}
                    className={`cw-message ${message.role}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${row.start}px)`,
                    }}
                  >
                    <div className="cw-message-meta">
                      <span className={`cw-mini-avatar ${message.role}`}>
                        {message.role === 'user' ? (
                          activity.member.name.slice(0, 1)
                        ) : (
                          <span aria-hidden="true">C</span>
                        )}
                      </span>
                      <strong>{message.role === 'user' ? activity.member.name : 'Codex'}</strong>
                      <span>{message.role === 'user' ? '原始请求' : '捕获回复'}</span>
                      <time>
                        {new Date(message.time).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </time>
                      <span className="cw-message-seq">#{message.seq}</span>
                    </div>
                    <div className="cw-prose">
                      <QuotedMessage message={message} />
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="cw-page-footer">
              <span>
                已载入 {Math.min(loaded, messages.length)} / {messages.length} 条原始消息
              </span>
              {loaded < messages.length && (
                <button onClick={loadMore} disabled={loading}>
                  <ArrowClockwise size={14} />
                  {loading ? '正在读取…' : '加载后续 30 条'}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="cw-saved-context">
            <div className="cw-system-line">
              <CheckCircle size={18} />
              文件已在来源目录保存<time>10:06</time>
            </div>
            <h2>这是一组文件变化</h2>
            <p>{activity.note}</p>
            <p>没有可验证的会话关联。你仍可以查看差异、留下评论，或从自己的目录历史预览恢复。</p>
            <div className="cw-saved-files">
              {activity.checkpoint?.files.slice(0, 5).map((file) => (
                <button key={file.path} onClick={() => openFile(file.path)}>
                  <FileText size={17} />
                  <span>{file.path}</span>
                  <span>{file.status === 'deleted' ? '删除' : '改动'}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!!comments.length && (
          <section className="cw-comments" aria-label="本页评论">
            <h3>协作评论 · 仅本页</h3>
            {comments.map((comment) => (
              <article key={comment.id}>
                <strong>你</strong>
                {comment.anchor && <code>{comment.anchor}</code>}
                <p>{comment.text}</p>
              </article>
            ))}
          </section>
        )}
      </div>
      {!!pending.length && (
        <button className="cw-new-messages" onClick={latest}>
          <ArrowDown size={15} />
          {pending.length} 条新记录 · 阅读位置已保留
        </button>
      )}
    </div>
  );
});
