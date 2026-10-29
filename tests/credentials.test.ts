import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const exec = promisify(execFile);
test('DPAPI roundtrip, replacement, ciphertext, corruption and removal', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mail-credential-test-'));
  try {
    const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'tests/credentials.integration.ps1'], {
      env: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, LOCALAPPDATA: root }, timeout: 20000,
    });
    assert.match(result.stdout, /credential-tests-passed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
