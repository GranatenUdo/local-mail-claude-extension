# Approved implementation plan

Approved by the user on 2026-10-29 after an independent adversarial review and re-review resolved eight findings.

Build a Windows-only TypeScript stdio MCP extension for one GMX and one Proton Bridge account. Expose list_accounts, list_folders, search_messages, read_message, read_attachment, download_attachment. Never mutate mailboxes. Use EXAMINE and PEEK. No background sync, persistent mail cache, or telemetry.

Keep complete credentials encrypted using current-user Windows DPAPI beneath LOCALAPPDATA/LocalMailClaudeExtension with restricted ACLs. A masked local PowerShell setup script supports replacement/removal. A fixed helper returns credentials through a private pipe, never command arguments, environment variables, Claude settings, or logs. Memory and a compromised same-user session remain outside the at-rest protection boundary.

GMX uses .net/.com TLS port 993. Proton uses loopback, required STARTTLS or TLS, imported certificate exact SHA-256 pin verified before authentication, no plaintext fallback. Changed certificates require import again.

Messages use account/folder/UIDVALIDITY/UID references. Folder-local native IMAP search defaults to 25, max 100 results, descending UID arrival order. Cursor binds filters, folder, account, validity, upper UID and last UID. Fetch structure/headers separately and selected parts only. Body cap 10 MiB; output cap 100,000 characters.

Attachments: TXT/CSV/JSON/PDF text/DOCX paragraphs and tables/XLSX stored cell values. No macros, formula calculation, external requests, or OCR. Downloads 20 MiB, extraction input 10 MiB, Office expansion 50 MiB/2,000 entries, 10,000 cells, output 100,000 characters. Disposable parser processes get only attachment data and minimal environment; 30-second deadline and 256 MiB JS heap (not an OS sandbox). Downloads use generated exclusive names under a configured root's dedicated subdirectory; canonical-path and reparse-point checks. No automatic opening.

Publish public repository GranatenUdo/local-mail-claude-extension with synthetic fixtures only, allowlisted source and bundle files, scans and staged/history inspection. No license grant. Source publication after checks; bundle publication only after Claude Desktop installation smoke test. Live account tests not available must remain explicitly pending.

Required tests: authentication/TLS refusal/pins/reconnects/stale refs/concurrency/pagination changes; no mailbox writes or flag changes; malformed MIME and all supported extraction formats; stream bounds/ZIP bombs/crashes/timeouts/external-resource suppression; Windows unsafe paths/junctions/collisions; DPAPI replacement/removal/corruption/wrong-user failure; credential leak checks; Windows CI/bundle/MCP/installation checks.
