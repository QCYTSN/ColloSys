import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { useWorkspaceArgs } from '../hooks/useWorkspaceArgs';
import { createProductProject } from './productProjectService';
import { defaultProjectIdentity } from './productContracts';
import { ProjectIdentityFields } from './ProjectIdentity';
export function ProjectCreate() {
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState(defaultProjectIdentity);
  const workspace = useWorkspaceArgs(),
    router = useRouter();
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={workspace === 'skip'}>
          <Plus size={16} />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Create a project in your current workspace.</DialogDescription>
        </DialogHeader>
        <form
          className="collo-handoff-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              if (workspace === 'skip')
                throw new Error('Wait for your workspace to finish loading.');
              const project = await createProductProject({
                title,
                identity,
                scope:
                  workspace.workspace === 'team'
                    ? { kind: 'team', teamId: String(workspace.team_id) }
                    : { kind: 'personal' },
              });
              setOpen(false);
              setTitle('');
              setIdentity(defaultProjectIdentity);
              router.push(`/projects/${project.short_id || project._id}?tab=workspaces`);
            } catch (e) {
              setError(
                e instanceof Error &&
                  /^(Enter a project name|Wait for your workspace|Choose a supported project)/.test(
                    e.message,
                  )
                  ? e.message
                  : 'Project could not be created. Your name, icon and color are kept. Check your connection and access, then try again.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Project name
            <input
              autoFocus
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A shared place for your work"
            />
          </label>
          <ProjectIdentityFields
            name={title}
            value={identity}
            onChange={setIdentity}
            disabled={busy}
          />
          {error && <p role="alert">{error}</p>}
          <div className="collo-handoff-actions">
            <Button disabled={busy} type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? 'Creating…' : 'Create project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
