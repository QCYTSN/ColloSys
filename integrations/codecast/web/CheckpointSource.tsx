import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import Link from 'next/link';
import type { Id } from '@codecast/convex/convex/_generated/dataModel';
import { colloApi } from './colloApi';
import { useProductQuery } from './useProductQuery';
import { Button } from '../components/ui/button';
import { useAuthPrincipal } from '../lib/authPrincipal';

export type CheckpointReference = { workspaceId: string; checkpointId: string };
type SourceProps = {
  projectId: string;
  source: CheckpointReference;
  compose?: boolean;
  onRemove?: () => void;
  receipt?: ReturnType<typeof useProductQuery<typeof colloApi.collo.checkpointParts>>;
};
export function CheckpointSource(props: SourceProps) {
  const principal = useAuthPrincipal();
  return (
    <Source
      key={`${principal.epoch}:${props.projectId}:${props.source.workspaceId}:${props.source.checkpointId}`}
      {...props}
    />
  );
}
function Source({
  projectId,
  source,
  compose = false,
  onRemove,
  receipt: suppliedReceipt,
}: SourceProps) {
  const args = { projectId: projectId as Id<'projects'>, ...source };
  // The composer also gates Send on this receipt. Share that subscription so
  // Retry really drops the failed query instead of another subscriber keeping it alive.
  const ownReceipt = useProductQuery(
    colloApi.collo.checkpointParts,
    suppliedReceipt ? 'skip' : args,
  );
  const receipt = suppliedReceipt ?? ownReceipt;
  const verify = useMutation(colloApi.colloCheckpoints.verify);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef(true),
    inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
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
          <Button type="button" size="sm" variant="outline" onClick={receipt.retry}>
            Retry verification
          </Button>
        )}
        {receipt.data?.integrity === 'legacy-unverified' && receipt.data.verificationAvailable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              if (inFlight.current) return;
              inFlight.current = true;
              setBusy(true);
              setError('');
              try {
                const result = await verify(args);
                if (!active.current) return;
                if (!result.valid)
                  setError('Conflicting file paths: this checkpoint cannot be handed off.');
                else if (!result.ready)
                  setError('More parts remain. Continue verification to check the next batch.');
              } catch (e) {
                if (active.current)
                  setError(e instanceof Error ? e.message : 'Verification failed.');
              } finally {
                inFlight.current = false;
                if (active.current) setBusy(false);
              }
            }}
          >
            {busy ? 'Verifying…' : 'Verify checkpoint'}
          </Button>
        )}
        {compose && (
          <Button
            type={ready ? undefined : 'button'}
            size="sm"
            disabled={!ready}
            title={!ready ? reason : undefined}
            asChild={ready}
          >
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
