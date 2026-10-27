import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthToken } from '@convex-dev/auth/react';
import { FolderSimple, ArrowUpRight, ShieldCheck, Desktop } from '@phosphor-icons/react';
import { useAuthPrincipal, authPrincipal } from '../lib/authPrincipal';
import { Button } from '../components/ui/button';
import { Logo } from './ProductLogo';
import { AgentBadge } from './AgentBadge';
import { productBrand } from './productBrand';
import { isPaired, localRequest } from './local';
import type { LocalDirectory } from './workspaceTypes';

export function ProductAbout() {
  return (
    <div className="collo-settings-page">
      <div className="collo-about-brand">
        <Logo size="xl" />
        <span className="collo-version">Version {productBrand.version}</span>
      </div>
      <p className="collo-settings-lede">{productBrand.description}</p>
      <section className="collo-settings-section">
        <Desktop size={22} />
        <div>
          <h3>Your workspace, on this device</h3>
          <p>
            ColloSys connects your team's activity, conversations and tasks. Each person keeps their
            own working directory.
          </p>
        </div>
      </section>
      <section className="collo-settings-section">
        <ShieldCheck size={22} />
        <div>
          <h3>Local files. Shared context.</h3>
          <p>
            Full checkpoints stay on their source device. Activity and captured text sync to the
            collaboration backend. Restoring a checkpoint requires a preview and your confirmation.
          </p>
          <p>Remote backup is optional. Shared activity alone is not a full file backup.</p>
        </div>
      </section>
      <footer className="collo-about-credit">{productBrand.attribution}</footer>
    </div>
  );
}

export function ProductConnections() {
  const token = useAuthToken();
  const principal = useAuthPrincipal();
  const [state, setState] = useState<{
    epoch: number;
    rows: LocalDirectory[];
    error: string;
    loading: boolean;
  }>({ epoch: -1, rows: [], error: '', loading: true });
  const [refresh, setRefresh] = useState(0);
  const paired = isPaired();
  useEffect(() => {
    let alive = true;
    const epoch = principal.epoch;
    setState({ epoch, rows: [], error: '', loading: !!token && paired });
    if (token && paired)
      localRequest<{ connectors: LocalDirectory[] }>(token, '/api/connectors')
        .then((data) => {
          if (alive && epoch === authPrincipal.epoch())
            setState({ epoch, rows: data.connectors, error: '', loading: false });
        })
        .catch((error) => {
          if (alive && epoch === authPrincipal.epoch())
            setState({ epoch, rows: [], error: error.message, loading: false });
        });
    return () => {
      alive = false;
    };
  }, [token, principal.epoch, paired, refresh]);
  const current = state.epoch === principal.epoch;
  return (
    <div className="collo-settings-page">
      <section className="collo-connection-source">
        <AgentBadge agent="codex" />
        <span className="collo-tag">Local capture</span>
        <h3>Bring your Codex conversations into context</h3>
        <p>
          Connect an explicitly selected Codex log from a project's directory settings. New saved
          messages then appear alongside your team's work.
        </p>
        <p className="text-sm text-sol-text-muted">
          Manual file checkpoints work without an Agent. Other capture adapters are not available in
          this version.
        </p>
      </section>
      <div className="collo-section-title">
        <h3>Your connected directories</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={!paired}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Refresh
        </Button>
      </div>
      {!paired && (
        <p className="collo-inline-notice">
          Open ColloSys from the local desktop launcher to manage directories on this device.
        </p>
      )}
      {current && state.error && (
        <p role="alert" className="collo-inline-notice">
          {state.error}
        </p>
      )}
      {current && state.loading && <p role="status">Loading your connections…</p>}
      {current &&
        state.rows.map((row) => (
          <Link
            key={row.workspaceId}
            className="collo-directory-link"
            href={`/projects/${row.projectId}?tab=workspaces&workspaceView=history&directory=${encodeURIComponent(row.workspaceId)}`}
          >
            <FolderSimple size={22} />
            <span>
              <strong>{row.label}</strong>
              <small>{row.root}</small>
            </span>
            <span className="collo-tag">{row.running ? 'Connected' : 'Stopped'}</span>
            <ArrowUpRight size={16} />
          </Link>
        ))}
      {current && paired && !state.loading && !state.error && !state.rows.length && (
        <p className="collo-inline-notice">
          No directories connected yet. Open a project and choose Connect directory.
        </p>
      )}
      <Link href="/projects" className="collo-text-link">
        Open projects <ArrowUpRight size={15} />
      </Link>
    </div>
  );
}
