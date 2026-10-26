// Owned integration into the original store. The pinned source remains unchanged.
export default [
  {
    file: 'packages/web/store/clientSyncRegistry.ts',
    before: 'export const CLIENT_SYNC_REGISTRY = {',
    after: `export const CLIENT_SYNC_REGISTRY = {
  // Connector evidence uses live query feeds, not the original sync log.
  colloEvents: {
    persistence: { kind: "collection", key: "colloEvents", perWindow: true },
    indexes: "_id, projectId, workspace, seq",
    hydration: { phase: "deferred" },
    sync: { isDelta: true, deepFields: ["payload", "actor"] },
    feeds: ["collo.feed", "collo.eventById", "collo.checkpointParts"],
    validRow: (row: any) => typeof row?.projectId === "string" && typeof row?.id === "string" && typeof row?.workspace === "string",
  },
  colloWorkspaces: {
    persistence: { kind: "collection", key: "colloWorkspaces", perWindow: true },
    indexes: "_id, projectId, workspace",
    hydration: { phase: "deferred" },
    sync: { isDelta: true },
    feeds: ["collo.workspaces"],
    validRow: (row: any) => typeof row?.projectId === "string" && typeof row?.workspaceId === "string" && typeof row?.workspace === "string",
  },`,
  },
  {
    file: 'packages/web/store/clientSyncRegistry.ts',
    before:
      'export const REPLICATION_CLASSIFICATION: Record<ClientSyncStoreKey, "shared" | "local"> = {',
    after:
      'export const REPLICATION_CLASSIFICATION: Record<ClientSyncStoreKey, "shared" | "local"> = {\n  colloEvents: "local",\n  colloWorkspaces: "local",',
  },
  {
    file: 'packages/web/store/idbCache.ts',
    before: 'export const CACHE_SCHEMA_VERSION = 68;',
    after: 'export const CACHE_SCHEMA_VERSION = 69;',
  },
  {
    file: 'packages/web/store/idbCache.ts',
    before: '|comments:_id|commits:_id|',
    after:
      '|colloEvents:_id, projectId, workspace, seq|colloWorkspaces:_id, projectId, workspace|comments:_id|commits:_id|',
  },
  {
    file: 'packages/web/store/inboxStore.ts',
    before: '    for (const coll of ["tasks", "docs", "plans", "projects"] as const) {',
    after:
      '    for (const coll of ["tasks", "docs", "plans", "projects", "colloEvents", "colloWorkspaces"] as const) {',
  },
];
