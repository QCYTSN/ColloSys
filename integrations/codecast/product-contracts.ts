/** ColloSys-owned project contract, shared by UI, validators and persistence. */
export const projectIconIds = [
  'folder',
  'code',
  'leaf',
  'planet',
  'flask',
  'rocket',
  'books',
  'compass',
  'lightning',
  'chart',
  'shield',
  'heart',
  'pen',
  'puzzle',
  'cube',
  'flag',
] as const;
export const projectToneIds = ['iris', 'clay', 'moss', 'lake', 'rose', 'slate'] as const;
export type ProjectIdentity = {
  version: 1;
  icon: (typeof projectIconIds)[number];
  tone: (typeof projectToneIds)[number];
};
export const defaultProjectIdentity: ProjectIdentity = { version: 1, icon: 'folder', tone: 'iris' };
export type CollaborationScope = { kind: 'personal' } | { kind: 'team'; teamId: string };
export type CreateProductProject = {
  title: string;
  identity: ProjectIdentity;
  scope: CollaborationScope;
};
export type DirectorySummary = {
  version: 1;
  directoryId: string;
  projectId: string;
  ownerId: string;
  label: string;
  ownedByViewer: boolean;
};
// Scope names an audience. Local directory IDs name explicitly configured roots
// on a member's device, never a team-owned shared filesystem. Source sessions
// are captured history, distinct from controllable execution sessions. Agent
// tools and model names are independent facts. Checkpoint metadata is not proof
// that encrypted file bytes have reached a remote backup provider.
export function assertProjectIdentity(value: {
  version: number;
  icon: string;
  tone: string;
}): asserts value is ProjectIdentity {
  if (
    value.version !== 1 ||
    !projectIconIds.includes(value.icon as ProjectIdentity['icon']) ||
    !projectToneIds.includes(value.tone as ProjectIdentity['tone'])
  )
    throw new Error('Choose a supported project icon and color');
}
export function readProjectIdentity(project: {
  identity?: { version: number; icon: string; tone: string };
  icon?: string;
  color?: string;
}): ProjectIdentity {
  if (project.identity) {
    try {
      assertProjectIdentity(project.identity);
      return project.identity;
    } catch {}
  }
  const icons: Record<string, ProjectIdentity['icon']> = {
    folder: 'folder',
    'folder-simple': 'folder',
    code: 'code',
    'code-2': 'code',
    leaf: 'leaf',
    globe: 'planet',
    flask: 'flask',
    rocket: 'rocket',
    book: 'books',
    'book-open': 'books',
    compass: 'compass',
    zap: 'lightning',
    'bar-chart': 'chart',
    shield: 'shield',
    heart: 'heart',
    pencil: 'pen',
    puzzle: 'puzzle',
    box: 'cube',
    flag: 'flag',
  };
  const tones: Record<string, ProjectIdentity['tone']> = {
    violet: 'iris',
    cyan: 'iris',
    orange: 'clay',
    yellow: 'clay',
    green: 'moss',
    blue: 'lake',
    red: 'rose',
    magenta: 'rose',
    gray: 'slate',
    '#7568b6': 'iris',
    '#a86944': 'clay',
    '#36775e': 'moss',
    '#496caf': 'lake',
  };
  return {
    version: 1,
    icon: icons[project.icon || ''] ?? 'folder',
    tone: tones[(project.color || '').toLowerCase()] ?? 'iris',
  };
}
export function foundationProjectIdentity(identity: ProjectIdentity) {
  assertProjectIdentity(identity);
  return {
    icon: identity.icon,
    color: (
      {
        iris: 'violet',
        clay: 'orange',
        moss: 'green',
        lake: 'blue',
        rose: 'magenta',
        slate: 'gray',
      } as const
    )[identity.tone],
  };
}
