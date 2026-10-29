Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

function Get-MailStore {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows required' }
    if (-not $env:LOCALAPPDATA) { throw 'Local application data unavailable' }
    return Join-Path $env:LOCALAPPDATA 'LocalMailClaudeExtension'
}
function Assert-MailStorePath([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Unsafe credential path' }
        }
        $parent = [IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current = $parent.FullName
    }
}
function Initialize-MailStore {
    $root = Get-MailStore
    Assert-MailStorePath $root
    if (-not (Test-Path -LiteralPath $root)) { [IO.Directory]::CreateDirectory($root) | Out-Null }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [IO.Directory]::GetAccessControl($root, [Security.AccessControl.AccessControlSections]::Access)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existing in $acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier])) { $acl.RemoveAccessRuleSpecific($existing) }
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    [IO.Directory]::SetAccessControl($root, $acl)
    return $root
}
function Get-MailCredentialPath([ValidateSet('gmx','proton')][string]$Account) {
    $file = Join-Path (Get-MailStore) "$Account.dpapi"
    Assert-MailStorePath $file
    return $file
}
function Save-MailCredential {
    param([ValidateSet('gmx','proton')][string]$Account, [string]$Username, [Security.SecureString]$Password)
    if ([string]::IsNullOrWhiteSpace($Username) -or $Username.Length -gt 512 -or $Password.Length -eq 0 -or $Password.Length -gt 4096) { throw 'Invalid credential' }
    $root = Initialize-MailStore
    $file = Get-MailCredentialPath $Account
    $temporary = Join-Path $root ([Guid]::NewGuid().ToString() + '.tmp')
    $pointer = [IntPtr]::Zero
    $bytes = $null
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $json = @{ username = $Username; password = $plain } | ConvertTo-Json -Compress
        $bytes = [Text.Encoding]::UTF8.GetBytes($json)
        $encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [IO.File]::WriteAllBytes($temporary, $encrypted)
        if (Test-Path -LiteralPath $file) { [IO.File]::Replace($temporary, $file, [NullString]::Value) }
        else { [IO.File]::Move($temporary, $file) }
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
        $plain = $null; $json = $null
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}
function Read-MailCredential([ValidateSet('gmx','proton')][string]$Account) {
    $file = Get-MailCredentialPath $Account
    if ((Get-Item -LiteralPath $file).Length -gt 32768) { throw 'Invalid credential store' }
    $bytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    try { return [Text.Encoding]::UTF8.GetString($bytes) }
    finally { [Array]::Clear($bytes, 0, $bytes.Length) }
}
function Remove-MailCredential([ValidateSet('gmx','proton')][string]$Account) {
    $file = Get-MailCredentialPath $Account
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
}
