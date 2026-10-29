import { useInboxStore } from '../store/inboxStore';
import { assertProjectIdentity, type CreateProductProject } from './productContracts';
/** Keep the existing durable dispatch, acknowledgement and change-feed path. */
export async function createProductProject(request: CreateProductProject) {
  assertProjectIdentity(request.identity);
  const title = request.title.trim();
  if (!title || title.length > 160) throw new Error('Enter a project name of up to 160 characters');
  return useInboxStore
    .getState()
    .createProject({
      title,
      identity: request.identity,
      workspace: request.scope.kind,
      ...(request.scope.kind === 'team' ? { team_id: request.scope.teamId } : {}),
    });
}
