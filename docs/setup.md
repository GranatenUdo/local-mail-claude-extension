# Local setup on Windows

## 1. Save credentials locally

From the source checkout, inspect the scripts, then run either or both commands in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\credentials.ps1 -Action setup -Account gmx
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\credentials.ps1 -Action setup -Account proton
```

The username and password are prompted locally; the password is masked. For Proton, enter **Bridge's IMAP username and password**, not your normal Proton password. Setup encrypts the complete credential payload under `%LOCALAPPDATA%\LocalMailClaudeExtension` and restricts directory access to the current user. Repeat setup to replace credentials.

The process-scoped `ExecutionPolicy Bypass` is needed on systems where unsigned scripts are otherwise disabled. It changes no persistent execution policy. Organization-enforced policies may still block it; the extension fails with a credential error in that case. Do not weaken organization policy to install it.

The bundled helper uses the same local store. Users installing a candidate without a source checkout can extract the `.mcpb` ZIP into a trusted local directory and run its `scripts\credentials.ps1` there. Do not run scripts received as email attachments.

Remove stored credentials with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\credentials.ps1 -Action remove -Account gmx
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\credentials.ps1 -Action remove -Account proton
```

Removal deletes the stored ciphertext; it is not a forensic secure erase. Removing the extension does not automatically remove this store or saved attachments.

## 2. Configure the providers

### GMX

Enable POP3/IMAP access in GMX's settings. With two-factor authentication, use a GMX app password where required. Select `net` for German GMX (`imap.gmx.net`) or `com` for international GMX (`imap.gmx.com`). Both use verified TLS on port 993.

Version 0.1.1 adds Windows-trusted certificate authorities to Node's default trust for GMX only. This supports local antivirus mail scanners whose root certificates are already trusted by Windows; those scanners can inspect the connection. Hostname and certificate validation remain enabled. No certificate is installed or trusted automatically by this extension. Proton continues using only its imported certificate and exact pin.

### Proton

Install and sign into [Proton Mail Bridge](https://proton.me/mail/bridge); a paid Proton plan is required. Bridge must remain running and signed in. Choose combined-address mode for a single account unless you specifically want only one address from split mode.

Copy the IMAP loopback address, port and TLS mode from Bridge. Export Bridge's **public certificate** through its certificate settings and keep the PEM file locally. Configure that file in the extension. Do not provide a private key or install blanket certificate exceptions.

The extension accepts only `127.0.0.1` or `::1`, and `starttls` or `tls`. It verifies the certificate chain using your imported certificate and requires an exact certificate fingerprint match before authenticating. When Bridge regenerates its certificate, verify and re-export it locally; reconnecting with an old pin must fail.

## 3. Install the candidate in Claude Desktop

In Claude Desktop's extension settings, use the advanced/developer **Install Extension** action to select the `.mcpb`. Menu placement depends on the Desktop version. Organizations may prohibit custom extensions.

Enable the accounts you configured. Set the GMX region and/or Proton loopback settings and certificate. Choose an existing, local attachment directory if downloads are wanted; the extension creates `LocalMailAttachments` inside it. Network shares and paths involving junctions/symlinks are rejected.

No password field exists in Claude's extension configuration. Restart the extension after changing settings. First call `list_accounts`, then list folders and search one account.

## Troubleshooting

- `CONFIGURATION`: check enable flags, region (`net`/`com`), Bridge loopback/port/mode/certificate, and download directory.
- `CREDENTIALS`: run local setup as the same Windows user as Claude. A store copied from another user/machine, corrupted data, or blocked PowerShell policy cannot be read.
- `CONNECTION`: confirm provider availability, IMAP/app-password access, Bridge sign-in, and certificate. Raw provider errors are deliberately not returned because they may contain private data. Very broad searches may exceed response bounds; narrow filters.
- `TLS_CERTIFICATE`: certificate-chain or hostname validation failed before authentication. For GMX, check Windows certificate trust and mail-scanning software. For Proton, check the exported Bridge certificate. Never disable certificate verification to resolve it.
- `AUTHENTICATION`: the provider rejected login; check IMAP access and the saved login/app password.
- `TRUST_STORE`: the Windows certificate store could not be loaded, or Claude's Node runtime lacks the required API. The extension fails closed. Update Claude Desktop to a runtime supporting `tls.getCACertificates` (Node 22.16 or newer) and check the Windows certificate store.
- `STALE_REFERENCE` / `INVALID_CURSOR`: search again.
- `TOO_LARGE` / `BODY_TOO_LARGE`: the byte limit was exceeded. Narrow the requested content or use your mail client.
- `EXTRACTION`: unsupported document structure, malformed/encrypted document, or PDF without extractable text. Download supported-size files for manual inspection.
- `UNSAFE_PATH`: use a normal existing local directory with no reparse points in its path.
- `BUSY`: wait for existing requests; there are at most two concurrent mail sessions and two extraction processes.

## Desktop installation smoke checklist

Record Desktop version, Windows architecture, Node runtime version and pass/fail without private data. Verify installation, configuration rendering, disabled-account startup, `list_accounts`, tool consent labels, and local credential setup/replacement/removal. Confirm no passwords appear in settings, logs, manifest, or bundle. Verify with a synthetic credential first. A packaged stdio test alone does not satisfy this checklist.

Live-account acceptance additionally requires GMX and Proton folder/search/read operations, known unread flags unchanged, a supported attachment read/download, and rejection after replacing the Bridge certificate. Never publish actual mail, credentials or account certificates as evidence.
