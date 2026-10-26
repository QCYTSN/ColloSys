// Selected helpers from Codecast wipSnapshot.ts (MIT).
// Copyright (c) 2025 Codecast. See third_party/codecast/LICENSE.
// Adapted to Node child_process; no remote push or project restore helpers.
import { execFile } from 'node:child_process';
import { devNull } from 'node:os';
import path from 'node:path';
const gitNull = process.platform === 'win32' ? '/dev/null' : devNull;
export const BRANCH_TRAILER = 'codecast-branch';
export const WIP_SNAPSHOT_SUBJECT = 'codecast wip snapshot';
export const SNAPSHOT_IDENTITY = { GIT_AUTHOR_NAME:'ColloSys',GIT_AUTHOR_EMAIL:'snapshot@localhost',GIT_COMMITTER_NAME:'ColloSys',GIT_COMMITTER_EMAIL:'snapshot@localhost' };
function environment(cwd: string, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_AUTHOR_DATE', 'GIT_COMMITTER_DATE']) {
    if (overrides[key] !== undefined) env[key] = overrides[key];
  }
  if (overrides.GIT_INDEX_FILE) {
    const relative = path.relative(path.join(cwd, '.git'), overrides.GIT_INDEX_FILE);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Git index must be inside the selected repository');
    env.GIT_INDEX_FILE = overrides.GIT_INDEX_FILE;
  }
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: gitNull, GIT_TERMINAL_PROMPT: '0' };
}
export function gitBytes(cwd: string, args: string[], env?: NodeJS.ProcessEnv, stdin?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', ['-C', cwd, '-c', `core.hooksPath=${gitNull}`, '-c', 'commit.gpgsign=false', ...args],
      { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024, windowsHide: true, env: environment(cwd, env) },
      (error, output) => { if (error) reject(error); else resolve(output); });
    child.stdin?.on('error', () => {}); // execFile reports the child failure.
    child.stdin?.end(stdin);
  });
}
export async function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv, stdin?: string) {
  return (await gitBytes(cwd, args, env, stdin)).toString('utf8').trim();
}
export async function gitTry(cwd:string,args:string[],env?:NodeJS.ProcessEnv,stdin?:string) {try{return await git(cwd,args,env,stdin);}catch{return null;}}
export function parseSnapshotTrailer(message:string,key:string) {return message.match(new RegExp(`^${key}:[ \\t]*(.+)$`,'m'))?.[1].trim();}
