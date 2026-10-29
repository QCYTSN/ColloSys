import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, LockKey, ArrowSquareOut, Copy, Check } from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { localRequest } from './local';
import { permissionFailure } from './collaborationModel';
import { authPrincipal } from '../lib/authPrincipal';
import type { Checkpoint } from './protocol';
import type { LocalDirectory } from './workspaceTypes';
type Policy = { maxCheckpoints: number; maxAgeDays: number; maxDiskMiB: number };
type Recovery = {
  id: string;
  backupId: string;
  checkpointId: string;
  directory: string;
  status: string;
  expiresAt: number;
  files: number;
};
type Storage = {
  cleanupToken: string;
  bytes: number;
  count: number;
  protected: string[];
  pinned: string[];
  remove: string[];
  policy: Policy;
  recoveries: Recovery[];
};
type Backup = {
  id: string;
  workspaceId: string;
  checkpoint_id: string;
  size: number;
  status: string;
  created_at: number;
};
type Backups = {
  location: string;
  remote: boolean;
  backups: Backup[];
  quota: { usedBytes: number; maxBytes: number; usedCount: number; maxCount: number };
};
const size = (bytes: number) =>
  `${(bytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`;
type Operation = {
  kind: 'policy' | 'clean' | 'create' | 'recover' | 'export' | 'delete';
  id?: string;
  reviewId: string;
  policy: Policy;
  checkpointId: string;
  subject: string;
  exportPath: string;
  cleanupToken?: string;
  removeCount: number;
};
const actionLabels = {
  policy: 'Save policy',
  clean: 'Clean reviewed history',
  create: 'Save encrypted backup',
  recover: 'Recover separate copy',
  export: 'Export to this directory',
  delete: 'Delete this backup',
};

