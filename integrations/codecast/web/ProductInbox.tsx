import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@codecast/convex/convex/_generated/api';
import { DashboardLayout } from '../components/DashboardLayout';
import { QueuePageClient } from '../app/inbox/QueuePageClient';
import { Button } from '../components/ui/button';
import { useWorkspaceArgs, workspaceStamp } from '../hooks/useWorkspaceArgs';
import { useQueryNoThrow } from '../hooks/useQueryNoThrow';
import { CapturedSessions } from './CapturedSessions';
export function ProductInbox() {
  const search = useSearchParams(),
    router = useRouter();
  const args = useWorkspaceArgs();
  const projects = useQueryNoThrow(
    api.projects.webList,
    args === 'skip' ? 'skip' : workspaceStamp(args),
  );
  // Existing session deep links keep the full native inbox's reading lifecycle.
  if (search.get('view') === 'native' || search.has('s')) return <QueuePageClient />;
  const rows = Array.isArray(projects.data) ? projects.data : [];
  const selected = rows.find((p: { _id: string }) => p._id === search.get('project')) ?? rows[0];
  return (
    <DashboardLayout>
      <div className="flex h-full min-h-0 flex-col" data-testid="product-sessions-home">
        <div className="collo-sessions-scope">
          <label>
            Project{' '}
            <select
              aria-label="Sessions project"
              value={selected?._id ?? ''}
              onChange={(e) => router.push(`/inbox?project=${e.target.value}`)}
            >
              {rows.map((p: { _id: string; title: string }) => (
                <option key={p._id} value={p._id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" size="sm" onClick={() => router.push('/inbox?view=native')}>
            Native session inbox
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          {projects.error ? (
            <div className="collo-empty" role="alert">
              <p>Projects could not be loaded.</p>
              <Button variant="outline" onClick={projects.retry}>
                Retry
              </Button>
            </div>
          ) : selected ? (
            <CapturedSessions projectId={selected._id} />
          ) : (
            <div className="collo-empty">
              <h2>{projects.data ? 'Start with a project' : 'Loading projects…'}</h2>
              <p>Your captured conversations are organized by project.</p>
              <Button variant="outline" onClick={() => router.push('/projects')}>
                Open projects
              </Button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
