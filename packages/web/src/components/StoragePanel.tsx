import { useEffect, useRef, useState } from 'react';
import { api, post } from '../api';
import { Button } from './ui/button';
import type { Checkpoint } from '../../../shared/src/protocol';
type Storage = {
  bytes: number;
  count: number;
  remove: string[];
  protected: string[];
  policy: { maxCheckpoints: number; maxAgeDays: number; maxDiskMiB: number };
  backup: { location: string; at: number; checkpointId: string } | null;
};
type Remote = {
  id: string;
  checkpoint_id: string;
  created_at: number;
  size: number;
  status: string;
};
export function StoragePanel({
  connector,
  token,
  checkpoints,
}: {
  connector: string;
  token: string;
  checkpoints: Checkpoint[];
}) {
  const [storage, setStorage] = useState<Storage | null>(null),
    [policy, setPolicy] = useState<Storage['policy']>({
      maxCheckpoints: 200,
      maxAgeDays: 30,
      maxDiskMiB: 2048,
    }),
    [remote, setRemote] = useState<Remote[]>([]),
    [location, setLocation] = useState(''),
    [checkpoint, setCheckpoint] = useState(''),
    [passphrase, setPassphrase] = useState(''),
    [consent, setConsent] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    mounted = useRef(true),
    dirty = useRef(false),
    pending = useRef<AbortController | null>(null);
  const refresh = async () => {
    const current = ++generation.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    const [value, data] = await Promise.all([
      api<Storage>(connector + '/api/storage', token, { signal }),
      api<{ backups: Remote[]; location: string }>(connector + '/api/backups', token, { signal }),
    ]);
    if (!mounted.current || current !== generation.current) return;
    setStorage(value);
    if (!dirty.current) setPolicy(value.policy);
    setRemote(data.backups);
    setLocation(data.location);
  };
  useEffect(() => {
    mounted.current = true;
    void refresh().catch((e) => {
      if (mounted.current && e.name !== 'AbortError') setError(String(e));
    });
    return () => {
      mounted.current = false;
      generation.current++;
      pending.current?.abort();
    };
  }, [connector, token]);
  const run = async (fn: () => Promise<void>) => {
    if (!storage || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setPassphrase('');
    }
  };
  const request = (route: string, data: unknown) =>
    api(connector + route, token, {
      method: 'POST',
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(120000),
    });
  if (!storage)
    return (
      <section className="product-card storage-panel">
        <h2>保存策略与加密备份</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => void refresh().catch((e) => setError(String(e)))}>
              重新加载
            </Button>
          </>
        ) : (
          <p role="status">正在读取当前工作区…</p>
        )}
      </section>
    );
  return (
    <section className="product-card storage-panel">
      <h2>保存策略与加密备份</h2>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <p>
        本机使用 {((storage?.bytes ?? 0) / 1048576).toFixed(1)} MiB · {storage?.count ?? 0}{' '}
        个检查点。待发送、正在预览、最近两个以及手动保留的检查点不会自动清理。
      </p>
      <form
        className="product-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (window.confirm('启用此保留策略后，过期且未受保护的本地检查点会自动清理。确认保存？'))
            void run(async () => {
              await post(connector + '/api/storage/policy', token, { policy, confirmed: true });
              dirty.current = false;
              setMessage('保留策略已保存。');
            });
        }}
      >
        <div className="form-columns">
          <label>
            保留数量
            <input
              type="number"
              min={2}
              disabled={busy}
              max={10000}
              value={policy.maxCheckpoints}
              onChange={(e) => {
                dirty.current = true;
                setPolicy({ ...policy, maxCheckpoints: Number(e.target.value) });
              }}
            />
          </label>
          <label>
            保留天数
            <input
              type="number"
              min={1}
              disabled={busy}
              max={3650}
              value={policy.maxAgeDays}
              onChange={(e) => {
                dirty.current = true;
                setPolicy({ ...policy, maxAgeDays: Number(e.target.value) });
              }}
            />
          </label>
          <label>
            存储预算（MiB）
            <input
              type="number"
              min={64}
              disabled={busy}
              max={102400}
              value={policy.maxDiskMiB}
              onChange={(e) => {
                dirty.current = true;
                setPolicy({ ...policy, maxDiskMiB: Number(e.target.value) });
              }}
            />
          </label>
        </div>
        <div className="button-row">
          <Button disabled={busy}>保存策略</Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`按当前策略清理 ${storage?.remove.length ?? 0} 个检查点？`))
                void run(async () => {
                  const result = await post(connector + '/api/storage/clean', token, {
                    confirmed: true,
                  });
                  setMessage(`已清理 ${result.removed} 个检查点。`);
                });
            }}
          >
            立即清理
          </Button>
        </div>
      </form>
      <label className="field">
        选择本地检查点
        <select value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>
          <option value="">请选择</option>
          {checkpoints.map((c) => (
            <option key={c.id} value={c.id}>
              {new Date(c.createdAt).toLocaleString()} · {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className="button-row">
        <Button
          disabled={busy || !checkpoint}
          variant="outline"
          onClick={() =>
            void run(async () => {
              await post(connector + '/api/storage/pin', token, {
                checkpointId: checkpoint,
                pinned: true,
              });
              setMessage('此检查点已固定保留。');
            })
          }
        >
          固定保留
        </Button>
        <Button
          disabled={busy || !checkpoint}
          variant="outline"
          onClick={() =>
            void run(async () => {
              await post(connector + '/api/storage/pin', token, {
                checkpointId: checkpoint,
                pinned: false,
              });
              setMessage('已取消手动保留；系统保护规则仍然适用。');
            })
          }
        >
          取消固定
        </Button>
      </div>
      <h3>{location === 'remote-r2' ? '远端加密备份' : '本机后端中的加密备份'}</h3>
      <p>
        {location === 'remote-r2'
          ? '文件在上传前由本地连接程序加密。'
          : '当前对象存储也在这台电脑上，不能抵御整机丢失。部署后同一接口可连接远端 R2。'}
        单个压缩检查点上限 24 MiB，每位成员每项目 512 MiB。
      </p>
      <label className="field">
        备份口令
        <input
          type="password"
          disabled={busy}
          minLength={16}
          maxLength={256}
          autoComplete="off"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </label>
      <small>至少 16 个字符，请自行妥善保存。系统不保存口令；丢失口令无法解密。</small>
      <label className="confirm-row">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        我确认使用此口令加密所选检查点，或解密下面选中的备份到独立预览目录
      </label>
      <Button
        disabled={busy || !checkpoint || !consent || passphrase.length < 16}
        onClick={() =>
          void run(async () => {
            const result = await request('/api/backups/create', {
              checkpointId: checkpoint,
              passphrase,
              confirmed: true,
            });
            setMessage(
              result.location === 'remote-r2'
                ? '远端已确认保存加密备份。'
                : '本机对象存储已确认保存加密备份。',
            );
          })
        }
      >
        加密并备份所选检查点
      </Button>
      <div className="record-list">
        {remote.map((b) => (
          <article key={b.id}>
            <strong>
              {new Date(b.created_at).toLocaleString()} ·{' '}
              {b.status === 'complete' ? '上传完成' : '未完成'}
            </strong>
            <span>
              {(b.size / 1048576).toFixed(2)} MiB · {b.checkpoint_id.slice(0, 8)}
            </span>
            <div className="button-row">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !consent || passphrase.length < 16 || b.status !== 'complete'}
                onClick={() =>
                  void run(async () => {
                    const result = await request('/api/backups/recover', {
                      id: b.id,
                      passphrase,
                      confirmed: true,
                    });
                    setMessage(
                      `已验证并重建 ${result.files} 个文件：${result.directory}。原工作目录未改变。此预览保留 24 小时，请及时复制需要的文件。`,
                    );
                  })
                }
              >
                解密到独立目录
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('删除此后端备份？已有本地检查点不受影响。'))
                    void run(async () => {
                      await post(connector + '/api/backups/delete', token, {
                        id: b.id,
                        confirmed: true,
                      });
                    });
                }}
              >
                删除备份
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
