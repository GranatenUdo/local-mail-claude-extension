# Contributing

Thanks for helping make local mail access easier to understand and maintain.
Start with the [README](README.md), [architecture](docs/architecture.md), and
[security boundaries](SECURITY.md).

## Propose before implementing

Follow [AGENTS.md](AGENTS.md) for every implementation change:

1. Describe the problem, proposed behavior, and validation plan in an issue.
2. Maintainers arrange a separate agent's adversarial review of the plan and
   resolve its findings.
3. Wait for explicit maintainer approval of the revised plan before implementing.
4. Material changes to the approved plan require the same review and approval.

Contributors do not need to purchase or operate an agent. Read-only investigation
and proposals are welcome before approval. Dependency-update PRs are automated
proposals, not permission to merge; maintainers apply the same review policy.

Keep PRs focused. Do not add SMTP or mailbox mutation operations, credentials in
configuration/environment variables, telemetry, or real mailbox fixtures.
For security issues, use [private reporting](SECURITY.md#reporting-a-vulnerability).

## Development setup

Use Windows with standalone Node.js 22.16 or newer and Git. The bundle is built
for the current Node architecture; x64 is the currently documented candidate.
Claude Desktop and live accounts are unnecessary for automated tests.

Fork and clone the repository, create a topic branch, then run:

```powershell
npm ci --ignore-scripts
npm run check
npm test
```

Tests create synthetic mail, documents, certificates, and temporary DPAPI stores.
Do not redirect them to your actual credential store. Live acceptance is separate
and must never put private data into Git, CI, or a bundle.

## Validation before a PR

Review new files and stage only intended changes before running documentation and
source checks. They use Git's tracked-file list, which includes newly staged files;
untracked Markdown is not included. Checks read the current working-tree contents,
so stage again after any edits.

```powershell
npm run docs:check
npm run check
npm test
npm audit --audit-level=high
npm run scan
npm run package
npm run smoke:bundle
git diff --cached --check
```

- `docs:check` lints tracked Markdown and validates local file links and GitHub
  heading anchors offline. Use Markdown links and headings rather than HTML
  anchors. External URLs are reviewed manually, not fetched by this check.
- `test` builds first, then runs synthetic tests, including local documentation
  link-checker cases. The timeout test intentionally takes about 30 seconds.
- `scan` enforces source allowlists and checks common secret patterns in source,
  staged files, and available Git history. It does not prove absence of all secrets
  or inspect unreachable/deleted remote objects. Manual file review remains required.
- `package` validates the manifest and creates a local candidate and inventory.
- `smoke:bundle` checks inventory hashes, license metadata, bundled documentation
  links, the packaged MCP server, and parser/PDF runtime.

Markdown linting allows long lines for readable tables and prose. Development-only
overrides pin patched `re2js` and `katex` under `markdownlint`; review them when
updating the linter. Do not bypass the audit gate to update dependencies.

## Documentation and release discipline

Keep setup instructions in [setup](docs/setup.md), tool details in
[reference](docs/reference.md), and acceptance evidence in
[validation](docs/validation.md). Avoid claiming pending checks passed. Update
[CHANGELOG](CHANGELOG.md) under Unreleased for user-visible changes.

Add newly approved root files to the source scanner's explicit allowlist.
Bundle only intended user documentation and runtime files; use repository URLs
for contributor/history documents excluded from bundles. Preserve third-party
license notices.

Before public source publication, review the exact staged files and run the
secret scan. Do not upload a binary until the Desktop installation checklist is
recorded complete; report live provider acceptance separately.

## PR checklist

Use the PR template to link the approved plan and review, explain the change,
and report tests with any limitations. Confirm that all fixtures are synthetic
and the staged diff contains no local diagnostics or private data.
Contributions are made under the project's [MIT license](LICENSE).
