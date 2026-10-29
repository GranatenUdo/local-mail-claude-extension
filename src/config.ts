import { readFileSync } from 'node:fs';
import { X509Certificate, timingSafeEqual } from 'node:crypto';
import type { ImapFlowOptions } from 'imapflow';
import { z } from 'zod';
import { MailError } from './security.js';
export type AccountId = 'gmx' | 'proton';
export interface Credentials { username: string; password: string }
export interface AccountConfig { id: AccountId; host: string; port: number; secure: boolean; certificate?: string }
export interface Config { gmx?: AccountConfig; proton?: AccountConfig; downloadRoot?: string }
const bool = z.enum(['true', 'false']).default('false');
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  try {
    const input = z.object({ GMX_ENABLED: bool, GMX_REGION: z.enum(['net', 'com']).default('net'),
      PROTON_ENABLED: bool, PROTON_HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
      PROTON_PORT: z.coerce.number().int().min(1).max(65535).default(1143),
      PROTON_TLS: z.enum(['starttls', 'tls']).default('starttls'),
      PROTON_CERTIFICATE: z.string().optional(), DOWNLOAD_ROOT: z.string().optional(),
    }).parse(env);
    const config: Config = { downloadRoot: input.DOWNLOAD_ROOT || undefined };
    if (input.GMX_ENABLED === 'true') config.gmx = { id: 'gmx', host: `imap.gmx.${input.GMX_REGION}`, port: 993, secure: true };
    if (input.PROTON_ENABLED === 'true') {
      if (!input.PROTON_CERTIFICATE) throw new MailError('CONFIGURATION');
      config.proton = { id: 'proton', host: input.PROTON_HOST, port: input.PROTON_PORT,
        secure: input.PROTON_TLS === 'tls', certificate: input.PROTON_CERTIFICATE };
    }
    return config;
  } catch { throw new MailError('CONFIGURATION'); }
}
export function connectionOptions(account: AccountConfig, credentials: Credentials): ImapFlowOptions {
  const tls: NonNullable<ImapFlowOptions['tls']> = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (account.id === 'proton') {
    if (!['127.0.0.1', '::1'].includes(account.host) || !account.certificate) throw new MailError('CONFIGURATION');
    try {
      const pem = readFileSync(account.certificate);
      if (pem.length > 65536) throw new Error();
      const expected = new X509Certificate(pem).fingerprint256;
      tls.ca = pem;
      // CA validation stays enabled; hostname matching is replaced ONLY for this pinned loopback certificate.
      tls.checkServerIdentity = (_hostname, certificate) => {
        const actual = certificate.fingerprint256 ?? '';
        return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
          ? undefined : new Error('Bridge certificate mismatch');
      };
    } catch { throw new MailError('CONFIGURATION'); }
  } else if (!['imap.gmx.net', 'imap.gmx.com'].includes(account.host) || !account.secure || account.port !== 993) {
    throw new MailError('CONFIGURATION');
  }
  return { host: account.host, port: account.port, secure: account.secure,
    ...(account.secure ? {} : { doSTARTTLS: true }),
    tls, auth: { user: credentials.username, pass: credentials.password }, logger: false,
    disableAutoIdle: true, disableCompression: true, connectionTimeout: 15000, greetingTimeout: 15000,
    socketTimeout: 30000, maxLineLength: 1024 * 1024, maxLiteralSize: 1024 * 1024, maxResponseSize: 2 * 1024 * 1024,
  };
}
