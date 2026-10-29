$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../scripts/CredentialStore.ps1"
$password = ConvertTo-SecureString 'synthetic-password' -AsPlainText -Force
try { Save-MailCredential -Account proton -Username 'synthetic-user' -Password $password }
finally { $password.Dispose() }
