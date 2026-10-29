import type { Readable } from 'node:stream';
export const LIMITS = { body: 10 * 1024 ** 2, extraction: 10 * 1024 ** 2, download: 20 * 1024 ** 2,
  expanded: 50 * 1024 ** 2, entries: 2000, cells: 10000, output: 100000, timeout: 30000 } as const;
const messages = {
  CONFIGURATION: 'Check local extension settings.', CREDENTIALS: 'Run local credential setup; the credential store is missing or unreadable.',
  CONNECTION: 'Mail connection failed. Check provider availability, credentials and TLS settings.',
  TLS_CERTIFICATE: 'Mail server certificate validation failed. For GMX, check Windows trusted certificates and any mail-scanning software. For Proton, verify the imported Bridge certificate.',
  AUTHENTICATION: 'The mail provider rejected authentication. Check IMAP access and the saved login or app password.',
  TRUST_STORE: 'Windows trusted certificates could not be loaded. Check the Windows certificate store and use a Claude Desktop Node runtime supporting tls.getCACertificates (Node 22.16 or newer).',
  TOO_LARGE: 'Content exceeds the allowed byte limit.', BODY_TOO_LARGE: 'Message body exceeds 10 MiB.',
  NOT_FOUND: 'The requested message or part no longer exists.', STALE_REFERENCE: 'Mailbox identity changed; search again.',
  INVALID_CURSOR: 'Search cursor is invalid or expired; search again.', UNSAFE_PATH: 'Download directory is unsafe or unavailable.',
  UNSUPPORTED: 'This attachment format cannot be extracted. Download it instead.',
  EXTRACTION: 'Document is malformed, encrypted, scanned, or cannot be extracted.',
  TIMEOUT: 'Operation exceeded its time limit.', INTERNAL: 'Operation failed; no private diagnostic data is returned.',
  BUSY: 'Too many operations are in progress. Try again shortly.',
} as const;
export class MailError extends Error {
  constructor(public code: keyof typeof messages) { super(code); }
}
export function safeError(error: unknown) {
  const code = error instanceof MailError ? error.code : 'INTERNAL';
  return { error: { code, message: messages[code] } };
}
export async function boundedRead(stream: Readable, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  try {
    for await (const value of stream) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.length;
      if (size > limit) throw new MailError('TOO_LARGE');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
  } finally { if (!stream.destroyed) stream.destroy(); }
}
export function minimalEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (source[key]) result[key] = source[key];
  return result;
}
export function textResult(text: string, extra: Record<string, unknown> = {}) {
  return { text: text.slice(0, LIMITS.output), truncated: text.length > LIMITS.output, untrustedContent: true, ...extra };
}
