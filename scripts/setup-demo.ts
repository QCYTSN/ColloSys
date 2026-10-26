import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './process';
export const demoRoot = path.join(root, '.local', 'demo');
export async function prepareDemo(backend = 'http://127.0.0.1:8787') {
  await fs.mkdir(demoRoot, { recursive: true });
  const configs = [];
  for (const [index, user] of ['alice', 'bob'].entries()) {
    const project = path.join(demoRoot, user, 'project');
    await fs.mkdir(path.join(project, 'src'), { recursive: true });
    const initial: Record<string, string> = {
      'README.md':
        '# ColloSys demo project\n\nEdit files in this directory with your editor. Changes are real and stay independent from your teammate.\n',
      'src/greeting.ts': `export function greeting(name: string) {\n  return \`Hello, \${name}!\`;\n}\n`,
      '.gitignore': 'node_modules/\ndist/\n.env\n',
      '.env': 'DEMO_ONLY_NOT_A_REAL_SECRET=excluded\n',
    };
    for (const [rel, text] of Object.entries(initial))
      try {
        await fs.writeFile(path.join(project, rel), text, { flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    const response = await fetch(backend + '/api/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user }),
    });
    if (!response.ok) throw new Error('Local backend must be running before demo setup');
    const auth = (await response.json()) as { token: string };
    const config = {
      root: project,
      state: path.join(demoRoot, user, 'state'),
      backend,
      projectId: 'demo-project',
      workspaceId: `workspace-${user}`,
      userId: user,
      label: `${user === 'alice' ? 'Alice' : 'Bob'} 的工作区`,
      token: auth.token,
      port: 8791 + index,
    };
    const configFile = path.join(demoRoot, `${user}.json`);
    await fs.writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
    configs.push(configFile);
  }
  console.log(`Demo directories: ${demoRoot}`);
  return configs;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await prepareDemo();
