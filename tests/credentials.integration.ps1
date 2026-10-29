$ErrorActionPreference = 'Stop'
[Console]::Error.WriteLine('[synthetic test] script started ' + [DateTime]::UtcNow.ToString('O'))
. "$PSScriptRoot/../scripts/CredentialStore.ps1"
[Console]::Error.WriteLine('[synthetic test] store loaded ' + [DateTime]::UtcNow.ToString('O'))
$password = ConvertTo-SecureString 'synthetic-test-password-901' -AsPlainText -Force
[Console]::Error.WriteLine('[synthetic test] saving ' + [DateTime]::UtcNow.ToString('O'))
Save-MailCredential -Account gmx -Username 'synthetic@example.invalid' -Password $password
[Console]::Error.WriteLine('[synthetic test] saved ' + [DateTime]::UtcNow.ToString('O'))
$actual = Read-MailCredential -Account gmx | ConvertFrom-Json
[Console]::Error.WriteLine('[synthetic test] read ' + [DateTime]::UtcNow.ToString('O'))
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
