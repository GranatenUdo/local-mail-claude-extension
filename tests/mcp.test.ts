import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { MailService } from '../src/mail.js';
test('MCP exposes six tools, no secret inputs, safe errors and file-write annotations', async () => {
  const server = createServer(new MailService({}));
  const client = new Client({ name: 'synthetic-test', version: '1' });
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 6);
    assert.equal(JSON.stringify(tools.map(t => t.inputSchema)).includes('password'), false);
    assert.equal(tools.find(t => t.name === 'download_attachment')?.annotations?.readOnlyHint, false);
    const accounts = await client.callTool({ name: 'list_accounts', arguments: {} });
    assert.equal((accounts.content as any[])[0].text, '{"accounts":[]}');
    const error = await client.callTool({ name: 'list_folders', arguments: { account: 'gmx' } });
    assert.equal(error.isError, true);
    assert.match((error.content as any[])[0].text, /CONFIGURATION/);
  } finally { await client.close(); await server.close(); }
});
