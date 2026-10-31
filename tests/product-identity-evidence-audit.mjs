// Read-only secret check. Report paths and counts, never matching secret text.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { parseEnv } from 'node:util';
import path from 'node:path';
const root = process.env.COLLOSYS_EVIDENCE_AUDIT_ROOT || 'docs/product-ui/identity-motion',
  findings = [],
  files = [];
const secrets = [];
try { secrets.push((await fs.readFile('.local/codecast-app/browser-pairing', 'utf8')).trim()); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const file of ['.local/codecast-app/local.env', '.local/codecast-app/oauth.env']) {
  try {
    for (const [key, value] of Object.entries(parseEnv(await fs.readFile(file, 'utf8'))))
      if (/SECRET|ADMIN_KEY|PRIVATE_KEY|JWT_PRIVATE|AUTH_.+_ID/.test(key) && value.length >= 16)
        secrets.push(value);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function visit(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Linked evidence is not allowed');
    if (entry.isDirectory()) await visit(file);
    else if (/\.(md|html|json|gz|log)$/.test(entry.name)) files.push(file);
  }
}
await visit(root);
for (const file of files) {
  const input = createReadStream(file),
    stream = file.endsWith('.gz') ? input.pipe(createGunzip()) : input;
  let carry = '',
    matched = false;
  for await (const chunk of stream) {
    const text = carry + chunk.toString('utf8');
    if (
      !matched &&
      (secrets.some((value) => value.length >= 16 && text.includes(value)) ||
        /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/.test(text))
    ) {
      findings.push({ file, kind: 'Potential private credential or JWT; inspect privately' });
      matched = true;
    }
    carry = text.slice(-16384);
  }
}
let html;
try { html = await fs.readFile(root + '/REVIEW.html', 'utf8'); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  html = await fs.readFile(root + '/README.md', 'utf8');
}
const links = [
  ...new Set([
    ...[...html.matchAll(/(?:["'])(evidence\/[^"']+|[A-Z][A-Z-]+\.md)["']/g)].map((match) => match[1]),
    ...[...html.matchAll(/\]\((evidence\/[^)]+)\)/g)].map(match => match[1]),
  ]),
];
for (const link of links) {
  try {
    await fs.access(path.join(root, link));
  } catch {
    findings.push({ file: link, kind: 'Missing review artifact' });
  }
}
const result = {
  checkedAt: new Date().toISOString(),
  textAndCompressedFiles: files.length,
  reviewLinks: links.length,
  findings,
  limitations:
    'Exact configured backend secret and JWT pattern scan of text/compressed traces. Does not certify arbitrary undisclosed secrets or OCR video frames. Password inputs remain masked in product captures.',
};
await fs.writeFile(root + '/evidence/evidence-audit.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (findings.length) process.exitCode = 1;
