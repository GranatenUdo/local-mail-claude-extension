# Local Mail for Claude Desktop

[![Windows validation](https://github.com/GranatenUdo/local-mail-claude-extension/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/GranatenUdo/local-mail-claude-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Windows-only, local MCP extension for reading one GMX mailbox and one Proton Mail Bridge account. Search folders, read messages without marking them read, extract attachment text, and explicitly save attachments locally.

**Status:** early source release. GMX folder listing in Claude Desktop was user-confirmed with version 0.1.1 using standalone Node.js. Automated synthetic IMAP/TLS, Windows DPAPI, document parsing and MCP checks are provided. Remaining Desktop and live-account acceptance checks are tracked in [validation status](docs/validation.md); a public binary release is still pending.

## Privacy

Credentials are entered in a local masked PowerShell prompt and encrypted with Windows DPAPI for the current Windows user. They are not passed through Claude settings, environment variables, or chat. Email and extracted attachment text returned to Claude **become part of the Claude conversation**. Proton Bridge decrypts mail locally before this extension reads it. This does not keep that returned content end-to-end encrypted from Claude.

No SMTP, sending, deletion, flag changes, telemetry, or persistent mailbox cache. Downloads persist as ordinary files; use an encrypted destination if needed. [Security boundaries](SECURITY.md).

## Quick start

You need Windows, Git, Claude Desktop with custom extensions allowed, and **standalone Node.js 22.16 or newer**, installed and available on PATH. The Node installation must match the bundle architecture; the current candidate requires Windows x64 Node.js. There is no public binary release yet; build a local candidate from source.

In Claude Desktop, open **Settings → Extensions → Advanced settings** and turn **Use built-in Node.js for MCP** off. Restart Claude and open a new chat. This is an app-wide setting and also affects other Node-based MCP servers. Claude's built-in runtime blocks the Node subprocesses this extension uses for attachment extraction. Switching to standalone Node also resolved a reported GMX authentication failure without changing the saved credentials; this is not a universal explanation for login errors.

```powershell
git clone https://github.com/GranatenUdo/local-mail-claude-extension.git
cd local-mail-claude-extension
node --version
npm ci --ignore-scripts
npm run docs:check
npm run check
npm test
npm run package
npm run smoke:bundle
```

The candidate is written to `artifacts/local-mail-0.1.1-win32-x64.mcpb` on x64. Build outputs are ignored by Git. Follow [local setup](docs/setup.md) to save credentials and configure Claude Desktop.

In a new Claude chat, enable Local Mail and start with `list_accounts`, then `list_folders` for the configured account. Local validation does not replace the [Desktop installation checklist](docs/setup.md#desktop-installation-smoke-checklist).

## Tools

| Tool | Behavior |
| --- | --- |
| `list_accounts` | Lists enabled accounts without credentials |
| `list_folders` | Lists up to 1,000 folders |
| `search_messages` | One folder, sender/subject/body/date/unread filters, 25 results by default, max 100 |
| `read_message` | Headers, text, and attachment metadata, without changing read flags |
| `read_attachment` | TXT, CSV, JSON, text PDF, DOCX, XLSX text |
| `download_attachment` | Saves a selected attachment in the configured directory |

Search uses provider IMAP semantics and descending UID (mailbox arrival order, not the message's Date header). Cursors expire after 15 minutes or extension restart. References include mailbox identity to prevent reading the wrong message after a mailbox reset. Searches spanning many matches can hit the bounded IMAP response size; narrow the filters if a connection error occurs.

## Try it

These are example requests, not captured mailbox content:

- “Show unread mail in my GMX inbox.”
- “Find messages with ‘sample invoice’ in the subject.”
- “Read that message and extract the text from its PDF attachment.”
- “Save that attachment locally.”

Downloads write persistent files and should only be requested deliberately. Never paste credentials into chat. See the [tool reference](docs/reference.md) for input parameters and results.

## Attachment limits

- Body and extraction input: 10 MiB; download: 20 MiB (decoded bytes).
- Extracted output: 100,000 characters, with an explicit truncation flag.
- Office ZIP expansion: 50 MiB and 2,000 entries; XLSX: 10,000 populated cells.
- PDF: text only, up to 1,000 pages or the text limit. No OCR. Password-protected/malformed files return an extraction error.
- XLSX returns stored/cached values, not recalculated formula results. DOCX returns main-document paragraphs and tables, not every embedded object, header or comment.
- Parser deadline: 30 seconds; JavaScript heap limit: 256 MiB. These are resource controls, not a security sandbox.
- Unknown download types receive a `.bin` extension; files are never automatically opened.

## Documentation

| Guide | Start here when you want to… |
| --- | --- |
| [Setup and troubleshooting](docs/setup.md) | Install, configure, upgrade, or remove the extension |
| [Configuration and tools](docs/reference.md) | Understand settings, inputs, outputs, and limits |
| [Architecture](docs/architecture.md) | Follow the credential, mail, and attachment data flow |
| [Security](SECURITY.md) | Review trust boundaries or privately report a vulnerability |
| [Validation status](docs/validation.md) | See what has been tested and what remains pending |
| [Support](docs/support.md) | Ask for help without sharing private mailbox data |
| [Contributing](https://github.com/GranatenUdo/local-mail-claude-extension/blob/main/CONTRIBUTING.md) | Propose a change and run development checks |
| [Changelog](https://github.com/GranatenUdo/local-mail-claude-extension/blob/main/CHANGELOG.md) | Read the source-version history |

## Contributing

Small, focused improvements are welcome. Read [CONTRIBUTING](https://github.com/GranatenUdo/local-mail-claude-extension/blob/main/CONTRIBUTING.md) and [AGENTS.md](https://github.com/GranatenUdo/local-mail-claude-extension/blob/main/AGENTS.md) first. Every implementation change requires a plan, a separate agent's adversarial review, and explicit maintainer approval. Maintainers arrange that review; contributors need not operate an agent themselves. All fixtures and examples must be synthetic.

`npm run docs:check` validates tracked Markdown; `npm run check` checks types; `npm test` builds and runs synthetic tests. Windows CI also scans allowlisted source and available Git history, audits dependencies, and exercises the packaged server. No live provider credentials are used in CI.

## License

Original project code is available under the [MIT license](LICENSE). Third-party dependencies and the MCPB schema retain their own licenses.
