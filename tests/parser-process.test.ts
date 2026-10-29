import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Copy the real process controller; only replace the external worker boundary for deterministic failure cases.
async function controller(worker: string) {
  const directory = await mkdtemp(path.join(tmpdir(), 'mail-parser-test-'));
  await copyFile('dist/parser-process.js', path.join(directory, 'parser-process.js'));
  await copyFile('dist/security.js', path.join(directory, 'security.js'));
  await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(directory, 'parser-worker.js'), worker);
  return { directory, module: await import(pathToFileURL(path.join(directory, 'parser-process.js')).href), close: () => rm(directory, { recursive: true, force: true }) };
}
test('actual isolated parser handles content and rejects unsupported formats', async () => {
  const { extractInProcess } = await import('../dist/parser-process.js');
  const result = await extractInProcess(Buffer.from('hello worker'), 'note.txt');
  assert.equal(result.text, 'hello worker');
  await assert.rejects(extractInProcess(Buffer.from('x'), 'file.exe'), /UNSUPPORTED/);
});
test('worker cannot inherit secret environment or NODE_OPTIONS', async () => {
  const f = await controller(`process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(JSON.stringify({text: String(process.env.MAIL_TEST_SECRET) + ',' + String(process.env.NODE_OPTIONS), truncated:false})));`);
  const oldSecret = process.env.MAIL_TEST_SECRET; const oldOptions = process.env.NODE_OPTIONS;
  process.env.MAIL_TEST_SECRET = 'synthetic-no-inherit'; process.env.NODE_OPTIONS = '--inspect=0';
  try { assert.equal((await f.module.extractInProcess(Buffer.from('hello'), 'file.txt')).text, 'undefined,undefined'); }
  finally { if (oldSecret === undefined) delete process.env.MAIL_TEST_SECRET; else process.env.MAIL_TEST_SECRET = oldSecret;
    if (oldOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = oldOptions; await f.close(); }
});
test('crashed or over-output workers fail without leaking their diagnostics', async () => {
  for (const code of [`process.stderr.write('private diagnostic'); process.exit(42);`, `process.stdout.write('x'.repeat(700000));`]) {
    const f = await controller(code);
    try { await assert.rejects(f.module.extractInProcess(Buffer.from('x'), 'file.txt'), /EXTRACTION|TOO_LARGE/); }
    finally { await f.close(); }
  }
});
test('hung workers time out and concurrent work is bounded', { timeout: 40000 }, async () => {
  const f = await controller(`process.stdin.resume(); setInterval(() => {}, 1000);`);
  try {
    const a = f.module.extractInProcess(Buffer.from('x'), 'file.txt');
    const b = f.module.extractInProcess(Buffer.from('x'), 'file.txt');
    const awaited = Promise.allSettled([a,b]);
    await assert.rejects(f.module.extractInProcess(Buffer.from('x'), 'file.txt'), /BUSY/);
    const results = await awaited;
    assert.equal(results.every(r => r.status === 'rejected' && /TIMEOUT/.test(String(r.reason))), true);
  } finally { await f.close(); }
});
