// TEST DATA ONLY. Uses distinct local accounts; never starts/stops services or launches an agent.
// node tests/codecast-native-backend.mjs --source-only checks owned patch anchors and policy units.
// Default also exercises the already prepared local Convex deployment. Launch rejection tests
// require --check-launch-rejections and a caller-confirmed deployment of these patches.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { nativeBackendPatches } from '../integrations/codecast/native-backend-patches.mjs';
import { ConvexHttpClient } from '../third_party/codecast/upstream/packages/convex/node_modules/convex/dist/esm/browser/index.js';

const root = path.resolve(import.meta.dirname, '..');
const upstream = path.join(root, 'third_party/codecast/upstream');
const checks = [];
const mark = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};
const transformed = new Map();
for (const patch of nativeBackendPatches) {
  const before =
    transformed.get(patch.file) ??
    (await fs.readFile(path.join(upstream, patch.file), 'utf8')).replaceAll('\r\n', '\n');
  assert.equal(before.split(patch.before).length, 2, `Unique patch anchor: ${patch.file}`);
  transformed.set(patch.file, before.replace(patch.before, patch.after));
}
const helper = await fs.readFile(
  path.join(root, 'integrations/codecast/convex/colloNativeAccess.ts'),
  'utf8',
);
for (const [file, source] of [...transformed, ['colloNativeAccess.ts', helper]]) {
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ES2022 },
    fileName: file,
    reportDiagnostics: true,
  });
  assert.equal(
    result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length,
    0,
    file,
  );
}
mark('owned patches match pinned source and parse as TypeScript (not a full typecheck)');

function loadFunction(source, name, dependencies = {}) {
  const ast = ts.createSourceFile('policy.ts', source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(node, name);
  const javascript = ts.transpileModule(node.getText(ast).replace(/^export /, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ES2022 },
  }).outputText;
  return vm.runInNewContext(javascript + `\n${name}`, { ...dependencies, Set, Date });
}
const authorizedFor = loadFunction(
  transformed.get('packages/convex/convex/lib/accessKeys.ts'),
  'authorizedFor',
);
for (const user of ['owner', 'assignee']) {
  const stamp = { access_owner: 'owner', access_key: 'team:T', access_grants: ['assignee'] };
  assert.equal(authorizedFor(stamp, user, new Set([`user:${user}`])), false);
  assert.equal(authorizedFor(stamp, user, new Set([`user:${user}`, 'team:T'])), true);
}
assert.equal(
  authorizedFor(
    { access_owner: 'owner', access_key: 'user:owner', access_grants: ['assignee'] },
    'assignee',
    new Set(['user:assignee']),
  ),
  true,
);
mark('removed team owner and assignee denied; personal explicit grants preserved');
const verify = loadFunction(
  transformed.get('platform/packages/auth/src/convex/apiTokens.ts'),
  'verifyApiToken',
  {
    resolveTables: () => ({}),
    findTokenDoc: async () => ({ _id: 'token', user_id: 'deleted' }),
    isSetupToken: () => false,
    deviceBindingAllowsDoc: () => true,
  },
);
assert.equal(await verify({ db: { get: async () => null } }, 'secret'), null);
assert.equal(
  (await verify({ db: { get: async () => ({ _id: 'deleted' }) } }, 'secret')).userId,
  'deleted',
);
const exchange = loadFunction(
  transformed.get('platform/packages/auth/src/convex/apiTokens.ts'),
  'exchangeSetupTokenFor',
  {
    resolveTables: () => ({}),
    findTokenDoc: async () => ({ _id: 'setup', user_id: 'deleted' }),
    isSetupToken: () => true,
    mintBearerToken: async () => {
      throw new Error('must not mint');
    },
  },
);
assert.equal(await exchange({ db: { get: async () => null } }, 'setup'), null);
mark('deleted account bearer verification and setup exchange fail closed');
const assign = loadFunction(helper, 'colloNativeAssignee', {
  isTeamMember: async (_ctx, id) => id === 'users:member',
});
const ctx = {
  db: {
    normalizeId: (table, id) => (id.startsWith(table + ':') ? id : null),
    get: async (id) => (id === 'users:missing' ? null : { _id: id }),
  },
};
await assert.rejects(assign(ctx, 'users:outsider', { team_id: 'T' }), /current member/);
await assert.rejects(assign(ctx, 'users:missing'), /no longer exists/);
assert.equal(await assign(ctx, 'users:member', { team_id: 'T' }), 'users:member');
assert.equal(await assign(ctx, 'users:outsider'), 'users:outsider');
mark('assignee membership check does not turn personal sharing into a team rule');
const launch = loadFunction(
  transformed.get('packages/convex/convex/tasks.ts'),
  'canLaunchTaskSession',
  {
    canAccessTask: async () => false,
  },
);
assert.equal(
  await launch({ db: {} }, 'member', { user_id: 'owner', team_id: 'T', workspace: 'user:owner' }),
  false,
);
const removedPushIds = [];
const flush = loadFunction(
  transformed.get('packages/convex/convex/pushRouter.ts'),
  'performPushFlush',
  {
    BATCH_SLACK_MS: 0,
    MAX_MACHINE_HOLD_MS: 0,
    readPresence: async () => ({ clientActive: false, machineActive: false }),
    colloNativeCanReadNotification: async () => false,
  },
);
await flush(
  {
    db: {
      query: () => ({
        withIndex: () => ({
          collect: async () => [{ _id: 'queued', notification_id: 'notification', due_at: 0 }],
        }),
      }),
      get: async (id) =>
        id === 'member'
          ? { push_token: 'TEST unused', notifications_enabled: true }
          : { read: false },
      delete: async (id) => removedPushIds.push(id),
    },
    scheduler: {
      runAfter: async () => assert.fail('Revoked queued push must not schedule a send'),
    },
  },
  'member',
);
assert.deepEqual(removedPushIds, ['queued']);
mark('native launch uses task authorization and queued revoked push is dropped before scheduling');
if (process.argv.includes('--source-only')) process.exit(0);

