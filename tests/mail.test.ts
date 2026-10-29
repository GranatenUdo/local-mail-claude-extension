import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { MailService } from '../src/mail.js';
import type { ImapFlow } from 'imapflow';

function fixture() {
  const calls: any[] = []; let validity = 77n; let ids = [1, 2, 3];
  const structure = { type: 'multipart/mixed', childNodes: [
    { part: '1', type: 'text/plain', size: 5 },
    { part: '2', type: 'text/plain', disposition: 'attachment', dispositionParameters: { filename: 'note.txt' }, size: 4 },
  ] };
  const fake = {
    mailbox: { uidValidity: validity, uidNext: 4 },
    async mailboxOpen(folder: string, options: any) { calls.push(['open', folder, options]); this.mailbox.uidValidity = validity; return this.mailbox; },
    async search(query: any, options: any) { calls.push(['search', query, options]); const [min,max] = query.uid.split(':').map(Number); return ids.filter(x => x >= min && x <= max); },
    async fetchAll(uids: number[], query: any, options: any) { calls.push(['fetchAll', uids, query, options]); return uids.map(uid => ({ uid, envelope: { subject: `mail ${uid}` }, flags: new Set() })); },
    async fetchOne(uid: number, query: any, options: any) { calls.push(['fetchOne', uid, query, options]); return { uid, envelope: { subject: 'hello' }, bodyStructure: structure }; },
    async download(uid: number, part: string, options: any) { calls.push(['download', uid, part, options]); return { meta: { charset: 'utf-8' }, content: Readable.from([part === '1' ? 'hello' : 'note']) }; },
  };
  const service = new MailService({ gmx: { id: 'gmx', host: 'imap.gmx.net', port: 993, secure: true } }, async (_id, run) => run(fake as unknown as ImapFlow));
  return { service, calls, structure, setValidity: (v: bigint) => validity = v, setIds: (v: number[]) => ids = v };
}
test('search pages use descending UID, bind filters, and exclude new arrivals', async () => {
  const f = fixture();
  const first = await f.service.search({ account: 'gmx', folder: 'INBOX', limit: 2 });
  assert.deepEqual(first.messages.map((m: any) => m.ref.uid), [3, 2]);
  f.setIds([1, 2, 3, 4]);
  const second = await f.service.search({ account: 'gmx', folder: 'INBOX', limit: 2, cursor: first.nextCursor! });
  assert.deepEqual(second.messages.map((m: any) => m.ref.uid), [1]);
  await assert.rejects(f.service.search({ account: 'gmx', folder: 'INBOX', subject: 'changed', cursor: first.nextCursor! }), /INVALID_CURSOR/);
  assert.equal(f.calls[0][2].readOnly, true);
});
test('stale mailbox references cannot read another message', async () => {
  const f = fixture(); f.setValidity(99n);
  await assert.rejects(f.service.read({ account: 'gmx', folder: 'INBOX', uidValidity: '77', uid: 1 }), /STALE_REFERENCE/);
  assert.equal(f.calls.some(c => c[0] === 'download'), false);
});
test('read fetches body structure and selected body only; attachment is separate', async () => {
  const f = fixture();
  const result = await f.service.read({ account: 'gmx', folder: 'INBOX', uidValidity: '77', uid: 1 });
  assert.equal(result.text, 'hello');
  assert.equal(result.attachments[0]?.part, '2');
  assert.deepEqual(f.calls.filter(c => c[0] === 'download').map(c => c[2]), ['1']);
  assert.equal(f.calls.find(c => c[0] === 'fetchOne')[2].source, undefined);
  assert.equal(f.calls.find(c => c[0] === 'download')[3].uid, true);
  assert.equal(f.calls.find(c => c[0] === 'download')[3].decodeText, false);
});
test('oversized MIME body is rejected before downloading', async () => {
  const f = fixture(); f.structure.childNodes[0]!.size = 11 * 1024 ** 2;
  await assert.rejects(f.service.read({ account: 'gmx', folder: 'INBOX', uidValidity: '77', uid: 1 }), /BODY_TOO_LARGE/);
  assert.equal(f.calls.some(c => c[0] === 'download'), false);
});
test('maximum-length Unicode filters still produce a usable cursor', async () => {
  const f = fixture();
  const query = { account: 'gmx' as const, folder: 'INBOX', subject: '漢'.repeat(512), text: '漢'.repeat(512), limit: 1 };
  const first = await f.service.search(query);
  assert.ok(first.nextCursor && first.nextCursor.length < 4096);
  const second = await f.service.search({ ...query, cursor: first.nextCursor! });
  assert.equal(second.messages[0]!.ref.uid, 2);
});
test('encoded wire size does not reject a small decoded attachment', async () => {
  const f = fixture();
  Object.assign(f.structure.childNodes[1]!, { encoding: 'base64', size: 22 * 1024 ** 2 });
  const result = await f.service.attachment({ account: 'gmx', folder: 'INBOX', uidValidity: '77', uid: 1 }, '2', 20 * 1024 ** 2);
  assert.equal(result.data.toString(), 'note');
});
