# Implementation ledger

Plan: docs/approved-plan.md

- Bootstrap: empty dedicated project, no existing Git history or files. Initialize in place on implementation branch; no existing checkout requires isolation.
- Pre-flight: credential store feeds mail connection only; parser processes never receive credentials. MCP accepts validated references and filters, not endpoints or credential inputs. Packaging consumes compiled output with an explicit allowlist.
- Authorization: user explicitly approved implementation and public GitHub publication. No additional publication permission is required.
- Credential boundary: tested real current-user DPAPI in a generated temporary directory. Fixed PowerShell 5.1 null-string replacement and ACL access-section handling; the helper uses process-scoped execution-policy bypass without changing system policy. Wrong-user test remains manual.
- Mail boundary: synthetic TLS and STARTTLS servers verify pin-before-auth, downgrade refusal, authentication rejection, EXAMINE/PEEK-only reading and per-operation connections. Byte bounds apply to decoded streams; encoded metadata cannot reject valid base64/QP data.
- Extraction boundary: supported formats tested with generated data, malformed archives, DOCTYPE rejection, expanded-size cap, output cap; workers tested for environment isolation, crashes, excess output, 30-second timeout and concurrency limit.
- Independent implementation review found two P2 defects (Unicode cursor length; encoded wire-size rejection). Both reproduced as failing tests, corrected and passed. No additional P1 finding or source-publication blocker. Staged-blob scanning added following packaging review.
- Packaging ruling: use MCPB's published JSON schema with AJV, not its CLI dependency tree, because the latter introduced vulnerable dev dependencies. Dependency audit is now clean. Preserve schema license and runtime dependency licenses.
- Validation boundary: packaged stdio MCP, parser and PDF runtime tested separately from Claude Desktop installation. Installed Desktop detected, but native UI control is unavailable in this session. Do not claim interactive installation or live-account acceptance; withhold public bundle release.
- 0.1.1 follow-up: direct TLS diagnostics isolated GMX certificate trust; strict validation plus Windows trust authenticated successfully without fetching mail. User approved the reviewed fix. Added GMX-scoped default/system trust, static connection-stage errors, synthetic CA/hostname/Proton-isolation regressions and versioned candidate packaging. No user certificate or credentials enter source or artifacts.
