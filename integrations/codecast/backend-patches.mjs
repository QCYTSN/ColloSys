// Owned ColloSys changes to pinned Codecast, applied only to the generated fork.
// Real baseline evidence: .local/codecast-app/backend-audit-1792832626965/result.json.
export const backendPatches = [
  {
    file: 'packages/convex/convex/crons.ts',
    before: 'export default crons;',
    after: 'import { collaborationCrons } from "./colloCrons";\nexport default collaborationCrons;',
  },
  {
    file: 'packages/convex/convex/replaysHttp.ts',
    before: '  const userId = apiToken ? undefined : await getAuthUserId(ctx).catch(() => null);',
    after:
      '  const userId = apiToken ? undefined : await getAuthUserId(ctx).catch(() => null);\n  if (!apiToken && userId) {\n    try { await ctx.runQuery((internal as any).collo.me, {}); }\n    catch { return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store", ...CHUNK_CORS } }); }\n  }',
  },
  {
    file: 'packages/convex/convex/functions.ts',
    before: '  mutation as rawMutation,\n  internalMutation as rawInternalMutation,',
    after:
      '  mutation as rawMutation,\n  internalMutation as rawInternalMutation,\n  query as rawQuery,\n  action as rawAction,',
  },
  {
    file: 'packages/convex/convex/functions.ts',
    before: 'import { makeChangeTrackedDb } from "./changeLog";',
    after:
      'import { withActiveSession, withActiveActionSession, withTeamLimit } from "./colloGuards";\nimport { makeChangeTrackedDb } from "./changeLog";',
  },
  {
    file: 'packages/convex/convex/functions.ts',
    before: 'const tracked = makePrincipalViewTrackedDb(makeChangeTrackedDb(ctx.db, collector));',
    after:
      'const tracked = makePrincipalViewTrackedDb(makeChangeTrackedDb(withTeamLimit(ctx.db), collector));',
  },
  {
    file: 'packages/convex/convex/functions.ts',
    before: 'rawMutation(wrapDefinition(def))',
    after: 'rawMutation(wrapDefinition(withActiveSession(def)))',
  },
  {
    file: 'packages/convex/convex/functions.ts',
    before: 'export { query, internalQuery, action, internalAction } from "./_generated/server";',
    after:
      'export const query = ((def: any) => rawQuery(withActiveSession(def))) as typeof rawQuery;\nexport const action = ((def: any) => rawAction(withActiveActionSession(def))) as typeof rawAction;\nexport { internalQuery, internalAction } from "./_generated/server";',
  },
  ...[
    [
      'artifacts.ts',
      'import { query, mutation, internalQuery, internalMutation } from "./_generated/server";',
    ],
    ['artifactsHttp.ts', 'import { httpAction, action } from "./_generated/server";'],
    [
      'buckets.ts',
      'import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";',
    ],
    ['callChat.ts', 'import { internalMutation, mutation, query } from "./_generated/server";'],
    [
      'calls.ts',
      'import {\n  action,\n  internalMutation,\n  internalQuery,\n  mutation,\n  query,\n} from "./_generated/server";',
    ],
    ['githubApi.ts', 'import { action, internalAction } from "./_generated/server";'],
    ['linkPreviews.ts', 'import { query, internalAction } from "./_generated/server";'],
    ['localFirstCommands.ts', 'import { query } from "./_generated/server";'],
    [
      'oauthConnectors.ts',
      'import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";',
    ],
    [
      'storyMode.ts',
      'import { query, action, internalQuery, internalMutation, internalAction } from "./_generated/server";',
    ],
    ['syncLog.ts', 'import { query } from "./_generated/server";'],
    ['taskEvidence.ts', 'import { query } from "./_generated/server";'],
  ].map(([file, before]) => ({
    file: 'packages/convex/convex/' + file,
    before,
    after: before.replace('"./_generated/server"', '"./colloGuards"'),
  })),
];
