import { start } from './server.js';
start().catch(() => { process.stderr.write('Local Mail could not start. Check extension configuration.\n'); process.exitCode = 1; });
