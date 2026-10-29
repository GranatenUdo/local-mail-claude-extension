import { ImapFlow } from 'imapflow';
import { connectionOptions, type AccountId, type Config } from './config.js';
import { getCredentials } from './credentials.js';
import { MailError } from './security.js';
export type SessionRunner = <T>(account: AccountId, run: (client: ImapFlow) => Promise<T>) => Promise<T>;
const certificateCodes = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID', 'CERT_REVOKED', 'CERT_UNTRUSTED', 'CERT_REJECTED', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);
export function classifyConnectionError(error: unknown): MailError {
  if (error instanceof MailError) return error;
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; authenticationFailed?: unknown };
    if (typeof candidate.code === 'string' && certificateCodes.has(candidate.code)) return new MailError('TLS_CERTIFICATE');
    if (candidate.authenticationFailed === true) return new MailError('AUTHENTICATION');
  }
  return new MailError('CONNECTION');
}
export function sessionRunner(config: Config): SessionRunner {
  let active = 0;
  return async (id, run) => {
    const account = config[id];
    if (!account) throw new MailError('CONFIGURATION');
    if (active >= 2) throw new MailError('BUSY');
    active++;
    let client: ImapFlow | undefined; let timer: NodeJS.Timeout | undefined;
    try {
      const credentials = await getCredentials(id);
      client = new ImapFlow(connectionOptions(account, credentials));
      client.on('error', () => { /* No upstream errors are logged: they can include private server text. */ });
      const connection = client;
      return await Promise.race([
        (async () => {
          try { await connection.connect(); } catch (error) { throw classifyConnectionError(error); }
          return await run(connection);
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { connection.close(); reject(new MailError('TIMEOUT')); }, 60000); }),
      ]);
    } catch (error) { if (error instanceof MailError) throw error; throw new MailError('CONNECTION'); }
    finally { if (timer) clearTimeout(timer); client?.close(); active--; }
  };
}
