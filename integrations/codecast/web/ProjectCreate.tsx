import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { useInboxStore } from '../store/inboxStore';
import { useWorkspaceArgs, workspaceStamp } from '../hooks/useWorkspaceArgs';
export function ProjectCreate() {
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const workspace = useWorkspaceArgs(),
    router = useRouter();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={workspace === 'skip'}>
        <Plus size={16} />
        New project
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
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
                const project = await useInboxStore
                  .getState()
                  .createProject({ title, ...workspaceStamp(workspace) });
                setOpen(false);
                setTitle('');
                router.push(`/projects/${project.short_id || project._id}?tab=workspaces`);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Project could not be created.');
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
            {error && <p role="alert">{error}</p>}
            <div className="collo-handoff-actions">
              <Button disabled={busy} type="submit">
                {busy ? 'Creating…' : 'Create project'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
