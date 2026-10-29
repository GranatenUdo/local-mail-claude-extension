# Validation status

[Home](../README.md) · [Setup checklist](setup.md#desktop-installation-smoke-checklist) · [Security](../SECURITY.md)

This file distinguishes automated validation from interactive/live acceptance. Do not treat pending checks as passing.

## Automated

- Windows DPAPI encryption/read/replace/remove and corrupted ciphertext rejection.
- Synthetic IMAP over TLS and STARTTLS: certificate validation before AUTH, wrong certificate and downgrade refusal, authentication errors, EXAMINE/PEEK requests.
- Stable UID pagination, Unicode filters, stale message references, selected-part fetches and decoded-byte limits.
- TXT/CSV/JSON/PDF/DOCX/XLSX extraction, malformed files, entity declarations, ZIP expansion and text limits.
- MCP schema/tool behavior, error redaction and local-file side-effect annotations.
- Generated download filenames, exclusive creation and junction rejection.

Run `npm test` for current results; CI is the reproducible verification source.

## User-confirmed Desktop check — 2026-10-29

- Extension 0.1.1 was installed in Claude Desktop on Windows. The inspected Desktop version was 4.4212.0.0; installed standalone Node was 26.13.0.
- The installed extension authenticated and listed GMX folders successfully through a separate standalone-Node MCP test, without fetching message bodies.
- Claude's built-in runtime returned `AUTHENTICATION`. After disabling **Use built-in Node.js for MCP**, restarting Claude, and retrying `list_folders` for `gmx`, the user confirmed that it worked. No credential replacement was needed.
- This confirms the reported folder-listing retry, not all message, attachment, or security acceptance scenarios. The runtime switch resolved this reported failure; its precise authentication mechanism remains unisolated. The built-in runtime's separate subprocess restriction is incompatible with attachment extraction.

## Pending before public binary release

- Remaining Desktop installation checklist items, including configuration rendering, disabled-account startup, tool permissions, and credential lifecycle checks in the Desktop environment. The folder-listing confirmation above does not mark these all complete.
- Wrong-Windows-user DPAPI decryption test (requires a second Windows identity; current-user and corrupted-store tests are automated).
- Real GMX message search/read, attachment read/download, and unchanged unread flags in Claude Desktop.
- Real Proton Bridge account acceptance, including folder/search/read, attachments, unread flags, and certificate renewal.

The public repository may contain reviewed source while these remain pending. Do not upload a release `.mcpb` until the Desktop installation checklist in setup.md is completed. Live provider checks must be reported separately even then.
