import { extractBuffer } from './extraction.js';
import { boundedRead, LIMITS, safeError } from './security.js';
// This process has no credentials or inherited NODE_OPTIONS. No parser needs network access.
globalThis.fetch = async () => { throw new Error('Network disabled in parser'); };
try {
  const input = await boundedRead(process.stdin, LIMITS.extraction);
  const result = await extractBuffer(input, process.argv[2] || 'attachment.bin');
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify(safeError(error)));
  process.exitCode = 1;
}
