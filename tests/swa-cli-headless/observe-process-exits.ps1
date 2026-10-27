#Requires -Version 7.2
param([Parameter(Mandatory)][string]$RequestFile,[Parameter(Mandatory)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathFullyQualified($RequestFile) -or -not [IO.Path]::IsPathFullyQualified($OutputFile) -or (Test-Path -LiteralPath $OutputFile)) { throw '实际进程观察需要独占绝对路径' }
$swaRequest = Get-Content -LiteralPath $RequestFile -Raw | ConvertFrom-Json
$swaKnown = @($swaRequest.known)
$swaUnknown = @($swaRequest.unknown)
if ($swaRequest.schema_version -ne 1 -or $swaKnown.Count -lt 1) { throw '实际进程观察请求无效' }
$swaWanted = [Collections.Generic.HashSet[uint32]]::new()
foreach ($swaEntry in $swaKnown) {
    if ($swaEntry.pid -lt 1 -or $swaEntry.pid -gt [uint32]::MaxValue -or $swaEntry.creationTimeMs -le 0) { throw '已知身份缺少真实PID或创建时间' }
    [void]$swaWanted.Add([uint32]$swaEntry.pid)
}
foreach ($swaEntry in $swaUnknown) {
    if ($swaEntry.pid -lt 1 -or $swaEntry.pid -gt [uint32]::MaxValue) { throw '未知样本缺少实际PID' }
    [void]$swaWanted.Add([uint32]$swaEntry.pid)
}
$swaWatch = [Diagnostics.Stopwatch]::StartNew()
$swaObservations = @()
$swaResult = @{schema_version=1;observations=@();query_failure=$null;all_exited=$false}
try {
    for ($swaIndex=0; $swaIndex -lt 2; $swaIndex++) {
        $swaRows = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,Name,CreationDate -ErrorAction Stop)
        $swaHits = @()
        $swaCompleteFields = $true
        $swaInvalidPIDs = 0
        foreach ($swaRow in $swaRows) {
            if ($null -eq $swaRow.ProcessId -or $swaRow.CimInstanceProperties['ProcessId'].CimType -ne [Microsoft.Management.Infrastructure.CimType]::UInt32 -or $swaRow.ProcessId -lt 0 -or $swaRow.ProcessId -gt [uint32]::MaxValue) {
                $swaCompleteFields = $false
                $swaInvalidPIDs++
                continue
            }
            if (-not $swaWanted.Contains([uint32]$swaRow.ProcessId)) { continue }
            $swaCreation = $null
            $swaCreationUTC = $null
            if ($swaRow.CreationDate -is [DateTime]) {
                $swaCreation = ([DateTimeOffset]$swaRow.CreationDate.ToUniversalTime()).ToUnixTimeMilliseconds()
                $swaCreationUTC = $swaRow.CreationDate.ToUniversalTime().ToString('o')
            }
            if ($null -eq $swaCreation -or $swaCreation -le 0 -or $null -eq $swaRow.ParentProcessId -or -not $swaRow.Name) { $swaCompleteFields = $false }
            $swaHits += @{pid=[uint32]$swaRow.ProcessId;parent_pid=$swaRow.ParentProcessId;name=$swaRow.Name;creation_time_ms=$swaCreation;creation_utc=$swaCreationUTC}
        }
        $swaKnownExited = $true
        foreach ($swaEntry in $swaKnown) {
            $swaMatch = @($swaHits | Where-Object pid -EQ $swaEntry.pid)
            if ($swaMatch.Count -gt 1 -or ($swaMatch.Count -eq 1 -and ($null -eq $swaMatch[0].creation_time_ms -or $swaMatch[0].creation_time_ms -eq $swaEntry.creationTimeMs))) { $swaKnownExited = $false }
        }
        $swaUnknownAbsent = $true
        foreach ($swaEntry in $swaUnknown) {
            if (@($swaHits | Where-Object pid -EQ $swaEntry.pid).Count -ne 0) { $swaUnknownAbsent = $false }
        }
        $swaObservations += @{query_succeeded=$true;observed_at=[DateTime]::UtcNow.ToString('o');monotonic_ms=$swaWatch.Elapsed.TotalMilliseconds;complete_result_count=$swaRows.Count;invalid_pid_record_count=$swaInvalidPIDs;actual_matches=$swaHits;required_identity_fields_complete=$swaCompleteFields;known_identities_exited=$swaKnownExited;unknown_pids_absent=$swaUnknownAbsent}
        $swaResult.observations = $swaObservations
        [IO.File]::WriteAllText($OutputFile,($swaResult | ConvertTo-Json -Depth 12))
        if ($swaRows.Count -lt 1) { throw '完整CIM进程清单为空，不能确认为成功退出观察' }
        if ($swaIndex -eq 0) { Start-Sleep -Milliseconds 250 }
    }
    $swaResult.all_exited = @($swaObservations | Where-Object {-not $_.query_succeeded -or -not $_.required_identity_fields_complete -or -not $_.known_identities_exited -or -not $_.unknown_pids_absent}).Count -eq 0
} catch {
    $swaResult.query_failure = @{query_index=$swaIndex;query_succeeded=$false;observed_at=[DateTime]::UtcNow.ToString('o');monotonic_ms=$swaWatch.Elapsed.TotalMilliseconds;exception_type=$_.Exception.GetType().FullName;message=$_.Exception.Message}
    [IO.File]::WriteAllText($OutputFile,($swaResult | ConvertTo-Json -Depth 12))
    exit 6
}
[IO.File]::WriteAllText($OutputFile,($swaResult | ConvertTo-Json -Depth 12))
if (-not $swaResult.all_exited) { exit 6 }
