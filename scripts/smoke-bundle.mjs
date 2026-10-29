import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import yauzl from 'yauzl';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import { minimalEnvironment } from '../dist/security.js';

const exec = promisify(execFile);
const root = await mkdtemp(path.join(tmpdir(), 'local-mail-bundle-smoke-'));
const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
const filename = `artifacts/local-mail-${version}-win32-${process.arch}.mcpb`;
const inventory = new Map(JSON.parse(await readFile('artifacts/inventory.json', 'utf8')).map(item => [item.file, item]));
try {
  await new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      zip.on('error', reject); zip.on('end', resolve);
      zip.on('entry', entry => {
        const target = path.resolve(root, entry.fileName);
        const expected = inventory.get(entry.fileName);
        if (!target.startsWith(root + path.sep) || !expected || entry.uncompressedSize !== expected.size || entry.uncompressedSize > 128 * 1024 ** 2) { zip.close(); reject(new Error('Unexpected bundle entry')); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error) { zip.close(); reject(error); return; }
          (async () => {
            const chunks = []; for await (const chunk of stream) chunks.push(chunk);
            const bytes = Buffer.concat(chunks);
            if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error('Bundle checksum mismatch');
            await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes);
            inventory.delete(entry.fileName); zip.readEntry();
          })().catch(error => { zip.close(); reject(error); });
        });
      }); zip.readEntry();
    });
  });
  if (inventory.size) throw new Error('Bundle missing files');
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'dist/index.js')],
    env: { ...minimalEnvironment(), GMX_ENABLED: 'false', PROTON_ENABLED: 'false' }, stderr: 'pipe' });
  const client = new Client({ name: 'bundle-smoke', version: '1' });
  try {
    await client.connect(transport);
    const tools = await client.listTools(); if (tools.tools.length !== 6) throw new Error('Missing tools');
    const result = await client.callTool({ name: 'list_accounts', arguments: {} });
    if (result.isError || result.content[0].text !== '{"accounts":[]}') throw new Error('Unexpected account response');
  } finally { await client.close(); }
  // Exercise the isolated parser from the extracted bundle, not the checkout's node_modules.
  const parserUrl = pathToFileURL(path.join(root, 'dist/parser-process.js')).href;
  const code = `import {extractInProcess} from ${JSON.stringify(parserUrl)}; const r = await extractInProcess(Buffer.from('bundle smoke text'), 'sample.txt'); if(r.text !== 'bundle smoke text') process.exit(1); console.log('parser-ok');`;
  const result = await exec(process.execPath, ['--input-type=module', '-e', code], { env: minimalEnvironment(), timeout: 40000, windowsHide: true });
  if (!result.stdout.includes('parser-ok')) throw new Error('Parser smoke failed');
  // Loading PDF.js from this installation checks its native optional dependency and worker layout.
  const pdfUrl = pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
  await exec(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pdfUrl)});`], { env: minimalEnvironment(), timeout: 30000, windowsHide: true });
  console.log('Bundle inventory, isolated stdio MCP and parser/PDF runtime smoke passed. Claude Desktop UI installation remains a separate manual check.');
} finally {
  if (!root.startsWith(path.join(tmpdir(), 'local-mail-bundle-smoke-'))) throw new Error('Unsafe cleanup path');
  await rm(root, { recursive: true, force: true });
}
