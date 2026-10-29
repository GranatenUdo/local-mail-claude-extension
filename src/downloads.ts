import { lstat, realpath, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { LIMITS, MailError } from './security.js';
export async function assertSafeDirectory(directory: string): Promise<void> {
  if (!path.isAbsolute(directory) || directory.startsWith('\\\\')) throw new MailError('UNSAFE_PATH');
  let current = path.resolve(directory);
  while (true) {
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new MailError('UNSAFE_PATH');
    const canonical = await realpath(current);
    if (canonical.toLowerCase() !== current.toLowerCase()) throw new MailError('UNSAFE_PATH');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export async function saveDownload(root: string, originalName: string, content: Buffer): Promise<string> {
  if (content.length > LIMITS.download) throw new MailError('TOO_LARGE');
  try {
    await assertSafeDirectory(root);
    const directory = path.join(path.resolve(root), 'LocalMailAttachments');
    await mkdir(directory, { recursive: true });
    await assertSafeDirectory(directory);
    const ext = path.extname(originalName).toLowerCase();
    const extension = ['.txt', '.csv', '.json', '.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg'].includes(ext) ? ext : '.bin';
    const destination = path.join(directory, `${randomUUID()}${extension}`);
    const handle = await open(destination, 'wx', 0o600);
    try { await handle.writeFile(content); } finally { await handle.close(); }
    return destination;
  } catch (error) { if (error instanceof MailError) throw error; throw new MailError('UNSAFE_PATH'); }
}
