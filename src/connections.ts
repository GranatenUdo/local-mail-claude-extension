import { ImapFlow } from 'imapflow';
import { connectionOptions, type AccountId, type Config } from './config.js';
import { getCredentials } from './credentials.js';
import { MailError } from './security.js';
export type SessionRunner = <T>(account: AccountId, run: (client: ImapFlow) => Promise<T>) => Promise<T>;
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
        (async () => { await connection.connect(); return await run(connection); })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { connection.close(); reject(new MailError('TIMEOUT')); }, 60000); }),
      ]);
    } catch (error) { if (error instanceof MailError) throw error; throw new MailError('CONNECTION'); }
    finally { if (timer) clearTimeout(timer); client?.close(); active--; }
  };
}
