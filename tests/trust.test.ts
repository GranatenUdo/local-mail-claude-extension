import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import { connectionOptions } from '../src/config.js';
import { classifyConnectionError } from '../src/connections.js';
import { safeError } from '../src/security.js';
import selfsigned from 'selfsigned';

const account = { id: 'gmx' as const, host: 'imap.gmx.net', port: 993, secure: true };
const credentials = { username: 'synthetic', password: 'synthetic' };

test('GMX combines default and Windows trust without changing hostname validation', t => {
  t.mock.method(tls, 'getCACertificates', (type: string) => type === 'default' ? ['default-ca', 'shared-ca'] : ['system-ca', 'shared-ca']);
  const options = connectionOptions(account, credentials);
  assert.deepEqual(options.tls?.ca, ['default-ca', 'shared-ca', 'system-ca']);
  assert.equal(options.tls?.rejectUnauthorized, true);
  assert.equal(options.tls?.checkServerIdentity, undefined);
});
test('missing or unreadable Windows trust fails closed with static errors', t => {
  const mock = t.mock.method(tls, 'getCACertificates', () => { throw new Error('private diagnostic'); });
  assert.throws(() => connectionOptions(account, credentials), /TRUST_STORE/);
  mock.mock.restore();
  const descriptor = Object.getOwnPropertyDescriptor(tls, 'getCACertificates')!;
  try {
    Object.defineProperty(tls, 'getCACertificates', { ...descriptor, value: undefined });
    assert.throws(() => connectionOptions(account, credentials), /TRUST_STORE/);
  } finally { Object.defineProperty(tls, 'getCACertificates', descriptor); }
});
test('connection diagnostics distinguish TLS and authentication without echoing server text', () => {
  for (const code of ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    assert.equal(classifyConnectionError(Object.assign(new Error('private diagnostic'), { code })).code, 'TLS_CERTIFICATE');
  }
  assert.equal(classifyConnectionError({ authenticationFailed: true, message: 'secret' }).code, 'AUTHENTICATION');
  const error = classifyConnectionError({ code: 'ARBITRARY_SERVER_TEXT', message: 'secret' });
  assert.equal(error.code, 'CONNECTION');
  assert.equal(JSON.stringify(safeError(error)).includes('secret'), false);
});
test('Windows-trusted synthetic CA succeeds; unknown CA and wrong hostname send no authentication', async t => {
  const pair = await selfsigned.generate([{ name: 'commonName', value: 'imap.gmx.net' }], {
    extensions: [{ name: 'basicConstraints', cA: true }, { name: 'subjectAltName', altNames: [{ type: 2, value: 'imap.gmx.net' }] }],
  });
  const received: string[] = [];
  const server = tls.createServer({ key: pair.private, cert: pair.cert }, socket => {
    socket.on('error', () => {}); socket.on('data', data => received.push(data.toString())); socket.on('end', () => socket.end());
  });
  server.on('tlsClientError', () => {});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  let trusted = true;
  t.mock.method(tls, 'getCACertificates', (type: string) => type === 'system' && trusted ? [pair.cert] : []);
  function connect(servername = 'imap.gmx.net') {
    const options = connectionOptions(account, credentials);
    return new Promise<void>((resolve, reject) => {
      const socket = tls.connect({ ...options.tls, host: '127.0.0.1', port, servername });
      socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('timeout')); });
      socket.once('secureConnect', () => socket.end('AUTHENTICATE synthetic\r\n'));
      socket.once('error', reject); socket.once('close', () => resolve());
    });
  }
  try {
    await connect(); assert.deepEqual(received, ['AUTHENTICATE synthetic\r\n']);
    await assert.rejects(connect('wrong.invalid')); assert.equal(received.length, 1);
    trusted = false; await assert.rejects(connect()); assert.equal(received.length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
