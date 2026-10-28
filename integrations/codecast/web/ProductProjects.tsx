import { useState } from 'react';
import Link from 'next/link';
import {
  FolderSimple,
  ArrowUpRight,
  MagnifyingGlass,
  ArrowRight,
  Pulse,
} from '@phosphor-icons/react';
import { useInboxStore, type ProjectItem } from '../store/inboxStore';
import { useSyncProjects } from '../hooks/useSyncProjects';
import { useWorkspaceCollection } from '../hooks/useWorkspaceCollection';
import { useProductQuery as useQueryNoThrow } from './useProductQuery';
import { colloApi } from './colloApi';
import type { Id } from '@codecast/convex/convex/_generated/dataModel';
import { ProjectCreate } from './ProjectCreate';
import { MemberFace } from './MemberFace';
import { Button } from '../components/ui/button';

const signature = (p: ProjectItem) => `${p.title}|${p.status}|${p.updated_at}|${p.description}`;
export function ProductProjects() {
  useSyncProjects();
  const projects = useWorkspaceCollection<ProjectItem>('projects', signature);
  const loading = useInboxStore((s) => s.liveLoading.projects || !s.clientStateInitialized);
  const [filter, setFilter] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const rows = projects.filter((p) =>
    `${p.title} ${p.description ?? ''}`.toLowerCase().includes(filter.toLowerCase()),
  );
  // A preview belongs to the visible result set, including its empty state.
  const selected = rows.find((p) => p._id === focused) ?? rows[0];
  return (
    <div className="collo-projects">
      <header className="collo-page-heading">
        <div>
          <h1>Projects</h1>
          <p>A shared place for the work in progress.</p>
        </div>
        <ProjectCreate />
      </header>
      <div className="collo-projects-grid">
        <section className="collo-project-index" aria-label="Projects">
          <div className="collo-index-tools">
            <span>{projects.length} projects</span>
            <label className="collo-search">
              <MagnifyingGlass size={16} />
              <input
                aria-label="Find a project"
                placeholder="Find a project…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
          </div>
          {loading && !projects.length ? (
            <div className="collo-skeleton-list" role="status" aria-label="Loading projects">
              <i />
              <i />
              <i />
            </div>
          ) : (
            rows.map((p) => (
              <div
                key={p._id}
                className="collo-project-row"
                data-selected={selected?._id === p._id}
              >
                <button
                  className="collo-project-select"
                  onClick={() => setFocused(p._id)}
                  aria-pressed={selected?._id === p._id}
                  aria-label={`Preview ${p.title}`}
                >
                  <FolderSimple size={21} weight="duotone" />
                  <span>
                    <strong title={p.title}>{p.title}</strong>
                    <small>
                      {p.description || 'Project activity, conversations and shared work'}
                    </small>
                  </span>
                </button>
                <span className="collo-project-status">{p.status || 'Active'}</span>
                <Link
                  className="collo-icon-button"
                  aria-label={`Open ${p.title}`}
                  href={`/projects/${p.short_id || p._id}?tab=workspaces`}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </div>
            ))
          )}
          {!loading && !rows.length && (
            <div className="collo-empty">
              <FolderSimple size={32} />
              <h3>{filter ? 'No matching projects' : 'Start your first project'}</h3>
              <p>
                {filter
                  ? 'Try another name.'
                  : 'Connect your directory, share progress and keep the team in context.'}
              </p>
            </div>
          )}
        </section>
        {selected && <ProjectOverview key={selected._id} project={selected} />}
      </div>
    </div>
  );
}

function ProjectOverview({ project }: { project: ProjectItem }) {
  const id = project._id as Id<'projects'>;
  const members = useQueryNoThrow(colloApi.collo.projectMembers, { projectId: id });
  const feed = useQueryNoThrow(colloApi.collo.feed, {
    projectId: id,
    paginationOpts: { numItems: 4, cursor: null },
  });
  const workspaces = useQueryNoThrow(colloApi.collo.workspaces, { projectId: id });
  const handoffs = useQueryNoThrow(colloApi.colloHandoffs.list, {
    projectId: id,
    paginationOpts: { numItems: 10, cursor: null },
  });
  const href = `/projects/${project.short_id || project._id}`;
  if (members.error || feed.error || workspaces.error)
    return (
      <aside className="collo-project-overview">
        <h2>Project overview</h2>
        <p role="alert">This project could not be loaded.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            members.retry();
            feed.retry();
            workspaces.retry();
          }}
        >
          Retry
        </Button>
      </aside>
    );
  return (
    <aside className="collo-project-overview">
      <h2>{project.title}</h2>
      <div className="collo-project-people">
        {members.data?.members.map((m) => (
          <MemberFace key={m.id} name={m.name} id={m.id} />
        ))}
        <span>{members.data ? `${members.data.members.length} members` : 'Loading members…'}</span>
      </div>
      <div className="collo-overview-section">
        <h3>
          <Pulse size={16} /> Recent activity
        </h3>
        {!feed.data ? (
          <div className="collo-skeleton-list" role="status" aria-label="Loading activity">
            <i />
            <i />
          </div>
        ) : feed.data.page.length === 0 ? (
          <p>No shared activity yet.</p>
        ) : (
          feed.data.page.map((row) => (
            <Link
              key={row.id}
              href={`${href}?tab=workspaces&event=${encodeURIComponent(row.id)}`}
              className="collo-recent-row"
            >
              <span>
                {row.kind === 'checkpoint' ? row.payload.label : row.payload.text.slice(0, 140)}
              </span>
              <small>
                {new Date(row.occurredAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </small>
            </Link>
          ))
        )}
      </div>
      <div className="collo-overview-section">
        <h3>Connected directories</h3>
        {workspaces.data ? (
          <p>
            {workspaces.data.length
              ? workspaces.data.map((w) => w.label).join(' · ')
              : 'No directories connected yet.'}
          </p>
        ) : (
          <p>Loading directories…</p>
        )}
      </div>
      {!handoffs.error && handoffs.data?.page.some((h) => h.status === 'pending') && (
        <div className="collo-overview-section">
          <h3>Awaiting response</h3>
          {handoffs.data.page
            .filter((h) => h.status === 'pending')
            .map((h) => (
              <Link
                className="collo-recent-row"
                key={h._id}
                href={`${href}?tab=handoffs&handoff=${h._id}`}
              >
                {h.title}
              </Link>
            ))}
        </div>
      )}
      <Link className="collo-open-project" href={`${href}?tab=workspaces`}>
        Open project <ArrowRight size={17} />
      </Link>
    </aside>
  );
}
