import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig, connectionOptions } from '../src/config.js';
import { boundedRead, safeError, minimalEnvironment } from '../src/security.js';
import { saveDownload } from '../src/downloads.js';

test('GMX endpoint cannot be redirected by tool/user input', () => {
  const cfg = loadConfig({ GMX_ENABLED: 'true', GMX_REGION: 'net' });
  const options = connectionOptions(cfg.gmx!, { username: 'synthetic', password: 'synthetic' });
  assert.equal(options.host, 'imap.gmx.net');
  assert.equal(options.port, 993);
  assert.equal(options.secure, true);
  assert.equal(options.logger, false);
  assert.throws(() => loadConfig({ GMX_ENABLED: 'true', GMX_REGION: 'attacker.invalid' }));
});
test('Proton configuration rejects non-loopback and invalid TLS policy', () => {
  assert.throws(() => loadConfig({ PROTON_ENABLED: 'true', PROTON_HOST: '192.0.2.1' }));
  assert.throws(() => loadConfig({ PROTON_ENABLED: 'true', PROTON_TLS: 'none' }));
});
test('stream limit is enforced even without trustworthy size metadata', async () => {
  await assert.rejects(boundedRead(Readable.from([Buffer.alloc(4), Buffer.alloc(4)]), 7), /TOO_LARGE/);
  assert.equal((await boundedRead(Readable.from(['abc']), 3)).toString(), 'abc');
});
test('unknown errors and child environments do not expose credentials', () => {
  assert.equal(JSON.stringify(safeError(new Error('password=synthetic-secret'))).includes('synthetic-secret'), false);
  const env = minimalEnvironment({ SystemRoot: 'C:\\Windows', PASSWORD: 'secret', NODE_OPTIONS: '--inspect', PATH: 'untrusted' });
  assert.equal(env.PASSWORD, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.PATH, undefined);
  assert.equal(env.SystemRoot, 'C:\\Windows');
});
test('downloads ignore hostile original filenames and never overwrite', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mail-download-test-'));
  try {
    const first = await saveDownload(root, '../../CON:secret.exe', Buffer.from('first'));
    const second = await saveDownload(root, '../../CON:secret.exe', Buffer.from('second'));
    assert.notEqual(first, second);
    assert.equal(path.dirname(first), path.join(root, 'LocalMailAttachments'));
    assert.equal(path.extname(first), '.bin');
    assert.equal((await readFile(first)).toString(), 'first');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('download directory junction is rejected', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mail-junction-test-'));
  try {
    const target = path.join(root, 'outside'); await mkdir(target);
    await symlink(target, path.join(root, 'LocalMailAttachments'), 'junction');
    await assert.rejects(saveDownload(root, 'safe.txt', Buffer.from('x')), /UNSAFE_PATH/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
