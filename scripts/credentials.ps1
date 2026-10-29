param(
    [ValidateSet('setup','get','remove')][string]$Action = 'setup',
    [Parameter(Mandatory=$true)][ValidateSet('gmx','proton')][string]$Account
)
$ErrorActionPreference = 'Stop'
try {
    . "$PSScriptRoot/CredentialStore.ps1"
    switch ($Action) {
        'setup' {
            Write-Host 'Enter credentials locally. For Proton use Bridge IMAP credentials, not your Proton account password.'
            $username = Read-Host 'IMAP username'
            $password = Read-Host 'IMAP password' -AsSecureString
            try { Save-MailCredential -Account $Account -Username $username -Password $password }
            finally { $password.Dispose() }
            Write-Host 'Credentials encrypted for this Windows user. Restart the extension if needed.'
        }
        'get' { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false); [Console]::Out.Write((Read-MailCredential -Account $Account)) }
        'remove' { Remove-MailCredential -Account $Account; Write-Host 'Stored credentials removed.' }
    }
} catch {
    [Console]::Error.WriteLine('Credential operation failed. Check the local store and Windows policy. No private diagnostic data is returned.')
    exit 1
}
