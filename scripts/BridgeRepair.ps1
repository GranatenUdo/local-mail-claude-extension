Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/CredentialStore.ps1"

function Get-BridgePeerProcessId($Probe) {
    $row = @(Get-NetTCPConnection -State Established -LocalAddress $Probe.Remote.Address.IPAddressToString `
        -LocalPort $Probe.Remote.Port -RemoteAddress $Probe.Local.Address.IPAddressToString -RemotePort $Probe.Local.Port)
    if ($row.Count -ne 1) { throw 'Could not identify a unique Bridge connection.' }
    return $row[0].OwningProcess
}

function Assert-ProtectedBridgeImage([string]$Image) {
    $programs = [Environment]::GetFolderPath('ProgramFiles')
    $expected = Join-Path $programs 'Proton AG\Proton Mail Bridge\bridge.exe'
    if ($Image -ne $expected) { throw 'Unsupported Bridge location.' }
    Assert-MailStorePath $Image
    # Only system administrators, SYSTEM and TrustedInstaller may modify this image or its directory tree.
    $trusted = @('S-1-5-32-544','S-1-5-18','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
    $mutating = 0x500D0156 # GenericAll/Write, WriteDac/Owner, Delete, DeleteChild, write data/attributes
    $item = $Image
    while ($true) {
        $acl = Get-Acl -LiteralPath $item
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trusted) { throw 'Unprotected Bridge owner.' }
        foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
            if ($rule.AccessControlType -eq 'Allow' -and
                !($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -and
                ([int64]$rule.FileSystemRights -band $mutating) -and $rule.IdentityReference.Value -notin $trusted) {
                throw 'Unprotected Bridge installation.'
            }
        }
        if ($item -eq $programs) { break }
        $item = [IO.Path]::GetDirectoryName($item)
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $Image
    if ($signature.Status -ne 'Valid' -or
        $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -cne 'Proton AG' -or
        $signature.SignerCertificate.Subject -notmatch '(?:^|, )O=Proton AG(?:,|$)' -or
        $signature.SignerCertificate.Subject -notmatch '(?:^|, )SERIALNUMBER=CHE-354\.686\.492(?:,|$)') {
        throw 'Bridge publisher verification failed.'
    }
}

function Get-VerifiedBridgeProcess($Probe) {
    $ownerId = Get-BridgePeerProcessId $Probe
    $process = Get-Process -Id $ownerId
    try {
        $null = $process.Handle # Retain the process object throughout both handshakes.
        $instance = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
        $owner = Invoke-CimMethod -InputObject $instance -MethodName GetOwnerSid
        if ($owner.ReturnValue -ne 0 -or $owner.Sid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) {
            throw 'Bridge must run as the current user.'
        }
        Assert-ProtectedBridgeImage $process.Path
        Assert-BridgePeer $Probe $process
        return $process
    } catch { $process.Dispose(); throw }
}

function Assert-BridgePeer($Probe, $Process) {
    if ((Get-BridgePeerProcessId $Probe) -ne $Process.Id -or $Process.HasExited) {
        throw 'Bridge connection changed.'
    }
}

function Update-BridgePin {
    param([ValidateSet('127.0.0.1','::1')][string]$Address, [ValidateRange(1,65535)][int]$Port,
        [ValidateSet('starttls','tls')][string]$Mode)
    if (-not ('LocalMail.BridgeProbe' -as [type])) { Add-Type -Path "$PSScriptRoot/BridgeTls.cs" }
    $store = Initialize-MailStore
    $family = if ($Address -eq '::1') { 'ipv6' } else { 'ipv4' }
    $file = Join-Path $store "bridge-$family-$Port-$Mode.pem"
    $lockPath = "$file.lock"
    Assert-MailStorePath $file
    Assert-MailStorePath $lockPath
    $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    $first = $null
    $second = $null
    $process = $null
    $temp = $null
    try {
        $first = [LocalMail.BridgeProbe]::new($Address, $Port)
        $process = Get-VerifiedBridgeProcess $first
        $startTls = $Mode -eq 'starttls'
        $candidate = $first.Handshake($startTls, $null)
        Assert-BridgePeer $first $process
        $second = [LocalMail.BridgeProbe]::new($Address, $Port)
        Assert-BridgePeer $second $process
        $null = $second.Handshake($startTls, $candidate)
        Assert-BridgePeer $second $process
        $base64 = [Convert]::ToBase64String($candidate, [Base64FormattingOptions]::InsertLineBreaks)
        $pem = "-----BEGIN CERTIFICATE-----`r`n$base64`r`n-----END CERTIFICATE-----`r`n"
        $temp = Join-Path $store ([Guid]::NewGuid().ToString() + '.tmp')
        [IO.File]::WriteAllText($temp, $pem, [Text.Encoding]::ASCII)
        if ([IO.File]::Exists($file)) { [IO.File]::Replace($temp, $file, [NullString]::Value) }
        else { [IO.File]::Move($temp, $file) }
        return $file
    } finally {
        if ($temp -and [IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }
        if ($second) { $second.Dispose() }
        if ($first) { $first.Dispose() }
        if ($process) { $process.Dispose() }
        $lock.Dispose()
    }
}
