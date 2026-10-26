import { useEffect, useState } from 'react';
import { managerApi, type Auth } from '../api';
import { Dialog } from './Dialog';
import { Button } from './ui/button';
type Local = {
  workspaceId: string;
  projectId: string;
  label: string;
  root: string;
  url: string;
  running: boolean;
};
export function ProjectSetup({
  auth,
  project,
  onClose,
  onConnected,
}: {
  auth: Auth;
  project: string;
  onClose: () => void;
  onConnected: (url: string) => void;
}) {
  const [root, setRoot] = useState(''),
    [label, setLabel] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [list, setList] = useState<Local[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const manager = (route: string, data?: unknown) => managerApi(route, auth.token, data);
  const reload = async () => setList((await manager('connectors')).connectors);
  useEffect(() => {
    void reload().catch(() =>
      setError('请使用本地 ColloSys 启动器打开页面，以授权此浏览器管理连接程序。'),
    );
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      titleId="setup-title"
      className="help-modal management-modal"
      onClose={onClose}
      busy={busy}
    >
      <header>
        <h2 id="setup-title">接入这台电脑的项目</h2>
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      </header>
      {error && <p role="alert">{error}</p>}
      <form
        className="product-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const result = await manager('connectors/create', {
              root,
              label,
              projectId: project,
              confirmed,
            });
            onConnected(result.url);
          });
        }}
      >
        <label>
          项目目录
          <input
            required
            value={root}
            onChange={(e) => {
              setRoot(e.target.value);
              setConfirmed(false);
            }}
            placeholder="D:\Projects\my-project"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await manager('roots/choose', {});
              if (result.path) {
                setRoot(result.path);
                setConfirmed(false);
              }
            })
          }
        >
          浏览文件夹
        </Button>
        <label>
          工作区名称
          <input required maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="confirm-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          我授权捕获此目录中允许共享的文件，并向所选项目成员展示差异
        </label>
        <p>检查点留在本机；日志接入和加密备份需要另行选择。链接、凭证、依赖和构建产物会被排除。</p>
        <Button disabled={busy || !confirmed || !project}>创建并启动连接程序</Button>
      </form>
      <h3>已接入的工作区</h3>
      <div className="record-list">
        {list.map((c) => (
          <article key={c.workspaceId}>
            <strong>{c.label}</strong>
            <p>{c.root}</p>
            <div className="button-row">
              <Button
                disabled={busy}
                size="sm"
                onClick={() =>
                  void run(async () => {
                    const result = await manager('connectors/start', {
                      workspaceId: c.workspaceId,
                    });
                    if (c.projectId === project) onConnected(result.url);
                  })
                }
              >
                {c.running ? '重新连接并更新登录' : '启动并连接'}
              </Button>
              {c.running && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await manager('connectors/stop', { workspaceId: c.workspaceId });
                    })
                  }
                >
                  停止
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm('关闭这台电脑上的 ColloSys 服务？未发送事件仍会保留，之后可以重新启动。')
          )
            void run(async () => {
              await manager('shutdown', { confirmed: true });
              setError('本机服务已关闭，可以关闭浏览器窗口。');
            });
        }}
      >
        关闭本机服务
      </Button>
    </Dialog>
  );
}
