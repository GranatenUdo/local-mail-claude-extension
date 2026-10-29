import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import net from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import selfsigned from 'selfsigned';
import { ImapFlow } from 'imapflow';
import { connectionOptions } from '../src/config.js';
import { MailService } from '../src/mail.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const certificates = selfsigned.generate([{ name: 'commonName', value: 'synthetic-bridge.invalid' }], { keySize: 2048, algorithm: 'sha256' });
async function fixture(mode: 'tls' | 'refuse-starttls' | 'starttls' = 'tls', rejectAuth = false) {
  const pair = await certificates;
  const root = await mkdtemp(path.join(tmpdir(), 'mail-tls-test-'));
  const certPath = path.join(root, 'synthetic.pem'); await writeFile(certPath, pair.cert);
  const commands: string[] = []; const sockets = new Set<net.Socket>();
  function protocol(socket: net.Socket, greeting = true, secured = mode === 'tls') {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
    if (greeting) socket.write('* OK synthetic server\r\n');
    let buffer = '';
    const data = (chunk: Buffer) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n'); const line = buffer.slice(0,index); buffer = buffer.slice(index+2);
        commands.push(line);
        const tag = line.split(' ')[0]; const command = line.slice(tag!.length+1);
        const ok = () => socket.write(`${tag} OK done\r\n`);
        if (command === 'CAPABILITY') { socket.write(`* CAPABILITY IMAP4rev1 AUTH=PLAIN${mode === 'starttls' && !secured ? ' STARTTLS' : ''}\r\n`); ok(); }
        else if (command === 'STARTTLS' && mode === 'starttls') {
          socket.write(`${tag} OK upgrade\r\n`); socket.removeListener('data', data);
          const secure = new tls.TLSSocket(socket, { isServer: true, secureContext: tls.createSecureContext({ key: pair.private, cert: pair.cert }) });
          protocol(secure, false, true); return;
        }
        else if (/^(AUTHENTICATE|LOGIN) /.test(command)) { socket.write(`${tag} ${rejectAuth ? 'NO rejected' : 'OK authenticated'}\r\n`); }
        else if (/^LIST /.test(command)) { socket.write('* LIST () "/" "INBOX"\r\n'); ok(); }
        else if (/^EXAMINE /.test(command)) { socket.write('* FLAGS (\\Seen)\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 77] identity\r\n* OK [UIDNEXT 2] next\r\n'); socket.write(`${tag} OK [READ-ONLY] selected\r\n`); }
        else if (/^UID SEARCH /.test(command)) { socket.write('* SEARCH 1\r\n'); ok(); }
        else if (/^UID FETCH /.test(command)) {
          if (/BODY\.PEEK\[/.test(command)) {
            let response = '* 1 FETCH (UID 1 RFC822.SIZE 200';
            for (const match of command.matchAll(/BODY\.PEEK\[([^\]]+)\](?:<(\d+)\.(\d+)>)?/g)) {
              const section = match[1]!;
              const body = /HEADER|MIME/i.test(section) ? 'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n' : Number(match[2] || 0) === 0 ? 'hello' : '';
              response += ` BODY[${section}]${match[2] ? `<${match[2]}>` : ''} {${Buffer.byteLength(body)}}\r\n${body}`;
            }
            socket.write(response + ')\r\n');
          } else socket.write('* 1 FETCH (UID 1 FLAGS () ENVELOPE ("Mon, 1 Jan 2024 00:00:00 +0000" "Hello" (("Sender" NIL "sender" "example.invalid")) NIL NIL NIL NIL NIL NIL "<synthetic@example.invalid>") BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 5 1))\r\n');
          ok();
        }
        else if (command === 'LOGOUT') { socket.end(`* BYE bye\r\n${tag} OK logout\r\n`); }
        else { socket.write(`${tag} BAD unsupported synthetic command\r\n`); }
      }
    };
    socket.on('data', data);
  }
  const server = mode === 'tls' ? tls.createServer({ key: pair.private, cert: pair.cert }, socket => protocol(socket)) : net.createServer(socket => protocol(socket));
  server.on('tlsClientError', () => {});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;
  const account = { id: 'proton' as const, host: '127.0.0.1', port: address.port, secure: mode === 'tls', certificate: certPath };
  function client() { const client = new ImapFlow(connectionOptions(account, { username: 'synthetic-user', password: 'synthetic-password' })); client.on('error', () => {}); return client; }
  return { account, commands, client, pair, root, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); } };
}
for (const mode of ['tls','starttls'] as const) test(`real IMAP ${mode}: pinned certificate authenticates, read uses EXAMINE/PEEK only`, async () => {
  const f = await fixture(mode);
  try {
    const service = new MailService({ proton: f.account }, async (_id, run) => { const client = f.client(); try { await client.connect(); return await run(client); } finally { client.close(); } });
    const first = await service.search({ account: 'proton', folder: 'INBOX' });
    assert.equal(first.messages.length, 1);
    const read = await service.read(first.messages[0]!.ref);
    assert.equal(read.text, 'hello'); assert.equal(read.unread, true);
    assert.equal(f.commands.some(line => /\b(SELECT|STORE|MOVE|DELETE|APPEND|EXPUNGE|CLOSE)\b/.test(line)), false);
    assert.equal(f.commands.some(line => /BODY\.PEEK\[/.test(line)), true);
    assert.equal(f.commands.some(line => /BODY\[/.test(line)), false);
  } finally { await f.close(); }
});
test('wrong certificate and refused STARTTLS never transmit authentication', async () => {
  const f = await fixture();
  try {
    const wrong = await selfsigned.generate([{ name: 'commonName', value: 'wrong.invalid' }]);
    await writeFile(f.account.certificate, wrong.cert);
    const client = f.client(); try { await assert.rejects(client.connect()); } finally { client.close(); }
    assert.equal(f.commands.some(line => /AUTHENTICATE|LOGIN/.test(line)), false);
  } finally { await f.close(); }
  const plain = await fixture('refuse-starttls');
  try { const client = plain.client(); try { await assert.rejects(client.connect()); } finally { client.close(); }
    assert.equal(plain.commands.some(line => /AUTHENTICATE|LOGIN/.test(line)), false);
  } finally { await plain.close(); }
});
test('authentication rejection is surfaced and connection can be closed', async () => {
  const f = await fixture('tls', true);
  try { const client = f.client(); try { await assert.rejects(client.connect()); } finally { client.close(); } }
  finally { await f.close(); }
});
test('production DPAPI helper, session isolation, concurrency and reconnect certificate checks', { skip: process.platform !== 'win32' }, async () => {
  const f = await fixture(); const previous = process.env.LOCALAPPDATA;
  try {
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'tests/save-synthetic.ps1'], {
      env: { SystemRoot: process.env.SystemRoot, LOCALAPPDATA: f.root, TEMP: process.env.TEMP }, timeout: 60000,
    });
    process.env.LOCALAPPDATA = f.root;
    const service = new MailService({ proton: f.account });
    const a = service.read({ account: 'proton', folder: 'INBOX', uidValidity: '77', uid: 1 });
    const b = service.search({ account: 'proton', folder: 'INBOX' });
    await assert.rejects(service.folders('proton'), /BUSY/);
    const [message, search] = await Promise.all([a,b]);
    assert.equal(message.text, 'hello'); assert.equal(search.messages.length, 1);
    const authCount = f.commands.filter(c => /AUTHENTICATE|LOGIN/.test(c)).length;
    const wrong = await selfsigned.generate([{ name: 'commonName', value: 'changed.invalid' }]);
    await writeFile(f.account.certificate, wrong.cert);
    await assert.rejects(service.folders('proton'), /CONNECTION/);
    assert.equal(f.commands.filter(c => /AUTHENTICATE|LOGIN/.test(c)).length, authCount);
  } finally { if (previous === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = previous; await f.close(); }
});
