import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

export const oauthEnvironmentNames = ['AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'];
export async function readProductOAuthSettings(directory) {
  let file = {};
  try { file = parseEnv(await readFile(path.join(directory, 'oauth.env'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read the private OAuth configuration. Check oauth.env syntax and file access.'); }
  if (Object.keys(file).some(name => !oauthEnvironmentNames.includes(name))) throw new Error('oauth.env accepts only GitHub and Google OAuth client configuration.');
  return oauthEnvironmentNames.flatMap(name => {
    const value = file[name] ?? process.env[name];
    if (value === undefined) return [];
    if (value.length > 8192 || /[\r\n\0]/.test(value)) throw new Error(`Invalid ${name} configuration`);
    return [{ name, ...(value.trim() ? { value: value.trim() } : {}) }];
  });
}
export function oauthNetworkHosts(enabled) {
  return new Set([
    ...(enabled.github ? ['github.com', 'api.github.com'] : []),
    ...(enabled.google ? ['accounts.google.com', 'oauth2.googleapis.com', 'openidconnect.googleapis.com', 'www.googleapis.com'] : []),
  ]);
}
