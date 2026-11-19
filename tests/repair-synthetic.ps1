param([int]$Port, [string]$Mode, [int]$FixtureProcess)
. "$PSScriptRoot/../scripts/BridgeRepair.ps1"
# The fixture has no Proton signing identity. Substitute only the initial
# identity decision; production TCP tuple and process liveness checks still run.
function Get-VerifiedBridgeProcess($Probe) {
    $process = Get-Process -Id $FixtureProcess
    $null = $process.Handle
    Assert-BridgePeer $Probe $process
    return $process
}
Update-BridgePin -Address '127.0.0.1' -Port $Port -Mode $Mode
