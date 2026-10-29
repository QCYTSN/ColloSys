import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useMutation, useConvex } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import {
  FolderSimple,
  Code,
  Leaf,
  Planet,
  Flask,
  Rocket,
  Books,
  Compass,
  Lightning,
  ChartBar,
  Shield,
  Heart,
  PenNib,
  PuzzlePiece,
  Cube,
  Flag,
  Check,
  PaintBrush,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  defaultProjectIdentity,
  projectIconIds,
  readProjectIdentity,
  type ProjectIdentity,
} from './productContracts';
import { useInboxStore, type ProjectItem } from '../store/inboxStore';
import type { Id } from '@codecast/convex/convex/_generated/dataModel';
import { authPrincipal } from '../lib/authPrincipal';

const icons = {
  folder: FolderSimple,
  code: Code,
  leaf: Leaf,
  planet: Planet,
  flask: Flask,
  rocket: Rocket,
  books: Books,
  compass: Compass,
  lightning: Lightning,
  chart: ChartBar,
  shield: Shield,
  heart: Heart,
  pen: PenNib,
  puzzle: PuzzlePiece,
  cube: Cube,
  flag: Flag,
};
/** Foundation lines/breadcrumbs resolve the same stored product identity. */
export function ProductProjectGlyph({
  projectId,
  project,
  ghost,
}: {
  projectId?: string;
  project?: {
    id?: string;
    title?: string;
    color?: string;
    icon?: string;
    identity?: ProjectIdentity;
  };
  ghost?: boolean;
}) {
  const id = projectId ?? project?.id;
  const stored = useInboxStore((state) => (id ? state.projects[id] : undefined));
  return (
    <ProjectIdentityMark
      identity={ghost ? defaultProjectIdentity : readProjectIdentity(stored ?? project ?? {})}
      size={16}
    />
  );
}
const tones: [ProjectIdentity['tone'], string, string, string][] = [
  ['iris', 'Iris', '#7568b6', '#b2a8ee'],
  ['clay', 'Clay', '#a86944', '#dfae8e'],
  ['moss', 'Moss', '#36775e', '#92c7ae'],
  ['lake', 'Lake', '#496caf', '#a3b9ed'],
  ['rose', 'Rose', '#a45675', '#e3a0ba'],
  ['slate', 'Slate', '#697180', '#b5becd'],
];
export function ProjectIdentityMark({
  identity,
  size = 22,
}: {
  identity: ProjectIdentity;
  size?: number;
}) {
  const Icon = icons[identity.icon] ?? FolderSimple,
    tone = tones.find((t) => t[0] === identity.tone) ?? tones[0];
  return (
    <span
      className="collo-project-mark"
      data-icon={identity.icon}
      data-tone={identity.tone}
      style={{ '--project-light': tone[2], '--project-dark': tone[3] } as CSSProperties}
    >
      <Icon size={size} weight="duotone" />
    </span>
  );
}
export function ProjectIdentityFields({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: ProjectIdentity;
  onChange: (identity: ProjectIdentity) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const available = projectIconIds.filter((id) => id.includes(search.trim().toLowerCase()));
  const arrow = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? available.length - 1
          : (index + delta + available.length) % available.length;
    onChange({ ...value, icon: available[next] });
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div className="collo-project-identity-fields">
      <div className="collo-project-identity-preview">
        <ProjectIdentityMark identity={value} size={28} />
        <div>
          <strong>{name.trim() || 'Your project'}</strong>
          <span>Project identity</span>
        </div>
      </div>
      <label className="collo-identity-search">
        <MagnifyingGlass size={15} />
        <input
          aria-label="Find a project icon"
          placeholder="Find an icon…"
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="collo-identity-icons" role="radiogroup" aria-label="Project icon">
        {available.map((id, index) => {
          const Icon = icons[id];
          return (
            <button
              type="button"
              key={id}
              role="radio"
              aria-checked={value.icon === id}
              aria-label={id.charAt(0).toUpperCase() + id.slice(1)}
              disabled={disabled}
              tabIndex={
                value.icon === id || (!available.includes(value.icon) && index === 0) ? 0 : -1
              }
              onKeyDown={(e) => arrow(e, index)}
              onClick={() => onChange({ ...value, icon: id })}
            >
              <Icon size={21} weight={value.icon === id ? 'duotone' : 'regular'} />
              {value.icon === id && (
                <Check size={10} className="collo-identity-tick" weight="bold" />
              )}
            </button>
          );
        })}
      </div>
      {!available.length && (
        <p className="collo-identity-empty">No matching icons. Try a different name.</p>
      )}
      <div className="collo-identity-tone-label">Project color</div>
      <div className="collo-identity-tones" role="group" aria-label="Project color">
        {tones.map(([id, title, light, dark]) => (
          <button
            type="button"
            key={id}
            disabled={disabled}
            aria-pressed={value.tone === id}
            onClick={() => onChange({ ...value, tone: id })}
          >
            <i style={{ '--project-light': light, '--project-dark': dark } as CSSProperties}>
              {value.tone === id && <Check size={12} weight="bold" />}
            </i>
            {title}
          </button>
        ))}
      </div>
    </div>
  );
}
const update = makeFunctionReference<
  'mutation',
  { projectId: Id<'projects'>; identity: ProjectIdentity; expectedRevision: number },
  { identity: ProjectIdentity; revision: number }
