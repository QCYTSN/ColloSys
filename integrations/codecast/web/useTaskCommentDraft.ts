import { useCallback, useEffect } from 'react';
import { api } from '@codecast/convex/convex/_generated/api';
import { useInboxStore } from '../store/inboxStore';
import { useProductQuery } from './useProductQuery';
import { useAuthPrincipal } from '../lib/authPrincipal';
import { viewKey, writeView } from './productViewState';

// Unsaved text is a scoped, in-memory view hint. A live task query, rather
// than a cached task row, decides whether it may be shown or edited.
export function useTaskCommentDraft(shortId: string | undefined) {
  const principal = useAuthPrincipal();
  const task = useProductQuery(api.tasks.webGet, shortId ? { short_id: shortId } : 'skip');
  const cachedProject = useInboxStore(s => Object.values(s.tasks).find(t => t.short_id === shortId)?.project_id);
  const project = task.data?.project_id ?? cachedProject ?? `task:${shortId}`;
  const key = viewKey(project, `comment-draft:${shortId}`);
  const text = useInboxStore(s => s.colloViewState[key] as string | undefined) ?? '';
  const allowed = !!principal.principalId && !!task.data && !task.denied;
  useEffect(() => {
    if (task.denied || task.data === null) {
      useInboxStore.setState(s => {
        const next = { ...s.colloViewState };
        delete next[key];
        return { colloViewState: next };
      });
    }
  }, [key, task.denied, task.data]);
  const setText = useCallback((value: string) => {
    if (allowed) writeView(key, value);
  }, [allowed, key]);
  return { text: allowed ? text : '', setText, allowed };
}
