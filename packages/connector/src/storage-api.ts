import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Connector } from './connector';
import { idSchema } from '../../shared/src/protocol';
import { encryptCheckpoint, exportRecovery, MAX_BACKUP_BYTES, reconstructArchive } from './archive';
import { assertRoot, digest, within } from './files';
import { assertNoLinks } from './checked-file';
import {
  cleanRetention,
  defaultRetention,
  diskBytes,
  retentionPlan,
  retentionSchema,
} from './retention';
import { discoverCodex } from './discovery';

async function backupBytes(response: Response) {
  const declared = response.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BACKUP_BYTES)) {
    await response.body?.cancel();
    throw new Error('Backup too large or invalid length');
  }
  if (!response.body) throw new Error('Backup download is empty');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BACKUP_BYTES) throw new Error('Backup too large');
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function storageApi(
  connector: Connector,
  route: string,
  method: string,
  raw: unknown,
): Promise<unknown | undefined> {
  const { store, snapshots, config } = connector;
  if (route === '/api/agent/discover' && method === 'POST') {
    const input = z
      .object({ directory: z.string().min(1).max(2000), confirmed: z.literal(true) })
      .strict()
      .parse(raw);
    if (!path.isAbsolute(input.directory)) throw new Error('400: Select an absolute log directory');
    return discoverCodex(input.directory, config.root);
  }
  if (route === '/api/storage' && method === 'GET')
    return {
      ...retentionPlan(snapshots),
      pinned: store.setting<string[]>('pinnedCheckpoints', []),
      bytes: await diskBytes(config.state),
      recoveryDirectory: snapshots.recoveries,
      recoveries: store.recoveries().map(({ manifest, ...recovery }) => ({
        ...recovery,
        files: Object.keys(manifest).length,
      })),
      backup: store.setting('lastBackup', null),
    };
  if (route === '/api/storage/policy' && method === 'POST') {
    const input = z
      .object({ policy: retentionSchema, confirmed: z.literal(true) })
      .strict()
      .parse(raw);
    return connector.serial(async () => {
      store.set('retention', input.policy);
      return { policy: input.policy };
    });
  }
  if (route === '/api/storage/pin' && method === 'POST') {
    const input = z.object({ checkpointId: idSchema, pinned: z.boolean() }).strict().parse(raw);
    return connector.serial(async () => {
      if (!store.get(input.checkpointId)) throw new Error('404: Checkpoint not found');
      const pinned = new Set(store.setting<string[]>('pinnedCheckpoints', []));
      if (input.pinned) pinned.add(input.checkpointId);
      else pinned.delete(input.checkpointId);
      store.set('pinnedCheckpoints', Array.from(pinned));
      return { pinned: Array.from(pinned) };
    });
  }
  if (route === '/api/storage/clean' && method === 'POST') {
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(raw);
    return connector.serial(() => cleanRetention(snapshots));
  }
  const base = `/api/projects/${config.projectId}/backups`;
  const credential: Record<string, string> =
    config.credential === 'device'
      ? { 'X-ColloSys-Device': config.token }
      : { Authorization: `Bearer ${config.token}` };
  if (route === '/api/backups' && method === 'GET') return connector.backend(base);
  if (route === '/api/backups/create' && method === 'POST') {
    const input = z
      .object({
        checkpointId: idSchema,
        passphrase: z.string().min(16).max(256),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(raw);
    return connector.serial(async () => {
      const encrypted = await encryptCheckpoint(snapshots, input.checkpointId, input.passphrase),
        id = randomUUID(),
        checksum = digest(encrypted);
      await connector.backend(base, {
        method: 'POST',
        body: JSON.stringify({
          id,
          checkpointId: input.checkpointId,
          size: encrypted.length,
          digest: checksum,
        }),
      });
      const response = await fetch(config.backend + base + '/' + id, {
        method: 'PUT',
        headers: {
          ...credential,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(encrypted),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok)
        throw new Error('Backup upload failed; incomplete entry can be removed and retried');
      const receipt = (await response.json()) as {
        id: string;
        verified: boolean;
        location: string;
      };
      if (receipt.id !== id || receipt.verified !== true) throw new Error('Invalid backup receipt');
      const result = {
        ...receipt,
        checkpointId: input.checkpointId,
        at: Date.now(),
        digest: checksum,
      };
      store.set('lastBackup', result);
      return result;
    });
  }
  if (route === '/api/backups/recover' && method === 'POST') {
    const input = z
      .object({ id: idSchema, passphrase: z.string().min(16).max(256), confirmed: z.literal(true) })
      .strict()
      .parse(raw);
    return connector.serial(async () => {
      const response = await fetch(config.backend + base + '/' + input.id, {
        headers: credential,
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error('Backup download failed');
      const bytes = await backupBytes(response);
      if (digest(bytes) !== response.headers.get('X-Backup-Digest'))
        throw new Error('Backup transport integrity check failed');
      const policy = store.setting('retention', defaultRetention);
      if ((await diskBytes(config.state)) + 150 * 1024 * 1024 > policy.maxDiskMiB * 1024 * 1024)
        throw new Error('Free 150 MiB of storage quota before recovery');
      const recoveryId = `recovery-${randomUUID()}`;
      const createdAt = Date.now(),
        expiresAt = createdAt + 86400000;
      store.saveRecovery({
        id: recoveryId,
        backupId: input.id,
        checkpointId: null,
        directory: path.join(snapshots.recoveries, recoveryId),
        status: 'extracting',
        createdAt,
        expiresAt,
        manifest: {},
      });
      const result = await reconstructArchive(
        bytes,
        input.passphrase,
        snapshots.recoveries,
        recoveryId,
      );
      store.saveRecovery({
        id: recoveryId,
        backupId: input.id,
        checkpointId: result.checkpointId,
        directory: result.directory,
        status: 'ready',
        createdAt,
        expiresAt,
        manifest: result.manifest,
      });
      return {
        recoveryId,
        checkpointId: result.checkpointId,
        directory: result.directory,
        files: result.files,
        expiresAt,
      };
    });
  }
  if (route === '/api/backups/export' && method === 'POST') {
    const input = z
      .object({
        recoveryId: idSchema,
        directory: z.string().min(1).max(2000),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(raw);
    if (!path.isAbsolute(input.directory)) throw new Error('400: Select a new absolute directory');
    return connector.serial(async () => {
      const recovery = store.recovery(input.recoveryId);
      if (!recovery || recovery.status !== 'ready' || recovery.expiresAt < Date.now())
        throw new Error('404: Recovery is unavailable or expired; recover the backup again');
      const directory = path.resolve(input.directory);
      // Manager state is <managed directory>/<workspaceId>; standalone connectors
      // only own their configured state. Neither may export into a project root.
      const managed =
        path.basename(config.state) === config.workspaceId
          ? path.dirname(config.state)
          : config.state;
      for (const forbidden of [config.root, managed])
        if (within(forbidden, directory) || within(directory, forbidden))
          throw new Error('400: Export must be outside the project and managed storage');
      await assertNoLinks(directory, { allowMissing: true });
      await assertRoot(path.dirname(directory));
      const expected = path.join(snapshots.recoveries, input.recoveryId);
      if (path.resolve(recovery.directory) !== expected)
        throw new Error('Recovery directory does not match its managed record');
      return exportRecovery(recovery, directory);
    });
  }
  if (route === '/api/backups/delete' && method === 'POST') {
    const input = z
      .object({ id: idSchema, confirmed: z.literal(true) })
      .strict()
      .parse(raw);
    return connector.backend(base + '/' + input.id, { method: 'DELETE' });
  }
  return undefined;
}
