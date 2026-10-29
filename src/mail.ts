import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { convert } from 'html-to-text';
import iconv from 'iconv-lite';
import type { ImapFlow, MessageStructureObject, SearchObject, FetchMessageObject } from 'imapflow';
import type { AccountId, Config } from './config.js';
import { sessionRunner, type SessionRunner } from './connections.js';
import { refSchema, searchSchema, type MessageRef, type SearchInput } from './models.js';
import { boundedRead, LIMITS, MailError, textResult } from './security.js';

interface Part { part: string; type: string; filename: string; size?: number; charset?: string; encoding?: string; attachment: boolean }
function partsOf(node?: MessageStructureObject, depth = 0, output: Part[] = [], inheritedAttachment = false): Part[] {
  if (!node) return output;
  if (depth > 30 || output.length >= 2000) throw new MailError('TOO_LARGE');
  const filename = node.dispositionParameters?.filename || node.parameters?.name || '';
  const attachment = inheritedAttachment || node.disposition === 'attachment' || !!filename;
  if (node.childNodes?.length && !attachment) for (const child of node.childNodes) partsOf(child, depth + 1, output, attachment);
  else output.push({ part: node.part || '1', type: node.type.toLowerCase(), filename: filename.slice(0, 512),
    size: node.size, charset: node.parameters?.charset, encoding: node.encoding, attachment: attachment || !node.type.startsWith('text/') });
  return output;
}
function summary(message: FetchMessageObject, ref: MessageRef) {
  const addresses = (values: typeof message.envelope extends never ? never : any[] | undefined) =>
    (values || []).slice(0, 20).map(value => ({ name: String(value.name || '').slice(0, 256), address: String(value.address || '').slice(0, 512) }));
  return { ref, subject: (message.envelope?.subject || '').slice(0, 512), date: message.envelope?.date,
    from: addresses(message.envelope?.from), to: addresses(message.envelope?.to), unread: !message.flags?.has('\\Seen') };
}
export class MailService {
  private key = randomBytes(32);
  private run: SessionRunner;
  constructor(readonly config: Config, runner?: SessionRunner) { this.run = runner ?? sessionRunner(config); }
  accounts() { return (['gmx', 'proton'] as const).filter(id => this.config[id]).map(id => ({ id, configured: true })); }
  async folders(account: AccountId) {
    return this.run(account, async client => (await client.list()).slice(0, 1000)
      .map(folder => ({ path: folder.path, name: folder.name, selectable: !folder.flags.has('\\Noselect') })));
  }
  private sign(value: unknown) {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${body}.${createHmac('sha256', this.key).update(body).digest('base64url')}`;
  }
  private cursor(value: string): any {
    try {
      const [body, signature] = value.split('.');
      const expected = createHmac('sha256', this.key).update(body!).digest('base64url');
      if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error();
      const decoded = JSON.parse(Buffer.from(body!, 'base64url').toString());
      if (decoded.expires < Date.now()) throw new Error();
      return decoded;
    } catch { throw new MailError('INVALID_CURSOR'); }
  }
  async search(raw: SearchInput) {
    const input = searchSchema.parse(raw);
    const { cursor, limit, ...filters } = input;
    const identity = createHash('sha256').update(JSON.stringify(filters)).digest('hex');
    const previous = cursor ? this.cursor(cursor) : undefined;
    if (previous && previous.identity !== identity) throw new MailError('INVALID_CURSOR');
    return this.run(input.account, async client => {
      const mailbox = await client.mailboxOpen(input.folder, { readOnly: true });
      const validity = String(mailbox.uidValidity);
      if (previous && previous.validity !== validity) throw new MailError('STALE_REFERENCE');
      const upper = previous?.upper ?? Math.max(0, (mailbox.uidNext || 1) - 1);
      const end = previous ? Math.min(upper, previous.last - 1) : upper;
      if (end < 1) return { messages: [], nextCursor: null, order: 'descending UID (arrival order)' };
      const query: SearchObject = { uid: `1:${end}` };
      if (input.from) query.from = input.from;
      if (input.subject) query.subject = input.subject;
      if (input.text) query.body = input.text;
      if (input.since) query.since = new Date(input.since + 'T00:00:00Z');
      if (input.before) query.before = new Date(input.before + 'T00:00:00Z');
      if (input.unread !== undefined) query.seen = !input.unread;
      const found = await client.search(query, { uid: true });
      const uids = (found || []).filter(uid => uid >= 1 && uid <= end).sort((a, b) => b - a);
      const selected = uids.slice(0, limit);
      const fetched = selected.length ? await client.fetchAll(selected, { envelope: true, flags: true, uid: true }, { uid: true }) : [];
      const messages = fetched.filter(m => selected.includes(m.uid)).sort((a,b) => b.uid - a.uid)
        .map(message => summary(message, { account: input.account, folder: input.folder, uidValidity: validity, uid: message.uid }));
      const nextCursor = uids.length > limit ? this.sign({ identity, validity, upper, last: selected.at(-1), expires: Date.now() + 15 * 60000 }) : null;
      return { messages, nextCursor, order: 'descending UID (arrival order)', untrustedContent: true };
    });
  }
  private async message(client: ImapFlow, raw: MessageRef) {
    const ref = refSchema.parse(raw);
    const mailbox = await client.mailboxOpen(ref.folder, { readOnly: true });
    if (String(mailbox.uidValidity) !== ref.uidValidity) throw new MailError('STALE_REFERENCE');
    const message = await client.fetchOne(ref.uid, { envelope: true, flags: true, bodyStructure: true, uid: true }, { uid: true });
    if (!message || message.uid !== ref.uid) throw new MailError('NOT_FOUND');
    return message;
  }
  private async bytes(client: ImapFlow, ref: MessageRef, part: Part, limit: number) {
    // BODYSTRUCTURE counts encoded wire octets. Base64/QP sizes cannot enforce a decoded-byte budget.
    if (['7bit', '8bit', 'binary'].includes((part.encoding || '7bit').toLowerCase()) && part.size && part.size > limit) throw new MailError('TOO_LARGE');
    const download = await client.download(String(ref.uid), part.part, { uid: true, maxBytes: limit + 1, chunkSize: 65536, decodeText: false });
    if (!download.content) throw new MailError('NOT_FOUND');
    return await boundedRead(download.content, limit);
  }
  async read(raw: MessageRef) {
    const ref = refSchema.parse(raw);
    return this.run(ref.account, async client => {
      const message = await this.message(client, ref);
      const parts = partsOf(message.bodyStructure);
      const attachments = parts.filter(part => part.attachment);
      const body = parts.find(part => !part.attachment && part.type === 'text/plain') || parts.find(part => !part.attachment && part.type === 'text/html');
      let text = '';
      if (body) {
        let bytes: Buffer;
        try { bytes = await this.bytes(client, ref, body, LIMITS.body); }
        catch (error) { if (error instanceof MailError && error.code === 'TOO_LARGE') throw new MailError('BODY_TOO_LARGE'); throw error; }
        text = iconv.decode(bytes, iconv.encodingExists(body.charset || 'utf-8') ? body.charset || 'utf-8' : 'utf-8');
        if (body.type === 'text/html') text = convert(text, { wordwrap: false, limits: { maxInputLength: LIMITS.body, maxDepth: 30, maxChildNodes: 10000 },
          selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } }] });
      }
      return { ...summary(message, ref), ...textResult(text), attachments };
    });
  }
  async attachment(raw: MessageRef, requestedPart: string, limit: number) {
    const ref = refSchema.parse(raw);
    return this.run(ref.account, async client => {
      const message = await this.message(client, ref);
      const part = partsOf(message.bodyStructure).find(part => part.attachment && part.part === requestedPart);
      if (!part) throw new MailError('NOT_FOUND');
      return { data: await this.bytes(client, ref, part, limit), filename: part.filename || 'attachment.bin', contentType: part.type };
    });
  }
}
