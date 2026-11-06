param([Parameter(Mandatory)][int]$TargetProcessId,[Parameter(Mandatory)][long]$CreationTimeMs,[Parameter(Mandatory)][string]$Executable)
$ErrorActionPreference = 'Stop'
$swaOwned = [Diagnostics.Process]::GetProcessById($TargetProcessId)
try {
    if ($swaOwned.HasExited -or $swaOwned.MainModule.FileName -ine $Executable -or ([DateTimeOffset]$swaOwned.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds() -ne $CreationTimeMs) { throw '实际所属根创建身份不符' }
    $swaOwned.Kill()
    if (-not $swaOwned.WaitForExit(10000)) { throw '实际所属根退出未知' }
} finally { $swaOwned.Dispose() }
