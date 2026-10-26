import { useEffect, useRef, useState } from 'react';
import type { StoredEvent, FileChange } from '../../../shared/src/protocol';
import type { CheckpointFiles } from '../../../shared/src/history';
import { api } from '../api';
import { Button } from './ui/button';
import { FileDiffView } from './codecast/FileDiffView';
import { changeCounts } from './Patch';
import { RichPatch } from './RichPatch';
export function CheckpointReader({
  base,
  token,
  event,
  dark,
  revision,
}: {
  base: string;
  token: string;
  event: StoredEvent;
  dark: boolean;
  revision: number;
}) {
  const [inventory, setInventory] = useState<CheckpointFiles | null>(null),
    [selected, setSelected] = useState(''),
    [file, setFile] = useState<FileChange | null>(null),
    [error, setError] = useState(''),
    [fileError, setFileError] = useState(''),
    [fileAttempt, setFileAttempt] = useState(0),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    alive = useRef(true);
  const seenRevision = useRef(-1);
  const cp = event.kind === 'checkpoint' ? event.payload.checkpointId : '';
  const params = new URLSearchParams({ workspace: event.workspaceId, checkpoint: cp });
  async function load(more = false) {
    const current = ++generation.current,
      startedRevision = revision;
    seenRevision.current = startedRevision;
    setBusy(true);
    try {
      const result = await api<CheckpointFiles>(
        `${base}/checkpoint-files?${params}${more ? '&after=' + encodeURIComponent(inventory?.next ?? '') : ''}`,
        token,
      );
      if (!alive.current || current !== generation.current) return;
      seenRevision.current = startedRevision;
      setInventory((old) => ({
        ...result,
        files:
          more && old
            ? [
                ...old.files,
                ...result.files.filter((f) => !old.files.some((x) => x.path === f.path)),
              ]
            : result.files,
      }));
      if (!more) setSelected((old) => old || result.files[0]?.path || '');
      setError('');
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      if (alive.current && current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (inventory && !inventory.complete && !busy && seenRevision.current !== revision) void load();
  }, [revision, busy, inventory?.complete]);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    setFile(null);
    setFileError('');
    void api<FileChange>(
      `${base}/checkpoint-file?${params}&path=${encodeURIComponent(selected)}`,
      token,
      { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) },
    )
      .then(setFile)
      .catch((e) => {
        if (!abort.signal.aborted) setFileError(String(e));
      });
    return () => abort.abort();
  }, [selected, fileAttempt]);
  return (
    <>
      <div className="diff-bar">
        <strong>文件变化</strong>
        <span>
          {inventory?.receivedFiles ?? '…'} /{' '}
          {inventory?.expectedFiles ?? (event.kind === 'checkpoint' ? event.payload.totalFiles : 0)}
        </span>
        <code>{cp.slice(0, 8)}</code>
      </div>
      {(error || fileError) && (
        <div role="alert">
          {error || fileError}
          <Button
            onClick={() => {
              setFileAttempt((n) => n + 1);
              void load();
            }}
          >
            重新读取
          </Button>
        </div>
      )}
      {inventory && !inventory.complete && (
        <p className="reader-error" role="status">
          正在等待完整检查点：已收到 {inventory.receivedParts}/{inventory.expectedParts} 批，
          {inventory.receivedFiles}/{inventory.expectedFiles} 个文件。
        </p>
      )}
      {inventory?.complete && inventory.receivedFiles === 0 ? (
        <div className="empty-state">
          <h2>当前状态已保存</h2>
          <p>此次检查点没有文件变化。</p>
        </div>
      ) : (
        <div className="diff-layout">
          <div className="file-list">
            {inventory?.files.map((f) => (
              <button
                key={f.path}
                className={selected === f.path ? 'active' : ''}
                onClick={() => setSelected(f.path)}
              >
                <span title={f.path}>{f.path}</span>
                <b className={`file-status ${f.status}`}>
                  {{ added: 'A', modified: 'M', deleted: 'D', excluded: 'U' }[f.status]}
                </b>
              </button>
            ))}
            {inventory?.next && (
              <Button disabled={busy} variant="ghost" onClick={() => void load(true)}>
                加载更多文件
              </Button>
            )}
          </div>
          <div className="diff-content">
            {file ? (
              <FileDiffView
                key={file.path}
                file={{
                  filename: file.path,
                  status: file.status,
                  ...changeCounts(file.patch),
                  changes: 0,
                  patch: file.patch,
                }}
              >
                <RichPatch file={file} dark={dark} />
              </FileDiffView>
            ) : (
              <p className="patch-empty" role="status">
                {busy || selected ? '正在读取差异…' : '选择文件查看差异'}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
