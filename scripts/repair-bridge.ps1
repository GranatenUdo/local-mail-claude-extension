param(
    [ValidateSet('Setup','Repair')][string]$Action = 'Setup',
    [ValidateSet('127.0.0.1','::1')][string]$Address = '127.0.0.1',
    [ValidateRange(1,65535)][int]$Port = 1143,
    [ValidateSet('starttls','tls')][string]$Mode = 'starttls',
    [switch]$ShowResult
)
$ErrorActionPreference = 'Stop'
$exitCode = 0
$verified = $false
try {
    . "$PSScriptRoot/BridgeRepair.ps1"
    $file = Update-BridgePin -Address $Address -Port $Port -Mode $Mode
    $verified = $true
    $message = "Bridge certificate verified. Retry your Proton mail request."
    if ($Action -eq 'Setup') {
        $files = @('repair-bridge.ps1','BridgeRepair.ps1','BridgeTls.cs','CredentialStore.ps1')
        # An upgrade repoints the shortcut only after all its new files are ready.
        $hashes = foreach ($name in $files) { (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name)).Hash }
        $digest = [Security.Cryptography.SHA256]::Create()
        try { $id = [BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::ASCII.GetBytes(($hashes -join '')))).Replace('-', '') }
        finally { $digest.Dispose() }
        $installed = Join-Path (Get-MailStore) "BridgeRepair\$id"
        Assert-MailStorePath $installed
        [void][IO.Directory]::CreateDirectory($installed)
        foreach ($name in $files) {
            $target = Join-Path $installed $name
            Assert-MailStorePath $target
            $source = Join-Path $PSScriptRoot $name
            if ($source -eq $target) { continue }
            $temp = Join-Path $installed ([Guid]::NewGuid().ToString() + '.tmp')
            try {
                [IO.File]::Copy($source, $temp)
                if ([IO.File]::Exists($target)) { [IO.File]::Replace($temp, $target, [NullString]::Value) }
                else { [IO.File]::Move($temp, $target) }
            } finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) } }
        }
        $shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Repair Proton Bridge Certificate.lnk'
        Assert-MailStorePath $shortcut
        $pendingLink = Join-Path ([IO.Path]::GetDirectoryName($shortcut)) ([Guid]::NewGuid().ToString() + '.lnk')
        try {
            $link = (New-Object -ComObject WScript.Shell).CreateShortcut($pendingLink)
            $link.TargetPath = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
            $script = Join-Path $installed 'repair-bridge.ps1'
            $link.Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Action Repair -Address $Address -Port $Port -Mode $Mode -ShowResult"
            $link.WorkingDirectory = $installed
            $link.Description = 'Verify the running Proton Mail Bridge and refresh its public certificate.'
            $link.Save()
            if ([IO.File]::Exists($shortcut)) { [IO.File]::Replace($pendingLink, $shortcut, [NullString]::Value) }
            else { [IO.File]::Move($pendingLink, $shortcut) }
        } finally { if ([IO.File]::Exists($pendingLink)) { [IO.File]::Delete($pendingLink) } }
        $message = "Shortcut installed. Select this file once in the extension's Bridge certificate setting:`n$file"
    }
} catch {
    $exitCode = 1
    if ($verified) {
        $message = 'The public certificate was saved, but shortcut installation failed. Rerun setup from the complete extracted bundle.'
    } elseif ($_.Exception.Message -in @('Unsupported Bridge location.', 'Unprotected Bridge owner.', 'Unprotected Bridge installation.', 'Bridge publisher verification failed.')) {
        $message = 'The process on this port could not be verified as a supported Proton AG installation. Select a public certificate exported from Bridge or use the official protected Program Files installation.'
    } else {
        $message = 'Bridge certificate repair could not finish. Check that Bridge is running under your Windows account and that the IMAP address, port and TLS mode match. Retry, or select a public certificate exported from Bridge.'
    }
}
if ($ShowResult) {
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($message, 'Repair Proton Bridge Certificate')
} elseif ($exitCode) { [Console]::Error.WriteLine($message) }
else { Write-Output $message }
exit $exitCode
