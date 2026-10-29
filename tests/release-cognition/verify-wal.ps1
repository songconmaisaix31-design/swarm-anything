param(
    [Parameter(Mandatory=$true)][string]$Repository,
    [Parameter(Mandatory=$true)][string]$PublicRef,
    [Parameter(Mandatory=$true)][string]$ActualScope,
    [Parameter(Mandatory=$true)][string]$SleepDay,
    [Parameter(Mandatory=$true)][string]$Timezone,
    [Parameter(Mandatory=$true)][double]$Strength,
    [Parameter(Mandatory=$true)][double]$Decay,
    [Parameter(Mandatory=$true)][double]$InitialConfidence,
    [Parameter(Mandatory=$true)][switch]$AuthorizedPublicReplay,
    [switch]$CrossDay,
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$verification = Join-Path $workspace '.verification'
$owned = Join-Path $verification ('public-cognition-' + [guid]::NewGuid().ToString('N'))
if ($OutputDirectory) { $owned = [IO.Path]::GetFullPath($OutputDirectory) }
if (-not $owned.StartsWith($verification + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output must remain in this workspace verification directory' }
$local = Join-Path $owned 'local'
$root = Join-Path $local 'astrocyte-workbench/v0.1'
$source = Join-Path $owned 'app-state/state.sqlite'
if (Test-Path -LiteralPath $source) { throw 'Source must be a new isolated actual server database' }
if ($CrossDay) {
    if ($Timezone -ne 'Asia/Shanghai') { throw 'Cross-day verification requires Asia/Shanghai' }
    $zone = [TimeZoneInfo]::FindSystemTimeZoneById('China Standard Time')
    $actualDay = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $zone).Date
    if ($SleepDay -ne $actualDay.AddDays(-1).ToString('yyyy-MM-dd')) { throw 'Cross-day verification requires actual Shanghai yesterday' }
}
New-Item -ItemType Directory -Path $owned -Force | Out-Null
$serverBinary = Join-Path $owned 'server.exe'
$snapshotBinary = Join-Path $owned 'workbench-snapshot.exe'
$collectorBinary = Join-Path $owned 'actual-public-cognition.exe'
$sleepBinary = Join-Path $owned 'sleep.exe'
$processes = @()
$savedEnvironment = @{}

function Check-Exit([string]$operation) {
    if ($LASTEXITCODE -ne 0) { throw "$operation failed with exit $LASTEXITCODE" }
}
function Wait-File([string]$path, $process) {
    $deadline = [DateTime]::UtcNow.AddMinutes(5)
    while (-not (Test-Path -LiteralPath $path)) {
        $process.Refresh()
        if ($process.HasExited) { throw "Actual process exited before $path" }
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Actual writer readiness timed out' }
        Start-Sleep -Milliseconds 100
    }
}

function Read-Progress {
    # 直接读取真实 SQLite 已提交数量，不维护逐事件的派生进度文件。
    $text = & $collectorBinary --mode progress --source $source
    Check-Exit 'actual committed SQLite progress'
    return ($text | ConvertFrom-Json)
}

try {
    Push-Location $workspace
    go build -mod=readonly -o $serverBinary ./cmd/server
    Check-Exit 'server build'
    go build -mod=readonly -o $snapshotBinary ./cmd/workbench-snapshot
    Check-Exit 'snapshot build'
    go build -mod=readonly -o $collectorBinary ./cmd/workbench-snapshot/verify
    Check-Exit 'collector build'
    go build -mod=readonly -o $sleepBinary ./cmd/sleep
    Check-Exit 'Sleep build'

    # 当前验证进程显式隔离所有产品配置，子进程不继承私人范围或模型授权。
    Get-ChildItem Env: | Where-Object { $_.Name.StartsWith('ASTROCYTE_') -or $_.Name -eq 'LOCALAPPDATA' } | ForEach-Object {
        $savedEnvironment[$_.Name] = $_.Value
        [Environment]::SetEnvironmentVariable($_.Name, $null, 'Process')
    }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    $env:LOCALAPPDATA = $local
    $env:ASTROCYTE_DATA_DIR = Split-Path -Parent $source
    $env:ASTROCYTE_PORT = [string]$port
    $env:ASTROCYTE_PROJECT_DISCOVERY_ROOTS = '[]'
    $env:ASTROCYTE_ENABLE_CODEX_DISTILLATION = 'false'
    $env:ASTROCYTE_ENABLE_SUMMARIZE = 'false'
    $env:ASTROCYTE_WORKBENCH = '1'
    $server = Start-Process -FilePath $serverBinary -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $owned 'server.stdout.log') -RedirectStandardError (Join-Path $owned 'server.stderr.log')
    $processes += $server
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ($true) {
        $server.Refresh()
        if ($server.HasExited) { throw 'Actual server exited before initialization' }
        try {
            $response = Invoke-WebRequest "http://127.0.0.1:$port/api/v1/health" -TimeoutSec 1
            if ($response.StatusCode -eq 200) { break }
        } catch {
            if ([DateTime]::UtcNow -gt $deadline) { throw }
        }
        Start-Sleep -Milliseconds 100
    }
    & $snapshotBinary --source $source --root $root --timeout 120s > (Join-Path $owned 'empty-publication.json')
    Check-Exit 'actual empty snapshot'
    Stop-Process -Id $server.Id
    $server.WaitForExit()

    $writerDirectory = Join-Path $owned 'writer'
    New-Item -ItemType Directory -Path $writerDirectory | Out-Null
    $writerArguments = @('--mode','collect','--source',$source,'--repository',$Repository,'--ref',$PublicRef,'--scope',$ActualScope,'--output',$writerDirectory,'--strength',[string]$Strength,'--decay',[string]$Decay,'--initial-confidence',[string]$InitialConfidence,'--authorized-public-replay','--pace','25ms')
    # ArgumentList 中路径逐一引用，验证目录不依赖开发 node_modules。
    $quotedArguments = $writerArguments | ForEach-Object { '"' + $_.Replace('"','\"') + '"' }
    $writer = Start-Process -FilePath $collectorBinary -ArgumentList $quotedArguments -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $owned 'writer.stdout.log') -RedirectStandardError (Join-Path $owned 'writer.stderr.log')
    $processes += $writer
    Wait-File (Join-Path $writerDirectory 'writer-started.json') $writer
    $started = Get-Content -LiteralPath (Join-Path $writerDirectory 'writer-started.json') -Raw | ConvertFrom-Json
    Start-Sleep -Milliseconds 1000
    $wal = Get-Item -LiteralPath ($source + '-wal')
    if ($wal.Length -le 0) { throw 'Actual source has no committed WAL' }
    $before = Read-Progress
    if ($before.recorded -le 0 -or $before.recorded -ge $started.actual_commits) { throw 'Actual writer must have a partial committed cohort before online backup' }
    $writer.Refresh()
    if ($writer.HasExited) { throw 'Writer must be active during online backup' }
    & $snapshotBinary --source $source --root $root --timeout 120s > (Join-Path $owned 'concurrent-publication.json')
    Check-Exit 'multiprocess WAL snapshot'
    $after = Read-Progress
    if ($after.recorded -lt $before.recorded -or $after.recorded -gt $started.actual_commits) { throw 'Actual committed cohort moved backwards or exceeded its public source' }
    @{ writer_pid=$writer.Id; source_wal_bytes=$wal.Length; recorded_before=$before.recorded; recorded_after=$after.recorded; actual_total=$started.actual_commits } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $owned 'concurrent-safe.json') -Encoding utf8
    $writer.WaitForExit()
    if ($writer.ExitCode -ne 0) { throw 'Actual public writer failed' }
    & $snapshotBinary --source $source --root $root --timeout 120s > (Join-Path $owned 'complete-publication.json')
    Check-Exit 'complete public snapshot'
    if ($CrossDay) {
        $complete = Get-Content -LiteralPath (Join-Path $root 'current.json') -Raw | ConvertFrom-Json
        $completeHistory = Join-Path $root ('snapshots/' + $complete.generation + '/history.json')
        $preLocal = Join-Path $owned 'preSleep-local'
        $preRoot = Join-Path $preLocal 'astrocyte-workbench/v0.1'
        & $snapshotBinary --source $source --root $preRoot --history $completeHistory --timeout 120s > (Join-Path $owned 'preSleep-publication.json')
        Check-Exit 'actual preSleep publication'
        & $collectorBinary --mode inspect --source $source --root $preRoot --output (Join-Path $owned 'preSleep-safe') --minimum-today 2 --repository $Repository --ref $PublicRef
        Check-Exit 'actual preSleep SQL and Reader'
    }
    & $sleepBinary --data-dir (Split-Path -Parent $source) --day $SleepDay --timezone $Timezone --decay $Decay --initial-confidence $InitialConfidence --fact-projection none > (Join-Path $owned 'sleep-result-local.json')
    Check-Exit 'actual public Sleep'
    & $snapshotBinary --source $source --root $root --timeout 120s > (Join-Path $owned 'sleep-publication.json')
    Check-Exit 'post Sleep snapshot'
    $inspectArguments = @('--mode','inspect','--source',$source,'--root',$root,'--output',(Join-Path $owned 'safe'),'--repository',$Repository,'--ref',$PublicRef)
    if ($CrossDay) {
        $inspectArguments += @('--minimum-today','2','--closed-day',$SleepDay)
        $mainPublication = Get-Content -LiteralPath (Join-Path $root 'current.json') -Raw | ConvertFrom-Json
        $mainHistory = Join-Path $root ('snapshots/' + $mainPublication.generation + '/history.json')
        $closedLocal = Join-Path $owned 'closed-local'
        $closedRoot = Join-Path $closedLocal 'astrocyte-workbench/v0.1'
        & $snapshotBinary --source $source --root $closedRoot --history $mainHistory --timeout 120s > (Join-Path $owned 'closed-publication.json')
        Check-Exit 'actual closed publication'
        & $collectorBinary --mode inspect --source $source --root $closedRoot --output (Join-Path $owned 'closed-safe') --minimum-today 2 --closed-day $SleepDay --repository $Repository --ref $PublicRef
        Check-Exit 'actual closed SQL and Reader'
    }
    & $collectorBinary @inspectArguments
    Check-Exit 'actual SQL and production Reader'
    @{ source=$source; snapshot_root=$root; localappdata=$local; safe=(Join-Path $owned 'safe'); public_ref=$PublicRef; actual_scope=$ActualScope; cross_day=[bool]$CrossDay; preSleep_localappdata=$preLocal; closed_localappdata=$closedLocal; provenance='actual-public-Git-production-replay'; formal_experiment=$false } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $owned 'result.json') -Encoding utf8
    Write-Output $owned
} finally {
    foreach ($process in $processes) {
        $process.Refresh()
        if (-not $process.HasExited) { Stop-Process -Id $process.Id; $process.WaitForExit() }
    }
    Get-ChildItem Env: | Where-Object { $_.Name.StartsWith('ASTROCYTE_') -or $_.Name -eq 'LOCALAPPDATA' } | ForEach-Object { [Environment]::SetEnvironmentVariable($_.Name, $null, 'Process') }
    foreach ($entry in $savedEnvironment.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process') }
    Pop-Location
}
