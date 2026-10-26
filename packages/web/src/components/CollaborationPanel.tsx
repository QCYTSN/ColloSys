import { useEffect, useRef, useState } from 'react';
import { api, post, type Auth } from '../api';
import type { Member, StoredEvent } from '../../../shared/src/protocol';
import type { CollaborationState, Task } from '../../../shared/src/collaboration';
import { Button } from './ui/button';
import { Plus, X } from 'lucide-react';
const blank = { title: '', description: '', assignee: '', status: 'todo' as Task['status'] };
export function CollaborationPanel({
  auth,
  project,
  members,
  events,
  onOpenEvent,
}: {
  auth: Auth;
  project: string;
  members: Member[];
  events: StoredEvent[];
  onOpenEvent: (id: string) => void;
}) {
  const [pane, setPane] = useState<'tasks' | 'comments' | 'handoffs'>('tasks');
  const [taskForm, setTaskForm] = useState(false),
    [handoffForm, setHandoffForm] = useState(false);
  const [data, setData] = useState<CollaborationState>({ tasks: [], comments: [], handoffs: [] }),
    [draft, setDraft] = useState(blank),
    [editing, setEditing] = useState<Task | null>(null),
    [text, setText] = useState(''),
    [taskId, setTaskId] = useState(''),
    [recipient, setRecipient] = useState(''),
    [title, setTitle] = useState(''),
    [context, setContext] = useState(''),
    [nextSteps, setNextSteps] = useState(''),
    [eventId, setEventId] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const base = `/api/projects/${project}`;
  const current = useRef(data),
    alive = useRef(true),
    queue = useRef<Promise<unknown>>(Promise.resolve()),
    pollPending = useRef(false);
  const commit = (value: CollaborationState) => {
    current.current = value;
    if (alive.current) setData(value);
  };
  const serial = (operation: () => Promise<unknown>) => {
    const task = queue.current.catch(() => {}).then(operation);
    queue.current = task;
    return task;
  };
  const reload = async () => {
    const old = current.current,
      fresh = await api<CollaborationState>(base + '/collaboration', auth.token);
    for (const kind of ['tasks', 'comments', 'handoffs'] as const) {
      const oldest = old[kind].at(-1)?.id;
      while (
        oldest &&
        fresh.next?.[kind] != null &&
        !fresh[kind].some((item) => item.id === oldest)
      ) {
        const page = await api<CollaborationState>(
          `${base}/${kind}?before=${fresh.next[kind]}`,
          auth.token,
        );
        // Each stream uses an immutable insertion cursor, including task updates.
        (fresh[kind] as { id: string }[]).push(...page[kind]);
        fresh.next[kind] = page.next?.[kind] ?? null;
      }
    }
    if (alive.current) {
      commit(fresh);
      setError('');
    }
  };
  useEffect(() => {
    alive.current = true;
    commit({ tasks: [], comments: [], handoffs: [] });
    const load = () => {
      if (pollPending.current) return;
      pollPending.current = true;
      return serial(reload)
        .catch((e) => {
          if (alive.current) {
            commit({ tasks: [], comments: [], handoffs: [] });
            setError(String(e));
          }
        })
        .finally(() => (pollPending.current = false));
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [project, auth.token]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await serial(async () => {
        await fn();
        await reload();
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const name = (id: string | null) =>
    members.find((m) => m.id === id)?.name ?? (id ? '已离开成员' : '未分配');
  const writable = members.find((m) => m.id === auth.user.id)?.role !== 'viewer';
  return (
    <section className="collaboration-layout">
      <div className="collaboration-tabs" role="tablist" aria-label="协作内容">
        {(
          [
            ['tasks', '任务', data.tasks.length],
            ['comments', '讨论', data.comments.length],
            ['handoffs', '交接', data.handoffs.length],
          ] as const
        ).map(([id, label, count], index) => (
          <button
            key={id}
            id={`collaboration-${id}`}
            role="tab"
            aria-selected={pane === id}
            aria-controls={`panel-${id}`}
            tabIndex={pane === id ? 0 : -1}
            onClick={() => setPane(id)}
            onKeyDown={(event) => {
              const tabs = ['tasks', 'comments', 'handoffs'] as const;
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % 3
                  : event.key === 'ArrowLeft'
                    ? (index + 2) % 3
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 2
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setPane(tabs[next]);
              document.getElementById(`collaboration-${tabs[next]}`)?.focus();
            }}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div
        className="product-card"
        role="tabpanel"
        id="panel-tasks"
        aria-labelledby="collaboration-tasks"
        hidden={pane !== 'tasks'}
      >
        <div className="compose-toggle">
          <h2>项目任务</h2>
          {writable && (
            <Button size="sm" variant="outline" onClick={() => setTaskForm(!taskForm)}>
              {taskForm ? <X /> : <Plus />}
              {taskForm ? '收起表单' : '新建任务'}
            </Button>
          )}
        </div>
        {writable && taskForm && (
          <form
            className="product-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const input = { ...draft, assignee: draft.assignee || null };
                if (editing)
                  await api(base + '/tasks/' + editing.id, auth.token, {
                    method: 'PATCH',
                    body: JSON.stringify({ ...input, version: editing.version }),
                  });
                else
                  await post(base + '/tasks', auth.token, {
                    title: input.title,
                    description: input.description,
                    assignee: input.assignee,
                  });
                setDraft(blank);
                setEditing(null);
                setTaskForm(false);
              });
            }}
          >
            <label>
              任务标题
              <input
                required
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              任务说明
              <textarea
                maxLength={8000}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <div className="form-columns">
              <label>
                负责人
                <select
                  value={draft.assignee}
                  onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
                >
                  <option value="">未分配</option>
                  {members
                    .filter((m) => m.role !== 'viewer')
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                状态
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as Task['status'] })}
                  disabled={!editing}
                >
                  <option value="todo">待办</option>
                  <option value="doing">进行中</option>
                  <option value="done">完成</option>
                </select>
              </label>
            </div>
            <div className="button-row">
              <Button disabled={busy}>{editing ? '保存任务' : '创建任务'}</Button>
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setDraft(blank);
                  }}
                >
                  取消编辑
                </Button>
              )}
            </div>
          </form>
        )}
        <div className="record-list">
          {!data.tasks.length && !taskForm && (
            <div className="record-empty">还没有任务。为团队安排下一步工作。</div>
          )}
          {data.tasks.map((t) => (
            <article key={t.id}>
              <strong>{t.title}</strong>
              <span>
                {name(t.assignee)} · {{ todo: '待办', doing: '进行中', done: '完成' }[t.status]}
              </span>
              <p>{t.description}</p>
              {writable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTaskForm(true);
                    setEditing(t);
                    setDraft({
                      title: t.title,
                      description: t.description,
                      assignee: t.assignee ?? '',
                      status: t.status,
                    });
                  }}
                >
                  编辑任务
                </Button>
              )}
            </article>
          ))}
        </div>
      </div>
      <div
        className="product-card"
        role="tabpanel"
        id="panel-comments"
        aria-labelledby="collaboration-comments"
        hidden={pane !== 'comments'}
      >
        <h2>项目讨论</h2>
        <label className="field">
          关联任务
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">整个项目</option>
            {data.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        {writable && (
          <form
            className="product-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await post(base + '/comments', auth.token, { text, taskId: taskId || null });
                setText('');
              });
            }}
          >
            <label>
              评论
              <textarea
                required
                maxLength={8000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <Button disabled={busy}>发布评论</Button>
          </form>
        )}
        <div className="record-list">
          {!data.comments.length && (
            <div className="record-empty">讨论会保留在项目中，供其他成员查看。</div>
          )}
          {data.comments
            .filter((c) => !taskId || c.task_id === taskId)
            .map((c) => (
              <article key={c.id}>
                <strong>{c.name}</strong>
                <span>{new Date(c.created_at).toLocaleString()}</span>
                {c.task_id && (
                  <small>{data.tasks.find((t) => t.id === c.task_id)?.title ?? '关联任务'}</small>
                )}
                <p>{c.text}</p>
              </article>
            ))}
        </div>
      </div>
      <div
        className="product-card"
        role="tabpanel"
        id="panel-handoffs"
        aria-labelledby="collaboration-handoffs"
        hidden={pane !== 'handoffs'}
      >
        <div className="compose-toggle">
          <h2>会话交接</h2>
          {writable && (
            <Button size="sm" variant="outline" onClick={() => setHandoffForm(!handoffForm)}>
              {handoffForm ? <X /> : <Plus />}
              {handoffForm ? '收起表单' : '新建交接'}
            </Button>
          )}
        </div>
        <p>接收上下文后，在各自的工作区继续。</p>
        {writable && handoffForm && (
          <form
            className="product-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await post(base + '/handoffs', auth.token, {
                  toUser: recipient,
                  title,
                  context,
                  nextSteps,
                  eventId: eventId || null,
                  taskId: taskId || null,
                });
                setTitle('');
                setContext('');
                setNextSteps('');
                setHandoffForm(false);
              });
            }}
          >
            <label>
              接收成员
              <select required value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                <option value="">请选择</option>
                {members
                  .filter((m) => m.id !== auth.user.id && m.role !== 'viewer')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              交接标题
              <input
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              当前进展与上下文
              <textarea
                required
                maxLength={12000}
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </label>
            <label>
              下一步
              <textarea
                maxLength={8000}
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
              />
            </label>
            <label>
              引用已有会话或检查点
              <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">不引用活动</option>
                {events
                  .slice(-100)
                  .reverse()
                  .map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.actor.name} ·{' '}
                      {ev.kind === 'checkpoint' ? ev.payload.label : ev.payload.text.slice(0, 45)} ·{' '}
                      {new Date(ev.occurredAt).toLocaleTimeString()}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              关联任务
              <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">不关联任务</option>
                {data.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={busy}>提交交接</Button>
          </form>
        )}
        <div className="record-list">
          {!data.handoffs.length && !handoffForm && (
            <div className="record-empty">还没有交接。可以附上当前进展、下一步和已有活动。</div>
          )}
          {data.handoffs.map((h) => (
            <article key={h.id}>
              <strong>{h.title}</strong>
              <span>
                {name(h.from_user)} → {name(h.to_user)} ·{' '}
                {{ pending: '待接收', accepted: '已接收', declined: '已拒绝' }[h.status]}
              </span>
              <p>{h.context}</p>
              <p>下一步：{h.next_steps || '未填写'}</p>
              {h.event_id && (
                <Button variant="outline" size="sm" onClick={() => onOpenEvent(h.event_id!)}>
                  打开引用活动
                </Button>
              )}
              {h.to_user === auth.user.id && h.status === 'pending' && writable && (
                <div className="button-row">
                  {(['accepted', 'declined'] as const).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={status === 'accepted' ? 'default' : 'outline'}
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          api(base + '/handoffs/' + h.id, auth.token, {
                            method: 'PATCH',
                            body: JSON.stringify({ status }),
                          }),
                        )
                      }
                    >
                      {status === 'accepted' ? '接收交接' : '拒绝交接'}
                    </Button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
      {data.next?.[pane] != null && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const old = current.current;
              if (old.next?.[pane] == null) return;
              const page = await api<CollaborationState>(
                `${base}/${pane}?before=${old.next[pane]}`,
                auth.token,
              );
              commit({
                ...old,
                [pane]: [
                  ...old[pane],
                  ...page[pane].filter((x) => !old[pane].some((y) => y.id === x.id)),
                ],
                next: { ...old.next, [pane]: page.next?.[pane] ?? null },
              });
            })
          }
        >
          加载更早的{pane === 'tasks' ? '任务' : pane === 'comments' ? '讨论' : '交接'}
        </Button>
      )}
    </section>
  );
}
