# Validation status

This file distinguishes automated validation from interactive/live acceptance. Do not treat pending checks as passing.

## Automated

- Windows DPAPI encryption/read/replace/remove and corrupted ciphertext rejection.
- Synthetic IMAP over TLS and STARTTLS: certificate validation before AUTH, wrong certificate and downgrade refusal, authentication errors, EXAMINE/PEEK requests.
- Stable UID pagination, Unicode filters, stale message references, selected-part fetches and decoded-byte limits.
- TXT/CSV/JSON/PDF/DOCX/XLSX extraction, malformed files, entity declarations, ZIP expansion and text limits.
- MCP schema/tool behavior, error redaction and local-file side-effect annotations.
- Generated download filenames, exclusive creation and junction rejection.

Run `npm test` for current results; CI is the reproducible verification source.

## Pending before public binary release

- Interactive installation/configuration/tool permissions in Claude Desktop.
- Wrong-Windows-user DPAPI decryption test (requires a second Windows identity; current-user and corrupted-store tests are automated).
- Real GMX and Proton Bridge account acceptance, including unread flags and real Bridge certificate renewal.

The public repository may contain reviewed source while these remain pending. Do not upload a release `.mcpb` until the Desktop installation checklist in setup.md is completed. Live provider checks must be reported separately even then.
