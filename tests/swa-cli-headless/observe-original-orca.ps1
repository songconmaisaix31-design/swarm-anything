#Requires -Version 7.2
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ConfigFile,[string]$WorkerPids)
$ErrorActionPreference = 'Stop'
$swaProbeConfig = Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json
Import-Module (Join-Path $PSScriptRoot 'OrcaPreservation.psm1') -Force
$swaPublic = Read-OrcaPublicState $swaProbeConfig.orca_path $swaProbeConfig.metadata_file $swaProbeConfig.original_process_ids
$swaACLs = @($swaProbeConfig.protected_files | ForEach-Object { @{ path = $_; acl = (Get-Acl -LiteralPath $_).Sddl } })
$swaWorkers = @()
if ($WorkerPids) {
    $swaWorkers = @($WorkerPids.Split(',') | ForEach-Object {
        $swaQueryPid = [int]$_
        $swaProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $swaQueryPid"
        if ($swaProcess) { @{ pid = [int]$swaProcess.ProcessId; parent_pid = [int]$swaProcess.ParentProcessId; creation_utc = $swaProcess.CreationDate.ToUniversalTime().ToString('o'); executable = $swaProcess.ExecutablePath; working_set_bytes = [long]$swaProcess.WorkingSetSize } }
    })
}
@{ public = $swaPublic; files = $swaACLs; worker_observations = $swaWorkers } | ConvertTo-Json -Depth 50 -Compress
