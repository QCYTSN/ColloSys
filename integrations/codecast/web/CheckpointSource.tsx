import { useState } from 'react';
import { useMutation } from 'convex/react';
import Link from 'next/link';
import type { Id } from '@codecast/convex/convex/_generated/dataModel';
import { colloApi } from './colloApi';
import { useProductQuery } from './useProductQuery';
import { Button } from '../components/ui/button';

export type CheckpointReference = { workspaceId: string; checkpointId: string };
export function CheckpointSource({
  projectId,
  source,
  compose = false,
  onRemove,
}: {
  projectId: string;
  source: CheckpointReference;
  compose?: boolean;
  onRemove?: () => void;
}) {
  const args = { projectId: projectId as Id<'projects'>, ...source };
  const receipt = useProductQuery(colloApi.collo.checkpointParts, args);
  const verify = useMutation(colloApi.colloCheckpoints.verify);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const first = receipt.data?.events[0];
  const ready = receipt.data?.complete === true && !receipt.error;
  const reason = receipt.error
    ? 'Verification is unavailable. Retry before sending.'
    : !receipt.data
      ? 'Checking shared integrity…'
      : receipt.data.integrity === 'missing'
        ? 'This checkpoint is no longer available.'
        : receipt.data.pathError
          ? 'File paths conflict. This checkpoint cannot be handed off.'
          : receipt.data.integrity === 'legacy-unverified'
            ? receipt.data.verificationAvailable
              ? 'This earlier checkpoint needs a server integrity check.'
              : 'This older record has no complete verifiable receipt. Attach a newer checkpoint.'
            : !ready
              ? 'Some checkpoint parts have not arrived. Wait for sharing to finish.'
              : 'Complete shared checkpoint. Full files remain on the source device.';
  return (
    <section className="collo-source-card" data-checkpoint-source data-ready={ready}>
      <span className="collo-eyebrow">CHECKPOINT SOURCE</span>
      <strong>{first?.kind === 'checkpoint' ? first.payload.label : 'Saved checkpoint'}</strong>
      {first && (
        <p>
          {first.actor.name} · {new Date(first.occurredAt).toLocaleString()}
        </p>
      )}
      <details className="collo-source-id">
        <summary>Source identifiers</summary>
        <p>
          Checkpoint {source.checkpointId}
          <br />
          Directory {source.workspaceId}
        </p>
      </details>
      <p>{reason}</p>
      {error && <p role="alert">{error}</p>}
      <div className="collo-inline-actions">
        {receipt.error && (
          <Button size="sm" variant="outline" onClick={receipt.retry}>
            Retry verification
          </Button>
        )}
        {receipt.data?.integrity === 'legacy-unverified' && receipt.data.verificationAvailable && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const result = await verify(args);
                if (!result.valid)
                  setError('Conflicting file paths: this checkpoint cannot be handed off.');
                else if (!result.ready)
                  setError('More parts remain. Continue verification to check the next batch.');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Verification failed.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Verifying…' : 'Verify checkpoint'}
          </Button>
        )}
        {compose && (
          <Button size="sm" disabled={!ready} title={!ready ? reason : undefined} asChild={ready}>
            {ready ? (
              <Link
                href={`/projects/${projectId}?${new URLSearchParams({ tab: 'handoffs', fromCheckpoint: source.checkpointId, checkpointWorkspace: source.workspaceId })}`}
              >
                Hand off checkpoint
              </Link>
            ) : (
              <span>Hand off checkpoint</span>
            )}
          </Button>
        )}
        {first && !compose && (
          <Link
            href={`/projects/${projectId}?tab=workspaces&event=${encodeURIComponent(first.id)}`}
          >
            Inspect changes →
          </Link>
        )}
        {onRemove && (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            Remove source
          </Button>
        )}
      </div>
    </section>
  );
}
