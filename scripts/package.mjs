import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ZipFile } from 'yazl';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = process.cwd();
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
const validate = ajv.compile(JSON.parse(await readFile('schemas/mcpb-manifest-v0.3.schema.json', 'utf8')));
if (!validate(manifest)) throw new Error(JSON.stringify(validate.errors));
if (process.platform !== 'win32') throw new Error('Build the Windows bundle on Windows to include matching native PDF dependencies.');
const files = new Map();
async function add(file) {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep)) throw new Error('Package path escaped root');
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unexpected package file');
  const bytes = await readFile(absolute);
  files.set(file.replaceAll('\\', '/'), bytes);
}
// First-party artifact allowlist: no credentials, tests, local state, source maps or diagnostics.
for (const name of ['manifest.json', 'LICENSE', 'README.md', 'SECURITY.md',
  'docs/setup.md', 'docs/architecture.md', 'docs/reference.md', 'docs/support.md', 'docs/validation.md',
  'scripts/credentials.ps1', 'scripts/CredentialStore.ps1']) await add(name);
for (const name of await readdir('dist')) if (/^[a-z-]+\.js$/.test(name)) await add(`dist/${name}`);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
files.set('package.json', Buffer.from(JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: 'module', engines: pkg.engines, license: pkg.license })));
// Only installed production dependency directories, as resolved by the locked npm graph.
const dependencies = execFileSync(process.execPath, [process.env.npm_execpath, 'ls', '--omit=dev', '--all', '--parseable'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).slice(1);
async function dependencyFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symlink in dependency');
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'test', 'tests', '__tests__', 'examples', '.github', 'coverage'].includes(entry.name)) await dependencyFiles(absolute);
    } else if (/\.(?:js|mjs|cjs|json|node|wasm|bcmap|pfb|ttf)$/i.test(entry.name) || /^(?:LICENSE|LICENCE|COPYING|NOTICE)(?:[.-].*)?$/i.test(entry.name)) await add(path.relative(root, absolute));
  }
}
for (const dependency of [...new Set(dependencies)]) {
  if (!path.resolve(dependency).startsWith(path.join(root, 'node_modules') + path.sep)) throw new Error('Dependency outside node_modules');
  await dependencyFiles(dependency);
}
await mkdir('artifacts', { recursive: true });
const filename = `artifacts/local-mail-${manifest.version}-win32-${process.arch}.mcpb`;
const zip = new ZipFile(); const output = createWriteStream(filename);
const complete = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); zip.outputStream.on('error', reject); });
zip.outputStream.pipe(output);
const inventory = [];
for (const [file, data] of [...files].sort(([a],[b]) => a.localeCompare(b))) {
  zip.addBuffer(data, file, { mtime: new Date('2026-01-01T00:00:00Z') });
  inventory.push({ file, size: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
zip.end(); await complete;
await writeFile('artifacts/inventory.json', JSON.stringify(inventory, null, 2));
const hash = createHash('sha256').update(await readFile(filename)).digest('hex');
await writeFile(`${filename}.sha256`, `${hash}  ${path.basename(filename)}\n`);
console.log(`Validated and packaged ${files.size} allowlisted files: ${filename}`);
