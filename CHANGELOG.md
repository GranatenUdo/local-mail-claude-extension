# Changelog

This records source changes, not published binary releases. Version 0.1.1 remains
an early source release; see [validation status](docs/validation.md) for acceptance
gates. Dates below come from repository history.

## Unreleased

- Adopt MIT licensing for original project code and include it in local bundles.
- Improve installation navigation, architecture, configuration/tool reference,
  support, contribution guidance, and privacy-conscious issue/PR templates.
- Add offline documentation checks, weekly dependency proposals, pinned workflow
  actions, and full available-history scanning in CI.
- Validate license metadata and documentation links in packaged candidates.

## 0.1.1 — source version — 2026-10-29

- Add GMX-scoped Windows certificate trust while retaining hostname validation
  and Proton's separate exact certificate pin.
- Distinguish static TLS, authentication, and trust-store errors without exposing
  provider diagnostics.
- Document the required standalone Node runtime and user-confirmed GMX
  folder-listing retry after disabling Claude's built-in runtime.

Source changes: [GMX trust fix](https://github.com/GranatenUdo/local-mail-claude-extension/commit/0b06289)
and [setup clarification](https://github.com/GranatenUdo/local-mail-claude-extension/commit/37df861).

## 0.1.0 — source version — 2026-10-29

- Introduce six read-only-mail/local-download MCP tools, Windows DPAPI credential
  storage, bounded document extraction, and allowlisted MCPB packaging.
- Add synthetic tests and Windows CI.
- Correct Windows short-path handling and credential test diagnostics; restrict
  helper module discovery to built-in PowerShell modules.

Source changes: [initial implementation](https://github.com/GranatenUdo/local-mail-claude-extension/commit/5e34aaa),
[Windows CI fixes](https://github.com/GranatenUdo/local-mail-claude-extension/commit/203281b),
and [helper isolation](https://github.com/GranatenUdo/local-mail-claude-extension/commit/18a8215).
