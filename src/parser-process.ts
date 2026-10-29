import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LIMITS, MailError, minimalEnvironment, boundedRead } from './security.js';
let running = 0;
export async function extractInProcess(data: Buffer, filename: string): Promise<{ text: string; truncated: boolean; untrustedContent: true }> {
  if (data.length > LIMITS.extraction) throw new MailError('TOO_LARGE');
  if (running >= 2) throw new MailError('BUSY');
  running++;
  // Only a known extension is passed as an argument, never the provider-controlled filename.
  const extension = path.extname(filename).toLowerCase();
  if (!['.txt', '.csv', '.json', '.pdf', '.docx', '.xlsx'].includes(extension)) { running--; throw new MailError('UNSUPPORTED'); }
  const worker = fileURLToPath(new URL('./parser-worker.js', import.meta.url));
  const child = spawn(process.execPath, ['--max-old-space-size=256', worker, `input${extension}`], {
    stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, shell: false, env: minimalEnvironment(),
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    child.stdin.on('error', () => {});
    const exit = new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', () => reject(new MailError('EXTRACTION'))); });
    const output = boundedRead(child.stdout, LIMITS.output * 6 + 4096);
    child.stdin.end(data);
    const result = await Promise.race([
      Promise.all([exit, output]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { child.kill(); reject(new MailError('TIMEOUT')); }, LIMITS.timeout); }),
    ]);
    let parsed: any;
    try { parsed = JSON.parse(result[1].toString()); } catch { throw new MailError('EXTRACTION'); }
    if (result[0] !== 0 || parsed.error) throw new MailError(parsed.error?.code === 'TOO_LARGE' ? 'TOO_LARGE' : 'EXTRACTION');
    if (typeof parsed.text !== 'string' || parsed.text.length > LIMITS.output || typeof parsed.truncated !== 'boolean') throw new MailError('EXTRACTION');
    return { text: parsed.text, truncated: parsed.truncated, untrustedContent: true };
  } finally { if (timer) clearTimeout(timer); child.kill(); running--; }
}
