$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../scripts/CredentialStore.ps1"
$password = ConvertTo-SecureString 'synthetic-test-password-901' -AsPlainText -Force
Save-MailCredential -Account gmx -Username 'synthetic@example.invalid' -Password $password
$actual = Read-MailCredential -Account gmx | ConvertFrom-Json
if ($actual.password -ne 'synthetic-test-password-901') { throw 'Roundtrip failed' }
$file = Join-Path (Get-MailStore) 'gmx.dpapi'
$raw = [IO.File]::ReadAllBytes($file)
if ([Text.Encoding]::UTF8.GetString($raw).Contains('synthetic')) { throw 'Plaintext persisted' }
$acl = Get-Acl -LiteralPath (Get-MailStore)
if (-not $acl.AreAccessRulesProtected) { throw 'Inherited ACL' }
$password2 = ConvertTo-SecureString 'replacement-synthetic' -AsPlainText -Force
Save-MailCredential -Account gmx -Username 'synthetic@example.invalid' -Password $password2
if ((Read-MailCredential -Account gmx | ConvertFrom-Json).password -ne 'replacement-synthetic') { throw 'Replacement failed' }
[IO.File]::WriteAllBytes($file, [byte[]](1,2,3))
$failed = $false
try { Read-MailCredential -Account gmx | Out-Null } catch { $failed = $true }
if (-not $failed) { throw 'Corruption accepted' }
Remove-MailCredential -Account gmx
if (Test-Path -LiteralPath $file) { throw 'Removal failed' }
Write-Output 'credential-tests-passed'
