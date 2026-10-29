# Required planning and approval workflow

Before implementing any change, always draft a plan and have a separate agent adversarially review it. Resolve the review findings, then present the revised plan and any unresolved tradeoffs to the user for explicit approval. Do not implement until approval is received. Read-only exploration, drafting, and review may occur before approval. Material changes to an approved plan require the same review-and-approval sequence.

## graphify

- **graphify** (`~/.Codex/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
- When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

## Security invariants

- Read-only IMAP; no SMTP, STORE, MOVE, DELETE, APPEND, or EXPUNGE.
- No actual credentials, account certificates, messages, downloads, or local diagnostics in Git or bundles.
- Credentials use current-user Windows DPAPI, never Claude configuration or environment variables.
- Test fixtures must be synthetic. Public publication requires explicit file review and secret scanning.
