import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation } from './functions';
import { canAccessProject } from './lib/access';
import {
  assertProjectIdentity,
  readProjectIdentity,
  foundationProjectIdentity,
} from './colloContracts';
export const projectIdentityValidator = v.object({
  version: v.literal(1),
  icon: v.string(),
  tone: v.string(),
});
export function prepareProjectIdentity(
  value?: { version: 1; icon: string; tone: string },
  legacy?: { icon?: string; color?: string },
) {
  const identity = value ?? readProjectIdentity(legacy ?? {});
  assertProjectIdentity(identity);
  return { identity, identityRevision: 1, ...foundationProjectIdentity(identity) };
}
export const update = mutation({
  args: {
    projectId: v.id('projects'),
    identity: projectIdentityValidator,
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    assertProjectIdentity(args.identity);
    const userId = await getAuthUserId(ctx),
      project = await ctx.db.get(args.projectId);
    if (!userId || !project || !(await canAccessProject(ctx, userId, project)))
      throw new Error('Project is not accessible');
    if ((project.identityRevision ?? 0) !== args.expectedRevision)
      throw new Error(
        'The project identity changed in another window. Reload the latest choice before applying yours.',
      );
    const identityLegacy =
      project.identityLegacy ??
      (!project.identity
        ? {
            ...(project.icon ? { icon: project.icon } : {}),
            ...(project.color ? { color: project.color } : {}),
          }
        : undefined);
    await ctx.db.patch(project._id, {
      identity: args.identity,
      identityRevision: args.expectedRevision + 1,
      ...foundationProjectIdentity(args.identity),
      ...(identityLegacy ? { identityLegacy } : {}),
      updated_at: Date.now(),
    });
    return { identity: args.identity, revision: args.expectedRevision + 1 };
  },
});
export const upgrade = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx),
      project = await ctx.db.get(projectId);
    if (!userId || !project || !(await canAccessProject(ctx, userId, project)))
      throw new Error('Project is not accessible');
    if (project.identity)
      return {
        changed: false,
        identity: project.identity,
        revision: project.identityRevision ?? 1,
      };
    const identity = readProjectIdentity(project);
    await ctx.db.patch(project._id, {
      identity,
      identityRevision: 1,
      identityLegacy: {
        ...(project.icon ? { icon: project.icon } : {}),
        ...(project.color ? { color: project.color } : {}),
      },
    });
    return { changed: true, identity, revision: 1 };
  },
});
