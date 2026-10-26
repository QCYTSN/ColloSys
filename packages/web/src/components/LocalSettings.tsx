import { useState } from 'react';
import { AlertCircle, Check, HardDrive, MessageSquare, X } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog } from './Dialog';
import { post } from '../api';

type Summary = {
  sessions: string[];
  userMessages: number;
  assistantMessages: number;
  bytes: number;
};
export function LocalSettings({
  token,
  userId,
  connector,
  source,
  sourceError,
  excluded,
  onConnector,
  onClose,
  onRefresh,
}: {
  token: string;
  userId: string;
  connector: string;
  source: string | null;
  sourceError: string | null;
  excluded: string[];
  onConnector: (url: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [logDirectory, setLogDirectory] = useState(''),
    [sources, setSources] = useState<{ path: string; sessionId: string }[]>([]);
  const [url, setUrl] = useState(
      connector.startsWith('http')
        ? connector
        : `http://127.0.0.1:${userId === 'bob' ? 8792 : 8791}`,
    ),
    [file, setFile] = useState(source ?? ''),
    [summary, setSummary] = useState<Summary | null>(null),
    [history, setHistory] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      titleId="connection-settings-title"
      className="help-modal connection-settings"
      busy={busy}
      onClose={onClose}
    >
      <header>
        <h2 id="connection-settings-title">本地连接设置</h2>
        <Button variant="ghost" size="icon" aria-label="关闭连接设置" onClick={onClose}>
          <X />
        </Button>
      </header>
      <h3>
        <HardDrive size={16} />
        选择这台电脑的连接程序
      </h3>
      <p>项目目录在启动连接程序时授权。切换地址不会移动文件，也不会更改其他成员的工作区。</p>
      <label>
        本地地址
        <input
          aria-label="本地连接程序地址"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://127.0.0.1:8793"
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          void run(async () => {
            const parsed = new URL(url);
            if (
              parsed.protocol !== 'http:' ||
              !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
              parsed.username ||
              parsed.password ||
              parsed.pathname !== '/' ||
              parsed.search ||
              parsed.hash
            )
              throw new Error('只接受本机 HTTP 地址，例如 http://127.0.0.1:8793');
            const value = parsed.origin;
            const response = await fetch(value + '/api/status', {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) throw new Error('无法连接，或该连接程序属于另一成员');
            onConnector(value);
            setMessage('连接程序已切换。');
          })
        }
        disabled={busy}
      >
        连接此工作区
      </Button>
      {excluded.length > 0 && (
        <details className="excluded-files">
          <summary>当前排除 {excluded.length} 项；这些内容不包含在新检查点中</summary>
          <p>忽略规则、凭证路径、链接或大小限制会影响纳管范围。已排除内容不会上传。</p>
          <ul>
            {excluded.slice(0, 50).map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
          {excluded.length > 50 && <p>仅显示前 50 项。</p>}
        </details>
      )}
      <hr />
      <h3>
        <MessageSquare size={16} />
        接入真实 Codex 会话
      </h3>
      <p>
        选择一个属于当前项目目录的 rollout JSONL
        文件。仅采集用户与公开助手消息，跳过工具输出、系统上下文和内部推理。其他 Agent 暂未接入。
      </p>
      <label>
        授权搜索的 Codex 日志目录
        <input
          value={logDirectory}
          onChange={(e) => {
            setLogDirectory(e.target.value);
            setSources([]);
          }}
          placeholder="C:\Users\…\.codex\sessions"
        />
      </label>
      <Button
        variant="outline"
        size="sm"
        disabled={busy || !logDirectory}
        onClick={() =>
          void run(async () => {
            const result = await post(connector + '/api/agent/discover', token, {
              directory: logDirectory,
              confirmed: true,
            });
            setSources(result.sources);
            setMessage(`找到 ${result.sources.length} 个匹配当前项目的会话；选择后仍需确认共享。`);
          })
        }
      >
        授权搜索此目录中的匹配会话
      </Button>
      {sources.length > 0 && (
        <label>
          匹配的会话
          <select
            value={file}
            onChange={(e) => {
              setFile(e.target.value);
              setSummary(null);
              setConsent(false);
            }}
          >
            <option value="">选择一个会话</option>
            {sources.map((s) => (
              <option key={s.path} value={s.path}>
                {s.sessionId} · {s.path}
              </option>
            ))}
          </select>
        </label>
      )}
      {source && (
        <p className="selected-source">
          正在采集：<code>{source}</code>
        </p>
      )}
      {sourceError && (
        <div role="alert" className="settings-error">
          日志采集暂时失败：{sourceError}
        </div>
      )}
      <label>
        Codex 日志绝对路径
        <input
          aria-label="Codex 日志路径"
          value={file}
          onChange={(e) => {
            setFile(e.target.value);
            setSummary(null);
            setConsent(false);
          }}
          placeholder="C:\Users\…\.codex\sessions\…\rollout-….jsonl"
        />
      </label>
      <div className="settings-buttons">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !file}
          onClick={() =>
            void run(async () => {
              setSummary(await post(connector + '/api/agent/preview', token, { path: file }));
            })
          }
        >
          检查日志
        </Button>
        {source && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await post(connector + '/api/agent/disconnect', token, {});
                setSummary(null);
                setMessage('已停止采集。已共享的历史仍保留。');
              })
            }
          >
            停止采集
          </Button>
        )}
      </div>
      {summary && (
        <div className="agent-source-preview">
          <strong>日志与当前项目匹配</strong>
          <p>
            {summary.sessions.length} 个会话 · {summary.userMessages} 条用户消息 ·{' '}
            {summary.assistantMessages} 条助手消息
          </p>
          <label className="setting-check">
            <input
              type="checkbox"
              checked={history}
              onChange={(e) => setHistory(e.target.checked)}
            />
            同时导入已有消息（默认只记录后续消息）
          </label>
          <label className="setting-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            我同意将选定会话的消息共享给当前项目成员
          </label>
          <Button
            size="sm"
            disabled={!consent || busy}
            onClick={() =>
              void run(async () => {
                const result = await post(connector + '/api/agent/connect', token, {
                  path: file,
                  importHistory: history,
                  confirmed: true,
                });
                setMessage(
                  `已连接 Codex 日志，导入 ${result.imported} 条消息。后续保存的消息会自动同步。`,
                );
                setSummary(null);
              })
            }
          >
            <Check />
            确认接入
          </Button>
        </div>
      )}
      {error && (
        <div role="alert" className="settings-error">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="settings-success">
          <Check size={14} />
          {message}
        </div>
      )}
    </Dialog>
  );
}
