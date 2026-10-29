# Local Mail for Claude Desktop

A Windows-only, local MCP extension for reading one GMX mailbox and one Proton Mail Bridge account. Search folders, read messages without marking them read, extract attachment text, and explicitly save attachments locally.

**Status:** early source release. GMX folder listing in Claude Desktop was user-confirmed with version 0.1.1 using standalone Node.js. Automated synthetic IMAP/TLS, Windows DPAPI, document parsing and MCP checks are provided. Remaining Desktop and live-account acceptance checks are tracked in [validation status](docs/validation.md); a public binary release is still pending.

## Privacy

Credentials are entered in a local masked PowerShell prompt and encrypted with Windows DPAPI for the current Windows user. They are not passed through Claude settings, environment variables, or chat. Email and extracted attachment text returned to Claude **become part of the Claude conversation**. Proton Bridge decrypts mail locally before this extension reads it. This does not keep that returned content end-to-end encrypted from Claude.

No SMTP, sending, deletion, flag changes, telemetry, or persistent mailbox cache. Downloads persist as ordinary files; use an encrypted destination if needed. [Security boundaries](SECURITY.md).

## Build and install

Use Windows and **standalone Node.js 22.16 or newer**, installed and available on PATH. The Node installation must match the bundle architecture; the current candidate requires Windows x64 Node.js.

In Claude Desktop, open **Settings → Extensions → Advanced settings** and turn **Use built-in Node.js for MCP** off. Restart Claude and open a new chat. This is an app-wide setting and also affects other Node-based MCP servers. Claude's built-in runtime blocks the Node subprocesses this extension uses for attachment extraction. Switching to standalone Node also resolved a reported GMX authentication failure without changing the saved credentials; this is not a universal explanation for login errors.

```powershell
npm ci --ignore-scripts
npm test
npm run package
npm run smoke:bundle
```

The candidate is written to `artifacts/local-mail-0.1.1-win32-x64.mcpb` on x64. Build outputs are ignored by Git. Follow [local setup](docs/setup.md) to save credentials and configure Claude Desktop.

## Tools

| Tool | Behavior |
|---|---|
| `list_accounts` | Lists enabled accounts without credentials |
| `list_folders` | Lists up to 1,000 folders |
| `search_messages` | One folder, sender/subject/body/date/unread filters, 25 results by default, max 100 |
| `read_message` | Headers, text, and attachment metadata, without changing read flags |
| `read_attachment` | TXT, CSV, JSON, text PDF, DOCX, XLSX text |
| `download_attachment` | Saves a selected attachment in the configured directory |

Search uses provider IMAP semantics and descending UID (mailbox arrival order, not the message's Date header). Cursors expire after 15 minutes or extension restart. References include mailbox identity to prevent reading the wrong message after a mailbox reset. Searches spanning many matches can hit the bounded IMAP response size; narrow the filters if a connection error occurs.

Example requests: “Show unread mail in my GMX inbox.” “Read the latest message from this sender.” “Read its invoice PDF.” “Save attachment 2 locally.” Never paste credentials into chat.

## Attachment limits

- Body and extraction input: 10 MiB; download: 20 MiB (decoded bytes).
- Extracted output: 100,000 characters, with an explicit truncation flag.
- Office ZIP expansion: 50 MiB and 2,000 entries; XLSX: 10,000 populated cells.
- PDF: text only, up to 1,000 pages or the text limit. No OCR. Password-protected/malformed files return an extraction error.
- XLSX returns stored/cached values, not recalculated formula results. DOCX returns main-document paragraphs and tables, not every embedded object, header or comment.
- Parser deadline: 30 seconds; JavaScript heap limit: 256 MiB. These are resource controls, not a security sandbox.
- Unknown download types receive a `.bin` extension; files are never automatically opened.

## Development

Read [AGENTS.md](AGENTS.md) first. Every implementation change requires a plan, a separate agent's adversarial review, and user approval. The initial approved scope is recorded in [the plan](docs/approved-plan.md).

`npm run check` checks types; `npm test` builds and runs synthetic tests; `npm run scan` enforces source allowlists and checks common secret patterns in files and Git history. Windows CI also validates and exercises the packaged server. No live provider credentials are used in CI.

No license is granted for this repository's original code at this time. Third-party dependencies and the MCPB schema retain their own licenses.
