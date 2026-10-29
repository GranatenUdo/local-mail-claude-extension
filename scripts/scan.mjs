import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
const roots = ['src', 'tests', 'scripts', 'docs', 'schemas', '.github'];
const top = ['.gitignore', '.markdownlint-cli2.jsonc', 'AGENTS.md', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'LICENSE', 'manifest.json', 'package.json', 'package-lock.json', 'tsconfig.json'];
async function walk(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error(`Symlink refused: ${directory}/${item.name}`);
    const file = `${directory}/${item.name}`;
    if (item.isDirectory()) result.push(...await walk(file)); else result.push(file);
  }
  return result;
}
const allowed = new Set(top);
for (const root of roots) for (const file of await walk(root)) {
  if (!/\.(?:ts|mjs|ps1|md|json|yml|yaml)$/.test(file) && file !== 'schemas/MCPB-LICENSE') throw new Error(`Unapproved source artifact: ${file}`);
  allowed.add(file);
}
const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of [...staged, ...tracked]) if (!allowed.has(file)) throw new Error(`Unapproved tracked file: ${file}`);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{40,}\b/,
];
let count = 0;
function scan(content, label) { for (const pattern of patterns) if (pattern.test(content)) throw new Error(`Potential secret in ${label}`); count++; }
for (const file of allowed) scan(await readFile(file, 'utf8'), file);
for (const file of staged) scan(execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 8 * 1024 ** 2 }), `staged:${file}`);
// Scan every historical blob too; removing a secret from HEAD is not sufficient for public publication.
const history = execFileSync('git', ['rev-list', '--objects', '--all'], { encoding: 'utf8' });
for (const line of history.trim().split('\n').filter(Boolean)) {
  const [oid] = line.split(' ');
  if (execFileSync('git', ['cat-file', '-t', oid], { encoding: 'utf8' }).trim() === 'blob') scan(execFileSync('git', ['cat-file', '-p', oid], { encoding: 'utf8', maxBuffer: 8 * 1024 ** 2 }), oid);
}
console.log(`Source allowlist and high-confidence secret patterns passed (${count} files/blobs). Manual staged-file review is still required.`);
