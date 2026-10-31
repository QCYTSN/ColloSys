import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// Extension tables inherit access from the actual Codecast project, never
// from a caller-supplied member or the project's routing team_id.
export const colloTables = {
  collo_reauth_proofs: defineTable({
    userId: v.id('users'),
    sessionId: v.id('authSessions'),
    accountId: v.id('authAccounts'),
    generation: v.string(),
    verifiedAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_verified', ['verifiedAt']),
  collo_account_labels: defineTable({ accountId: v.id('authAccounts'), label: v.string() }).index(
    'by_account',
    ['accountId'],
  ),
  collo_account_links: defineTable({
    attemptId: v.string(),
    userId: v.id('users'),
    sessionId: v.id('authSessions'),
    generation: v.string(),
    challengeHash: v.string(),
    provider: v.union(v.literal('github'), v.literal('google')),
    purpose: v.union(v.literal('link'), v.literal('reauthenticate')),
    createdAt: v.number(),
    expiresAt: v.number(),
    reauthenticatedAt: v.optional(v.number()),
    status: v.union(
      v.literal('pending'),
      v.literal('awaiting-provider'),
      v.literal('verified'),
      v.literal('failed'),
      v.literal('cancelled'),
      v.literal('completed'),
    ),
    verifierId: v.optional(v.id('authVerifiers')),
    callbackSignature: v.optional(v.string()),
    candidateSubject: v.optional(v.string()),
    candidateLabel: v.optional(v.string()),
    failure: v.optional(v.string()),
  })
    .index('by_attempt', ['attemptId'])
    .index('by_verifier', ['verifierId'])
    .index('by_signature', ['callbackSignature'])
    .index('by_expiry', ['expiresAt']),
  collo_identity_proofs: defineTable({
    userId: v.id('users'),
    provider: v.union(v.literal('github'), v.literal('google')),
    verifiedAt: v.number(),
  }).index('by_identity', ['userId', 'provider']),
  collo_auth_attempts: defineTable({
    version: v.literal(1),
    attemptId: v.string(),
    claimHash: v.string(),
    provider: v.union(v.literal('github'), v.literal('google')),
    createdAt: v.number(),
    expiresAt: v.number(),
    status: v.union(
      v.literal('pending'),
      v.literal('authorized'),
      v.literal('cancelled'),
      v.literal('consumed'),
    ),
    userId: v.optional(v.id('users')),
    sessionId: v.optional(v.id('authSessions')),
  })
    .index('by_attempt', ['attemptId'])
    .index('by_expiry', ['expiresAt']),
  collo_event_aliases: defineTable({
    projectId: v.id('projects'),
    eventId: v.string(),
    userId: v.id('users'),
    workspaceId: v.string(),
    fingerprint: v.string(),
    canonicalEventId: v.string(),
    seq: v.number(),
  }).index('by_event', ['projectId', 'eventId']),
  collo_sessions: defineTable({
    projectId: v.id('projects'),
    workspaceId: v.string(),
    sessionId: v.string(),
    userId: v.id('users'),
    firstSeq: v.number(),
    lastSeq: v.number(),
    messageCount: v.number(),
    updatedAt: v.number(),
  })
    .index('by_session', ['projectId', 'workspaceId', 'sessionId'])
    .index('by_project', ['projectId', 'updatedAt']),
  collo_handoffs: defineTable({
    projectId: v.id('projects'),
    requestId: v.string(),
    request: v.string(),
    sender: v.id('users'),
    recipient: v.id('users'),
    title: v.string(),
    context: v.string(),
    nextSteps: v.string(),
    source: v.optional(
      v.object({ workspaceId: v.string(), sessionId: v.string(), throughSeq: v.number() }),
    ),
    checkpoint: v.optional(v.object({ workspaceId: v.string(), checkpointId: v.string() })),
    taskId: v.optional(v.id('tasks')),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('declined'),
      v.literal('cancelled'),
    ),
    revision: v.number(),
    updatedAt: v.number(),
  })
    .index('by_request', ['projectId', 'sender', 'requestId'])
    .index('by_project', ['projectId', 'updatedAt'])
    .index('by_project_status', ['projectId', 'status', 'updatedAt']),
  collo_checkpoint_paths: defineTable({
    projectId: v.id('projects'),
    workspaceId: v.string(),
    checkpointId: v.string(),
    path: v.string(),
  }).index('by_path', ['projectId', 'workspaceId', 'checkpointId', 'path']),
  collo_backups: defineTable({
    backupId: v.string(),
    projectId: v.id('projects'),
    workspaceId: v.string(),
    userId: v.id('users'),
    checkpointId: v.string(),
    size: v.number(),
    digest: v.string(),
    status: v.union(v.literal('pending'), v.literal('complete')),
    expiresAt: v.number(),
    storageIds: v.optional(v.array(v.id('_storage'))),
  })
    .index('by_backup', ['projectId', 'backupId'])
    .index('by_project', ['projectId']),
  collo_backup_chunks: defineTable({ backupId: v.id('collo_backups'), storageId: v.id('_storage') })
    .index('by_storage', ['storageId'])
    .index('by_backup', ['backupId']),
  collo_backup_policies: defineTable({
    projectId: v.id('projects'),
    maxBytes: v.number(),
    maxCount: v.number(),
  }).index('by_project', ['projectId']),
  collo_workspaces: defineTable({
    directoryVersion: v.optional(v.literal(1)),
    directoryId: v.optional(v.string()),
    workspaceId: v.string(),
    projectId: v.id('projects'),
    userId: v.id('users'),
    label: v.string(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_project', ['projectId']),
  collo_devices: defineTable({
    hash: v.string(),
    workspaceId: v.string(),
    projectId: v.id('projects'),
    userId: v.id('users'),
    expiresAt: v.number(),
    revoked: v.boolean(),
  })
    .index('by_hash', ['hash'])
    .index('by_workspace', ['workspaceId']),
  collo_heads: defineTable({
    projectId: v.id('projects'),
    seq: v.number(),
    sessionCursor: v.optional(v.number()),
  }).index('by_project', ['projectId']),
  // Small receipt summary; large patch bodies remain in independently paged events.
  collo_checkpoints: defineTable({
    projectId: v.id('projects'),
    workspaceId: v.string(),
    checkpointId: v.string(),
    parentId: v.union(v.string(), v.null()),
    label: v.string(),
    occurredAt: v.number(),
    totalParts: v.number(),
    totalFiles: v.number(),
    receivedParts: v.number(),
    receivedFiles: v.number(),
    verifiedFromStart: v.boolean(),
    pathsVerified: v.optional(v.boolean()),
    pathsCursor: v.optional(v.number()),
    pathError: v.optional(v.boolean()),
  }).index('by_checkpoint', ['projectId', 'workspaceId', 'checkpointId']),
  collo_events: defineTable({
    projectId: v.id('projects'),
    eventId: v.string(),
    workspaceId: v.string(),
    userId: v.id('users'),
    seq: v.number(),
    receivedAt: v.number(),
    fingerprint: v.string(),
    sessionIndexed: v.optional(v.boolean()),
    event: v.any(),
  })
    .index('by_event', ['projectId', 'eventId'])
    .index('by_project_seq', ['projectId', 'seq'])
    .index('by_session', [
      'projectId',
      'workspaceId',
      'event.kind',
      'event.payload.sessionId',
      'seq',
    ])
    .index('by_session_message', [
      'projectId',
      'workspaceId',
      'event.kind',
      'event.payload.sessionId',
      'event.payload.messageId',
    ])
    // Index the original payload so old events remain addressable without rewriting history.
    .index('by_checkpoint_part', [
      'projectId',
      'workspaceId',
      'event.kind',
      'event.payload.checkpointId',
      'event.payload.part',
    ]),
};
