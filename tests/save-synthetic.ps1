$ErrorActionPreference = 'Stop'
[Console]::Error.WriteLine('[synthetic test] setup script started')
. "$PSScriptRoot/../scripts/CredentialStore.ps1"
[Console]::Error.WriteLine('[synthetic test] setup store loaded')
$password = ConvertTo-SecureString 'synthetic-password' -AsPlainText -Force
try { Save-MailCredential -Account proton -Username 'synthetic-user' -Password $password }
finally { $password.Dispose() }
[Console]::Error.WriteLine('[synthetic test] setup saved')
