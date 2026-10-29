# Security and privacy boundaries

[Home](README.md) · [Setup](docs/setup.md) · [Validation](docs/validation.md)

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/GranatenUdo/local-mail-claude-extension/security/advisories/new).
Private reporting is enabled for this repository. Describe affected versions,
impact, and a minimal synthetic reproduction. Do not publish exploit details in
public issues while a report is being assessed.

Even private reports must not include actual credentials, mailbox messages,
attachments, account certificates, or local diagnostics. There is no guaranteed
response SLA. The project is an early source release; fixes target the current
source version, with no promise of maintenance for older versions.

Report security issues without including credentials, messages, account certificates, or private diagnostics. Do not open a public issue containing private mailbox data.

## Local credentials

The Windows-only helper encrypts the complete username/password payload with current-user DPAPI. It is stored outside the checkout with restricted ACLs. The fixed helper returns decrypted credentials through a private pipe directly to the local server. They are not stored in Claude settings, arguments, environment variables, logs, or parser IPC.

Passwords necessarily exist transiently in process memory. This does not defend against administrator access, malware running as the same Windows user, debugger/memory dumps, compromised dependencies, or an attacker modifying installed extension code. Parser subprocesses also run as the same Windows user: their heap and timeout limits are not an OS sandbox or protection against arbitrary code execution. Keep the operating system, Claude Desktop and dependencies updated.

## Mail and documents

GMX requires verified TLS and normal hostname validation, using Node's default roots plus Windows-trusted certificate authorities. This includes already trusted enterprise or antivirus mail-scanning roots; those intermediaries can inspect GMX traffic. The extension does not install certificates, change Windows trust, or alter global Node trust. Failure to load the trust store fails closed. Proton uses required TLS/STARTTLS on loopback with a locally imported exact certificate pin and does not inherit Windows roots; authentication cannot precede successful TLS validation. No global certificate-validation bypass is used.

Read-only mailboxes and PEEK fetches preserve flags. The extension has no sending or mailbox mutation tools. Mail and document text is labelled untrusted; prompt-injection defenses are guidance to the model, not a guarantee that a model cannot be influenced by malicious content. Users should review tool requests and avoid granting unrelated tools unnecessary access.

No remote images or external document references are fetched. PDF scripts, Office macros and spreadsheet formulas are not executed. Limits bound inputs, expanded Office ZIP bytes, outputs and parser runtime; the heap cap does not limit all native memory.

Returned content enters the Claude conversation and is subject to the user's Claude account data settings. There is no extension telemetry or persistent mailbox cache. OS swap/crash dumps and Proton Bridge's own local storage are outside this extension's control.

## Local files and distribution

Downloads use generated names under a dedicated local subdirectory, reject reparse-point traversal, and never overwrite or auto-open files. This prevents attacker-controlled email filenames from choosing paths. It does not defend against a compromised same-user process racing filesystem checks. Downloads remain ordinary persistent files and inherit storage encryption protection.

Only synthetic fixtures belong in Git. Packaging uses a first-party file allowlist and installed production dependency graph, excluding credential stores and development state. Public binary release requires a recorded Claude Desktop installation smoke test. Dependency licenses are preserved inside the bundle; original project code is licensed under [MIT](LICENSE).
