# Configuration and tool reference

[Home](../README.md) · [Setup](setup.md) · [Architecture](architecture.md)

This describes source version 0.1.1. Configure settings in Claude Desktop after
completing [local setup](setup.md). Credentials are handled by the local
PowerShell helper, never these settings.

## Configuration

| Setting key | Default | Accepted value / purpose |
| --- | --- | --- |
| `gmx_enabled` | `false` | Enable GMX after saving credentials |
| `gmx_region` | `net` | `net` or `com`; selects the fixed GMX IMAP host |
| `proton_enabled` | `false` | Enable Proton after Bridge setup |
| `proton_host` | `127.0.0.1` | `127.0.0.1` or `::1` only |
| `proton_port` | `1143` | Integer 1–65535; match Bridge's IMAP port |
| `proton_tls` | `starttls` | `starttls` or `tls`; match Bridge |
| `proton_certificate` | Empty | Local exported public PEM certificate; required when Proton is enabled |
| `download_root` | Empty | Existing local directory; required only for downloads |

Restart the extension after configuration changes. Invalid settings fail with
`CONFIGURATION`; disabled accounts are not listed. The manifest maps these keys
to uppercase environment names (`GMX_ENABLED`, etc.); those are non-secret
configuration, not a way to pass credentials.

## Tool inputs and results

All input objects reject unknown properties. The account ID is `gmx` or `proton`.
MCP results contain JSON serialized in a text content block. Operation failures
use `isError: true` and `{"error":{"code":"…","message":"…"}}`; schema validation
errors are handled by the MCP layer. Raw provider diagnostics are not returned.

| Tool | Input | Result |
| --- | --- | --- |
| `list_accounts` | `{}` | `accounts` array of enabled account IDs and `configured: true` |
| `list_folders` | `account` | Array of `path`, `name`, and `selectable` values |
| `search_messages` | `account` plus optional filters below | `messages`, `nextCursor`, and `order`; each summary includes a `ref` |
| `read_message` | `ref` | Summary, body `text`, `truncated`, `untrustedContent`, and attachment metadata |
| `read_attachment` | `ref`, `part` | Extracted `text`, `truncated`, and `untrustedContent` |
| `download_attachment` | `ref`, `part` | Local `path`, decoded `bytes`, and `persisted: true` |

`configured: true` means an account is enabled in settings, not that authentication
has been tested. Only `download_attachment` is annotated as a non-idempotent local
write. Mail reads preserve message flags.

### Search filters

| Field | Default / constraint |
| --- | --- |
| `folder` | `INBOX`; 1–512 characters, no control characters |
| `from`, `subject`, `text` | Optional strings, up to 512 characters each; `text` searches the body |
| `since`, `before` | Optional ISO dates, `YYYY-MM-DD`; provider IMAP date semantics |
| `unread` | Optional boolean; omit for either read state |
| `limit` | 25 by default; integer 1–100 |
| `cursor` | Opaque pagination token, maximum 4,096 characters |

Search uses provider IMAP semantics and descending UID (arrival order), not
Date-header order. For the next page, preserve account, folder, and filters and
pass `nextCursor` back as `cursor`. A null cursor means no next page. Cursors
expire after 15 minutes or restart; new arrivals are excluded from that pagination
window. Very broad searches can exceed bounded IMAP response sizes; narrow filters.

Synthetic input example:

```json
{
  "account": "gmx",
  "folder": "INBOX",
  "subject": "sample invoice",
  "unread": true,
  "limit": 10
}
```

### Message and attachment references

Use the returned `ref` unchanged. It contains `account`, `folder`,
`uidValidity` (a decimal string), and `uid` (a positive integer). If the mailbox
identity changes, search again rather than constructing a replacement reference.

For attachments, copy the `part` identifier from `read_message` metadata.
It is a MIME part such as `2` or `1.2`, not the attachment's display position.
Metadata includes type, filename, and possibly wire size; limits are enforced on
decoded bytes. Filenames and all mail content are untrusted.

## Resource and format limits

| Resource | Limit / behavior |
| --- | --- |
| Folders returned | 1,000 |
| Message body / extraction input | 10 MiB of decoded bytes |
| Attachment download | 20 MiB of decoded bytes |
| Body / extracted text output | 100,000 characters; explicit truncation flag |
| Office ZIP expansion | 50 MiB and 2,000 entries |
| XLSX | 10,000 populated cells; stored/cached values, no recalculation |
| DOCX | Main-document paragraphs and tables; not every embedded object, header, or comment |
| PDF | Text only, up to 1,000 pages or the text limit; no OCR |
| Parser | 30-second deadline, 256 MiB JavaScript heap; not an OS sandbox |
| Concurrency | At most two mail sessions and two extraction processes |
| Download filenames | Generated names; unknown types receive `.bin`; no overwrite or automatic opening |

Malformed or encrypted documents may fail extraction. Supported extensions are
TXT, CSV, JSON, PDF, DOCX, and XLSX. See [troubleshooting](setup.md#troubleshooting)
for safe responses to errors.
