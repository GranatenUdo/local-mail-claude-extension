import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLinks } from './docs-links.mjs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(file => /\.md$/i.test(file));
if (!files.length) throw new Error('No tracked Markdown files found');
// Literal paths prevent glob interpretation and include dot-directory templates.
const cli = fileURLToPath(new URL('../node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs', import.meta.url));
const lint = spawnSync(process.execPath, [cli, ...files.map(file => ':' + file)], { stdio: 'inherit' });
if (lint.error) throw lint.error;
if (lint.status !== 0) process.exit(lint.status ?? 1);
const errors = await checkLinks(process.cwd(), files);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Local links and heading anchors passed (${files.length} Markdown files; no network requests).`);