const backend = process.env.COLLO_NATIVE_TEST_URL ?? 'http://127.0.0.1:3408';
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(backend).hostname),
  'Tests must remain loopback',
);
const directory = path.join(root, `.local/codecast-app/native-backend-audit-${Date.now()}`);
await fs.mkdir(directory, { recursive: true });
const evidence = { checks, backend, launchRejections: 'not requested' };
async function account(label) {
  const client = new ConvexHttpClient(backend);
  const auth = await client.action('auth:signIn', {
    provider: 'password',
    params: {
      email: `test-native-${label}-${randomUUID()}@example.test`,
      password: `TEST-only-${randomUUID()}`,
      flow: 'signUp',
    },
  });
  assert.ok(auth.tokens?.token);
  client.setAuth(auth.tokens.token);
  const user = await client.query('users:getCurrentUser', {});
  assert.ok(user?._id);
  await client.mutation('users:updateProfile', { name: 'TEST native ' + label });
  return { client, id: user._id, token: auth.tokens.token };
}
const forbidden = (operation) =>
  assert.rejects(
    operation,
    /Unauthorized|not found|member|Forbidden|unauthenticated|expired|Authentication failed/i,
  );
async function noTask(client, task) {
  const row = await client.query('tasks:webGet', { id: task.id });
  assert.equal(row, null);
}
async function allActions(client, scope) {
  const result = [];
  let from = 0;
  for (let pages = 0; pages < 20; pages++) {
    const page = await client.query('syncLog:getRange', {
      scope_key: scope,
      from,
      limit: 200,
      cargo: true,
    });
    result.push(...page.actions);
    if (!page.hasMore) return result;
    assert.ok(page.nextFrom > from);
    from = page.nextFrom;
  }
  throw new Error('Unexpected audit fixture size');
}
try {
  const owner = await account('owner'),
    member = await account('member'),
    outsider = await account('outsider');
  const teamId = await owner.client.mutation('teams:createTeam', {
    name: 'TEST native ' + randomUUID().slice(0, 8),
  });
  const team = await owner.client.query('teams:getTeam', { team_id: teamId });
  // Local code redemption only; no invitation email is sent.
  await member.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
  const ownerToken = await owner.client.mutation('apiTokens:createToken', {
    name: 'TEST native owner',
  });
  const memberToken = await member.client.mutation('apiTokens:createToken', {
    name: 'TEST native member',
  });
  const anonymous = new ConvexHttpClient(backend);
  const project = await owner.client.mutation('projects:webCreate', {
    title: 'TEST native project',
    workspace: 'team',
    team_id: teamId,
  });
  const task = await owner.client.mutation('tasks:webCreate', {
    title: 'TEST team task',
    workspace: 'team',
    team_id: teamId,
    project_id: project.id,
    assignee: member.id,
  });
  const memberTask = await member.client.mutation('tasks:webCreate', {
    title: 'TEST member-created team task',
    workspace: 'team',
    team_id: teamId,
  });
  await forbidden(() =>
    owner.client.mutation('tasks:webUpdate', { short_id: task.short_id, assignee: outsider.id }),
  );
  await forbidden(() =>
    owner.client.mutation('dispatch:dispatch', {
      action: 'updateTask',
      args: [task.short_id, { assignee: outsider.id }],
    }),
  );
  await forbidden(() =>
    anonymous.mutation('tasks:update', {
      api_token: ownerToken.token,
      short_id: task.short_id,
      assignee: outsider.id,
    }),
  );
  await forbidden(() =>
    outsider.client.mutation('notifications:toggleWatch', {
      entity_type: 'task',
      entity_id: task.id,
    }),
  );
  await member.client.mutation('notifications:toggleWatch', {
    entity_type: 'task',
    entity_id: task.id,
  });
  mark(
    'native web, dispatch and CLI reject outside-team assignee; unauthorized subscription denied',
  );

  const privateTask = await owner.client.mutation('tasks:webCreate', {
    title: 'TEST private launch boundary',
    description: 'TEST PRIVATE CONTENT',
    workspace: 'personal',
  });
  // Routing changes do not change the stored personal access key.
  await anonymous.mutation('tasks:update', {
    api_token: ownerToken.token,
    short_id: privateTask.short_id,
    team_id: teamId,
  });
  const privateRow = await owner.client.query('tasks:webGet', { id: privateTask.id });
  assert.equal(privateRow.team_id, teamId);
  assert.equal(privateRow.workspace, `user:${owner.id}`);
  await noTask(member.client, privateTask);
  if (process.argv.includes('--check-launch-rejections')) {
    // Only invoke these against the fixed deployment; never execute a successful launch.
    await forbidden(() =>
      member.client.mutation('tasks:assignToAgent', {
        short_id: privateTask.short_id,
        agent_type: 'codex',
      }),
    );
    await forbidden(() =>
      anonymous.mutation('tasks:spawnForTask', {
        short_id: privateTask.short_id,
        api_token: memberToken.token,
        agent_type: 'codex',
      }),
    );
    await forbidden(() =>
      member.client.mutation('dispatch:dispatch', {
        action: 'createSession',
        args: [{ linked_object: { type: 'task', id: privateTask.id }, agent_type: 'codex' }],
      }),
    );
    evidence.launchRejections = 'three entrypoints rejected';
    mark('private task launch denied via native web, CLI and dispatch');
  }

  // Use an unassigned task to ensure stale commenter subscription alone cannot leak content.
  const commentTask = await owner.client.mutation('tasks:webCreate', {
    title: 'TEST comment revocation',
    workspace: 'team',
    team_id: teamId,
  });
  await member.client.mutation('tasks:webAddComment', {
    short_id: commentTask.short_id,
    text: 'TEST prior membership comment',
  });
  await owner.client.mutation('teams:removeMember', { team_id: teamId, member_user_id: member.id });
  for (const t of [task, memberTask, commentTask]) await noTask(member.client, t);
  const listed = await member.client.query('tasks:webList', {});
  assert.ok(!listed.items.some((t) => t._id === task.id || t._id === memberTask.id));
  const crawled = await member.client.query('tasks:webListPaginated', {
    paginationOpts: { cursor: null, numItems: 100 },
  });
  assert.ok(!crawled.page.some((t) => t._id === task.id || t._id === memberTask.id));
  assert.equal(await member.client.query('projects:webGet', { id: project.id }), null);
  await forbidden(() =>
    member.client.mutation('tasks:webAddComment', {
      short_id: task.short_id,
      text: 'must be refused',
    }),
  );
  await forbidden(() =>
    member.client.mutation('tasks:webUpdate', {
      short_id: memberTask.short_id,
      title: 'must be refused',
    }),
  );
  await forbidden(() =>
    anonymous.mutation('tasks:update', {
      api_token: memberToken.token,
      short_id: memberTask.short_id,
      title: 'must be refused',
    }),
  );
  const marker = `TEST REVOKED SECRET ${randomUUID()}`;
  await owner.client.mutation('tasks:webAddComment', {
    short_id: commentTask.short_id,
    text: marker,
  });
  const notifications = await member.client.query('notifications:list', {});
  assert.ok(!JSON.stringify(notifications).includes(marker));
  const actions = await allActions(member.client, `user:${member.id}`);
  for (const t of [task, memberTask]) {
    const rows = actions.filter((a) => a.entity_id === t.id);
    assert.ok(rows.length > 0, 'Must exercise a retained grant/owner sync entry');
    assert.ok(
      rows.every((a) => a.op === 'delete' && !a.patch),
      JSON.stringify(rows),
    );
  }
  mark(
    'membership removal revokes creator, assignee, CLI writes, sync cargo and new comment notifications',
  );

  const deleted = await account('delete');
  await deleted.client.mutation('teams:joinTeam', { invite_code: team.invite_code });
  const credentials = [];
  for (let i = 0; i < 51; i++) {
    const token = (
      await deleted.client.mutation('apiTokens:createToken', {
        name: `TEST deletion credential ${i}`,
        device_id: 'test-native-source',
      })
    ).token;
    credentials.push(token + '.test-native-source');
  }
  assert.ok(
    (
      await anonymous.mutation('apiTokens:mintForDevice', {
        api_token: credentials[50],
        device_id: 'test-native-device',
        label: 'TEST live factory control',
      })
    ).token,
  );
  const owned = await deleted.client.mutation('tasks:webCreate', {
    title: 'TEST deleted-account team task',
    workspace: 'team',
    team_id: teamId,
  });
  const deletion = await deleted.client.mutation('users:deleteAccount', {});
  assert.equal(deletion.completed, true);
  for (const token of [credentials[0], credentials[50]]) {
    await forbidden(() =>
      anonymous.query('tasks:get', { api_token: token, short_id: owned.short_id }),
    );
    await forbidden(() =>
      anonymous.mutation('apiTokens:mintForDevice', {
        api_token: token,
        device_id: 'test-native-device',
        label: 'TEST must not mint',
      }),
    );
  }
  await forbidden(() =>
    deleted.client.mutation('projects:webCreate', {
      title: 'must be refused',
      workspace: 'personal',
    }),
  );
  const roster = await owner.client.query('teams:getTeamByInviteCode', {
    invite_code: team.invite_code,
  });
  assert.equal(roster.memberCount, 1, 'Deleted member must release the actual membership seat');
  mark('account deletion disables the 51st credential, device-token factory, JWT and team seat');
  await owner.client.action('auth:signOut', {});
  try {
    await owner.client.mutation('dispatch:dispatch', {
      action: 'updateTask',
      args: [task.short_id, { title: 'must stay queued' }],
    });
    assert.fail('revoked session unexpectedly accepted');
  } catch (error) {
    assert.equal(error.data?.retryable, true);
    assert.equal(error.data?.code, 'UNAUTHENTICATED');
  }
  mark('revoked session dispatch explicitly preserves the retryable outbox contract');
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed';
  evidence.error = String(error.stack ?? error);
  process.exitCode = 1;
  console.error(evidence.error);
} finally {
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(evidence, null, 2));
  console.log('Evidence: ' + directory);
}