export function DirectoryStorage({
  token,
  directory,
  checkpoints,
  onChanged,
}: {
  token: string | null | undefined;
  directory: LocalDirectory;
  checkpoints: Checkpoint[];
  onChanged?: () => Promise<void>;
}) {
  const [storage, setStorage] = useState<Storage | null>(null),
    [backups, setBackups] = useState<Backups | null>(null);
  const [policy, setPolicy] = useState<Policy>({
    maxCheckpoints: 200,
    maxAgeDays: 30,
    maxDiskMiB: 2048,
  });
  const [selectedCheckpoint, setCheckpoint] = useState(
    checkpoints.find((c) => c.integrity !== 'invalid')?.id ?? '',
  );
  const checkpoint = checkpoints.some(
    (c) => c.id === selectedCheckpoint && c.integrity !== 'invalid',
  )
    ? selectedCheckpoint
    : (checkpoints.find((c) => c.integrity !== 'invalid')?.id ?? '');
  const [operation, setOperation] = useState<Operation | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [passphrase, setPassphrase] = useState(''),
    [exportPath, setExportPath] = useState('');
  const [error, setError] = useState(''),
    [remoteError, setRemoteError] = useState(''),
    [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false),
    [denied, setDenied] = useState(false);
  const alive = useRef(true),
    epoch = useRef(authPrincipal.epoch()),
    inFlight = useRef(false),
    policyDirty = useRef(false);
  const confirmation = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (operation) {
      confirmation.current?.scrollIntoView({ block: 'nearest' });
      confirmation.current?.focus({ preventScroll: true });
    }
  }, [operation?.reviewId]);
  const current = () => alive.current && epoch.current === authPrincipal.epoch();
  const request = <T,>(route: string, body?: unknown) =>
    localRequest<T>(token, route, body, directory.url);
  function failure(e: unknown) {
    if (!current()) return;
    if (permissionFailure(e)) {
      setDenied(true);
      setStorage(null);
      setBackups(null);
      setPassphrase('');
      setExportPath('');
      setOperation(null);
    }
    setError(e instanceof Error ? e.message : 'The operation could not be completed.');
  }
  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      request<Storage>('/api/storage'),
      request<Backups>('/api/backups'),
    ]);
    if (!current()) return;
    const [local, remote] = results;
    if (results.some((r) => r.status === 'rejected' && permissionFailure(r.reason))) {
      failure(
        (
          results.find(
            (r) => r.status === 'rejected' && permissionFailure(r.reason),
          ) as PromiseRejectedResult
        ).reason,
      );
      return;
    }
    if (local.status === 'fulfilled') {
      setStorage(local.value);
      if (!policyDirty.current) setPolicy(local.value.policy);
    } else failure(local.reason);
    if (remote.status === 'fulfilled') {
      setBackups(remote.value);
      setRemoteError('');
    } else
      setRemoteError(
        'Backup service is unavailable. Local checkpoints and recovery remain available.',
      );
  }, [token, directory.url]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);
  function choose(next: Pick<Operation, 'kind' | 'id'> | null) {
    const cp = checkpoints.find((c) => c.id === checkpoint);
    const backup = backups?.backups.find((b) => b.id === next?.id);
    setOperation(
      next
        ? {
            ...next,
            reviewId: crypto.randomUUID(),
            policy: { ...policy },
            checkpointId: checkpoint,
            subject: backup
              ? `Backup saved ${new Date(backup.created_at).toLocaleString()}`
              : cp
                ? `${cp.label} · ${new Date(cp.createdAt).toLocaleString()}`
                : directory.label,
            exportPath: '',
            cleanupToken: storage?.cleanupToken,
            removeCount: storage?.remove.length ?? 0,
          }
        : null,
    );
    setExportPath('');
    setConfirmed(false);
    setPassphrase('');
    setError('');
    setMessage('');
  }
  async function execute(action: () => Promise<unknown>, success: string) {
    if (inFlight.current || denied) return false;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      if (current()) {
        setMessage(success);
        choose(null);
        setMessage(success);
        await refresh();
        await onChanged?.();
      }
      return true;
    } catch (e) {
      failure(e);
      return false;
    } finally {
      inFlight.current = false;
      if (current()) {
        setBusy(false);
        setPassphrase('');
      }
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed || !operation || !reviewValid || inFlight.current) return;
    const op = operation;
    const actions = {
      policy: () => request('/api/storage/policy', { policy: op.policy, confirmed: true }),
      clean: () =>
        request('/api/storage/clean', { confirmed: true, expectedPlan: op.cleanupToken }),
      create: () =>
        request('/api/backups/create', {
          checkpointId: op.checkpointId,
          passphrase,
          confirmed: true,
        }),
      recover: () => request('/api/backups/recover', { id: op.id, passphrase, confirmed: true }),
      export: () =>
        request('/api/backups/export', {
          recoveryId: op.id,
          directory: op.exportPath,
          confirmed: true,
        }),
      delete: () => request('/api/backups/delete', { id: op.id, confirmed: true }),
    };
    const saved = await execute(
      actions[op.kind],
      {
        policy: 'Retention policy saved.',
        clean: 'Eligible local history cleaned.',
        create: 'Encrypted copy saved and verified by the backup service.',
        recover: 'Recovery copy is ready in a separate directory.',
        export: 'Recovery exported to the new directory.',
        delete: 'Selected encrypted backup deleted.',
      }[op.kind],
    );
    if (saved && op.kind === 'policy') policyDirty.current = false;
  }
  const reviewValid =
    !operation ||
    (operation.kind === 'create'
      ? checkpoints.some((c) => c.id === operation.checkpointId && c.integrity !== 'invalid')
      : operation.kind === 'clean'
        ? !!operation.cleanupToken && operation.cleanupToken === storage?.cleanupToken
        : operation.kind === 'export'
          ? storage?.recoveries.some(
              (r) => r.id === operation.id && r.status === 'ready' && r.expiresAt > Date.now(),
            )
          : operation.kind === 'delete' || operation.kind === 'recover'
            ? backups?.backups.some(
                (b) =>
                  b.id === operation.id && (operation.kind === 'delete' || b.status === 'complete'),
              )
            : true);
  if (denied)
    return (
      <div role="alert" className="collo-empty">
        Directory access has changed. Close this panel and sign in or request access.
      </div>
    );
  return (
    <div className="collo-storage" data-testid="directory-storage">
      <div className="collo-storage-summary">
        <Database size={24} />
        <div>
          <strong>{directory.label}</strong>
          <p>
            {storage
              ? `${storage.count} checkpoints · ${size(storage.bytes)}`
              : 'Reading local storage…'}
          </p>
          <p title={directory.root}>{directory.root}</p>
        </div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={refresh}>
          Refresh storage
        </Button>
      </div>
      {error && (
        <p className="collo-inline-notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="collo-inline-notice" role="status">
          <Check size={16} />
          {message}
        </p>
      )}
      {storage && (
        <>
          <section>
            <header>
              <h3>Local history</h3>
              <span>Independent from your project’s Git history</span>
            </header>
            <div className="collo-policy-fields">
              {(
                [
                  ['maxCheckpoints', 'Checkpoints', 2, 10000],
                  ['maxAgeDays', 'Days', 1, 3650],
                  ['maxDiskMiB', 'Storage limit (MiB)', 64, 102400],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    disabled={busy}
                    type="number"
                    min={min}
                    max={max}
                    value={policy[key]}
                    onChange={(e) => {
                      if (operation?.kind === 'policy') choose(null);
                      policyDirty.current = true;
                      setPolicy((p) => ({ ...p, [key]: Number(e.target.value) }));
                    }}
                  />
                </label>
              ))}
            </div>
            <p>
              The two newest checkpoints, pinned checkpoints, pending shares and active restore
              previews are protected. Cleanup also removes expired recovery copies.
            </p>
            <div className="collo-inline-actions">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => choose({ kind: 'policy' })}
              >
                Review policy
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => choose({ kind: 'clean' })}
              >
                Review cleanup · {storage.remove.length}
              </Button>
            </div>
            <label className="collo-storage-checkpoint">
              Checkpoint
              <select
                disabled={busy}
                aria-label="Storage checkpoint"
                value={checkpoint}
                onChange={(e) => {
                  if (operation?.kind === 'create') choose(null);
                  setCheckpoint(e.target.value);
                }}
              >
                {checkpoints.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.integrity === 'invalid'}>
                    {c.label} · {new Date(c.createdAt).toLocaleString()} · {c.fileCount} files
                  </option>
                ))}
              </select>
            </label>
            <div className="collo-inline-actions">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !checkpoint}
                onClick={() =>
                  execute(
                    () =>
                      request('/api/storage/pin', {
                        checkpointId: checkpoint,
                        pinned: !storage.pinned.includes(checkpoint),
                      }),
                    storage.pinned.includes(checkpoint)
                      ? 'Checkpoint unpinned.'
                      : 'Checkpoint pinned.',
                  )
                }
              >
                {storage.pinned.includes(checkpoint) ? 'Unpin checkpoint' : 'Pin checkpoint'}
              </Button>
              <Button
                size="sm"
                disabled={busy || !checkpoint || !!remoteError}
                onClick={() => choose({ kind: 'create' })}
              >
                <LockKey size={15} />
                Create encrypted backup
              </Button>
            </div>
          </section>
          <section>
            <header>
              <h3>Encrypted backups</h3>
              <span>
                {backups?.location === 'local-convex-storage'
                  ? 'On this computer'
                  : 'Backup service'}
              </span>
            </header>
            <p>
              Encrypted before upload. This service is on this machine: a local replica is not
              off-machine disaster recovery. Keep your passphrase separately; it cannot be
              recovered.
            </p>
            {backups && (
              <p>
                {backups.quota.usedCount} / {backups.quota.maxCount} copies ·{' '}
                {size(backups.quota.usedBytes)} / {size(backups.quota.maxBytes)}
              </p>
            )}
            {remoteError && (
              <p role="alert">
                {remoteError}
                <Button variant="ghost" size="sm" onClick={refresh}>
                  Retry backups
                </Button>
              </p>
            )}
            {backups?.backups.length === 0 && <p>No encrypted copies yet.</p>}
            {backups?.backups.map((b) => (
              <div className="collo-storage-row" key={b.id} data-backup-id={b.id}>
                <div>
                  <strong>
                    {new Date(b.created_at).toLocaleString()} · {size(b.size)}
                  </strong>
                  <p title={b.checkpoint_id}>{b.checkpoint_id}</p>
                  <small>
                    {b.status} ·{' '}
                    {b.workspaceId === directory.workspaceId
                      ? directory.label
                      : 'Another directory in this project'}
                  </small>
                </div>
                <div className="collo-inline-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || b.status !== 'complete'}
                    onClick={() => choose({ kind: 'recover', id: b.id })}
                  >
                    Recover copy
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => choose({ kind: 'delete', id: b.id })}
                  >
                    Delete backup
                  </Button>
                </div>
              </div>
            ))}
          </section>
          <section>
            <header>
              <h3>Recovery copies</h3>
              <span>Separate directories · expire after 24 hours</span>
            </header>
            <p>
              Review these files before exporting. Recovering and exporting never replaces your
              working directory.
            </p>
            {!storage.recoveries.length && <p>No recovery copies on this device.</p>}
            {storage.recoveries.map((r) => (
              <div className="collo-storage-row" key={r.id} data-recovery-id={r.id}>
                <div>
                  <strong>
                    {r.files} files · {r.status}
                  </strong>
                  <p className="collo-path" title={r.directory}>
                    {r.directory}
                  </p>
                  <small>Expires {new Date(r.expiresAt).toLocaleString()}</small>
                </div>
                <div className="collo-inline-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(r.directory);
                        if (current()) {
                          setError('');
                          setMessage('Recovery path copied.');
                        }
                      } catch {
                        if (current())
                          setError('Could not copy the path. Select and copy the path shown here.');
                      }
                    }}
                  >
                    Copy path
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || r.status !== 'ready' || r.expiresAt <= Date.now()}
                    onClick={() => choose({ kind: 'export', id: r.id })}
                  >
                    <ArrowSquareOut size={15} />
                    Export copy
                  </Button>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
      {operation && (
        <form
          ref={confirmation}
          tabIndex={-1}
          className="collo-storage-confirm"
          onSubmit={submit}
          aria-label="Confirm storage operation"
        >
          <h3>
            {
              {
                policy: 'Save retention policy',
                clean: 'Clean local history',
                create: 'Create encrypted backup',
                recover: 'Recover an encrypted copy',
                export: 'Export recovery copy',
                delete: 'Delete encrypted backup',
              }[operation.kind]
            }
          </h3>
          <p>
            {operation.kind === 'clean'
              ? `${operation.removeCount} reviewed checkpoints and expired recovery copies will be removed from managed storage for ${directory.label}. Your working files are untouched.`
              : operation.kind === 'delete'
                ? `Only “${operation.subject}” will be deleted from the backup service. This cannot be undone. Local checkpoints and working files are kept.`
                : operation.kind === 'policy'
                  ? `Keep up to ${operation.policy.maxCheckpoints} checkpoints for ${operation.policy.maxAgeDays} days with a ${operation.policy.maxDiskMiB} MiB limit. Cleanup is a separate action.`
                  : operation.kind === 'export'
                    ? 'Choose a new, non-existing absolute directory outside the source project and managed storage. Existing destinations are rejected.'
                    : operation.kind === 'recover'
                      ? 'Decrypt this backup into a new temporary recovery directory. Your project will not be changed.'
                      : `Encrypt “${operation.subject}” from ${directory.label} and save the copy on this computer. Your working directory stays unchanged.`}
          </p>
          {!reviewValid && (
            <p role="alert">
              This reviewed item or cleanup scope has changed. Cancel and review the current
              information before continuing.
            </p>
          )}
          {operation.kind !== 'policy' && operation.kind !== 'clean' && (
            <details>
              <summary>Source details</summary>
              <p className="collo-path">{operation.id || operation.checkpointId}</p>
            </details>
          )}
          {(operation.kind === 'create' || operation.kind === 'recover') && (
            <label>
              Backup passphrase
              <input
                disabled={busy}
                type="password"
                autoComplete="off"
                minLength={16}
                maxLength={256}
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="At least 16 characters"
              />
            </label>
          )}
          {operation.kind === 'export' && (
            <label>
              New export directory
              <input
                disabled={busy}
                required
                value={exportPath}
                onChange={(e) => {
                  setExportPath(e.target.value);
                  setOperation((op) => op && { ...op, exportPath: e.target.value });
                  setConfirmed(false);
                }}
                placeholder="D:\\Recovery\\new-directory"
              />
            </label>
          )}
          <label className="collo-confirm-check">
            <input
              disabled={busy || !reviewValid}
              type="checkbox"
              checked={confirmed && !!reviewValid}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm this operation and its scope.
          </label>
          <div className="collo-inline-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => choose(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="collo-pending-button"
              disabled={!confirmed || busy || !reviewValid}
              aria-busy={busy}
            >
              <span aria-hidden={busy} style={{ visibility: busy ? 'hidden' : 'visible' }}>
                {actionLabels[operation.kind]}
              </span>
              {busy && <span className="collo-pending-label">Working…</span>}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
