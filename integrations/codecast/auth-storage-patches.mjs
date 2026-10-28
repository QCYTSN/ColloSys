// Keep the original durable auth storage and its offline recovery semantics.
// A shared, non-secret revision fences reads/writes queued before logout (or
// an account change); a removed value must not be restored by another window.
const file = 'platform/packages/auth/src/web/durableAuthStorage.ts';
const patch = (before, after) => ({ file, before, after });
export const authStoragePatches = [
  patch(
    '  const writeListeners = new Set<AuthStorageWriteListener>();',
    `  const writeListeners = new Set<AuthStorageWriteListener>();
  const revisions = new Map<string, string>();
  const revisionKey = (key: string) => "collo-auth-revision:" + DB_NAME + ":" + key;
  function revision(key: string): string {
    try { return localStorage.getItem(revisionKey(key)) ?? revisions.get(key) ?? ""; }
    catch { return revisions.get(key) ?? ""; }
  }
  function changeRevision(key: string, removed: boolean): void {
    const value = (removed ? "removed:" : "written:") + crypto.randomUUID();
    revisions.set(key, value);
    try { localStorage.setItem(revisionKey(key), value); } catch {}
  }
  const removed = (key: string) => revision(key).startsWith("removed:");`,
  ),
  patch(
    '  async function readDurableAuthValue(key: string): Promise<string | null> {\n    let localReadError: unknown;',
    '  async function readDurableAuthValue(key: string): Promise<string | null> {\n    if (removed(key)) return null;\n    const started = revision(key);\n    let localReadError: unknown;',
  ),
  patch(
    '      const durable = await idbGetStrict(key);\n      if (durable === null',
    '      const durable = await idbGetStrict(key);\n      if (revision(key) !== started) return readDurableAuthValue(key);\n      if (durable === null',
  ),
  patch(
    '  function idbSet(key: string, value: string): void {\n    openDB().then(\n      (db) => {',
    '  function idbSet(key: string, value: string): void {\n    const started = revision(key);\n    openDB().then(\n      (db) => {\n        if (removed(key) || revision(key) !== started) return;',
  ),
  patch(
    '  function idbRemove(key: string): void {\n    openDB().then(\n      (db) => {',
    '  function idbRemove(key: string): void {\n    const started = revision(key);\n    openDB().then(\n      (db) => {\n        if (revision(key) !== started) return;',
  ),
  patch(
    '  async function idbRemoveMany(keys: readonly string[]): Promise<void> {\n    const db = await openDB();',
    '  async function idbRemoveMany(keys: readonly string[]): Promise<void> {\n    const started = new Map(keys.map(key => [key, revision(key)]));\n    const db = await openDB();',
  ),
  patch(
    '      for (const key of keys) store.delete(key);',
    '      for (const key of keys) if (revision(key) === started.get(key)) store.delete(key);',
  ),
  patch(
    '    for (const key of keys) {\n      try { localStorage.removeItem(key); }',
    '    for (const key of keys) {\n      changeRevision(key, true);\n      try { localStorage.removeItem(key); }',
  ),
  patch(
    '    getItem(key: string): any {\n      try {',
    '    getItem(key: string): any {\n      if (removed(key)) return null;\n      const started = revision(key);\n      try {',
  ),
  patch(
    '      return idbGet(key).then((v) => {\n        if (v !== null) {',
    '      return idbGet(key).then((v) => {\n        if (revision(key) !== started) return storage.getItem(key);\n        if (v !== null) {',
  ),
  patch(
    '    setItem(key: string, value: string): void {\n      try {',
    '    setItem(key: string, value: string): void {\n      changeRevision(key, false);\n      try {',
  ),
  patch(
    '    removeItem(key: string): void {\n      try {',
    '    removeItem(key: string): void {\n      if (!key.includes("RefreshToken")) changeRevision(key, true);\n      try {',
  ),
];