>('colloProjectIdentity:update');
const latestProject = makeFunctionReference<'query', { reference: string }, ProjectItem | null>(
  'collo:projectByRef',
);
export function ProjectIdentityEditor({
  project,
  trigger,
}: {
  project: Pick<ProjectItem, '_id' | 'title' | 'icon' | 'color' | 'identity' | 'identityRevision'>;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(() => readProjectIdentity(project)),
    [revision, setRevision] = useState(project.identityRevision ?? 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const save = useMutation(update),
    client = useConvex();
  const start = () => {
    setDraft(readProjectIdentity(project));
    setRevision(project.identityRevision ?? 0);
    setError('');
    setOpen(true);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="collo-icon-button collo-project-identity-edit"
          aria-label={`Edit identity of ${project.title}`}
          onClick={start}
        >
          {trigger ?? <PaintBrush size={17} />}
        </button>
      </DialogTrigger>
      <DialogContent className="collo-project-identity-dialog">
        <DialogHeader>
          <DialogTitle>Project identity</DialogTitle>
          <DialogDescription>
            One recognizable mark wherever this project appears.
          </DialogDescription>
        </DialogHeader>
        <ProjectIdentityFields
          name={project.title}
          value={draft}
          onChange={setDraft}
          disabled={busy}
        />
        {error && (
          <div role="alert" className="collo-inline-notice">
            <p>{error}</p>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const epoch = authPrincipal.epoch();
                setBusy(true);
                try {
                  // The sync-log update can arrive after the conflict response.
                  // An explicit reload must fetch authority, not reuse props.
                  const latest = await client.query(latestProject, { reference: project._id });
                  if (epoch !== authPrincipal.epoch()) return;
                  if (!latest) throw new Error('Project is not accessible');
                  setDraft(readProjectIdentity(latest));
                  setRevision(latest.identityRevision ?? 0);
                  setError('');
                } catch {
                  if (epoch === authPrincipal.epoch())
                    setError(
                      'Could not load the latest identity. Your choices are kept. Check your connection and access, then try again.',
                    );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reload latest identity
            </button>
          </div>
        )}
        <div className="collo-identity-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setDraft(defaultProjectIdentity)}
          >
            Reset choice
          </Button>
          <span />
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await save({
                  projectId: project._id as Id<'projects'>,
                  identity: draft,
                  expectedRevision: revision,
                });
                setOpen(false);
              } catch (e) {
                setError(
                  e instanceof Error && e.message.includes('identity changed')
                    ? 'Someone changed this project in another window. Your choices are kept. Reload the latest identity before applying again.'
                    : e instanceof Error && e.message.includes('not accessible')
                      ? 'You no longer have access to edit this project. Your choices are kept.'
                      : 'Identity could not be saved. Your choices are kept. Check your connection and try again.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Applying…' : 'Apply identity'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
