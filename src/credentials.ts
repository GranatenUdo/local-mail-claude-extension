import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import type { AccountId, Credentials } from './config.js';
import { MailError, minimalEnvironment } from './security.js';

export async function getCredentials(account: AccountId): Promise<Credentials> {
  if (process.platform !== 'win32' || !['gmx', 'proton'].includes(account) || !process.env.SystemRoot || !process.env.LOCALAPPDATA) throw new MailError('CREDENTIALS');
  const executable = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = fileURLToPath(new URL('../scripts/credentials.ps1', import.meta.url));
  return new Promise((resolve, reject) => {
    execFile(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', 'get', '-Account', account], {
      windowsHide: true, shell: false, timeout: 10000, maxBuffer: 32768,
      env: { ...minimalEnvironment(), LOCALAPPDATA: process.env.LOCALAPPDATA },
    }, (error, stdout) => {
      if (error) { reject(new MailError('CREDENTIALS')); return; }
      try {
        resolve(z.object({ username: z.string().min(1).max(512), password: z.string().min(1).max(4096) }).parse(JSON.parse(stdout)));
      } catch { reject(new MailError('CREDENTIALS')); }
    });
  });
}
