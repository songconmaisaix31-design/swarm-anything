[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Uri,
    [Parameter(Mandatory)][string]$WorkDirectory,
    [Parameter(Mandatory)][string]$OutputFile
)

$ErrorActionPreference = 'Stop'
[System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal'
$swaStage = 'validate'
$swaStatus = $null
$swaExit = 0
$swaResources = [System.Collections.Generic.List[System.IDisposable]]::new()

function Assert-ActualDirectory([string]$Path) {
    $swaCurrent = $Path
    while ($swaCurrent) {
        $swaItem = Get-Item -LiteralPath $swaCurrent -Force
        if (!$swaItem.PSIsContainer -or ($swaItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw [IO.IOException]::new('The private download directory is redirected')
        }
        $swaParent = [IO.Directory]::GetParent($swaCurrent)
        $swaCurrent = if ($null -eq $swaParent) { $null } else { $swaParent.FullName }
    }
}

try {
    if (!$IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) { throw [PlatformNotSupportedException]::new() }
    $swaDownloadUri = [System.Uri]::new($Uri, [UriKind]::Absolute)
    $swaAssets = @(
        '/dist/v24.21.0/node-v24.21.0-win-x64.zip',
        '/dist/v24.21.0/node-v24.21.0-headers.tar.gz',
        '/dist/v24.21.0/win-x64/node.lib'
    )
    if ($swaDownloadUri.Scheme -cne 'https' -or $swaDownloadUri.DnsSafeHost -ine 'nodejs.org' -or $swaDownloadUri.Port -ne 443 -or $swaDownloadUri.UserInfo -or $swaDownloadUri.Query -or $swaDownloadUri.Fragment -or $swaDownloadUri.AbsolutePath -cnotin $swaAssets) {
        throw [ArgumentException]::new('An exact pinned official Node input is required')
    }
    if (![IO.Path]::IsPathFullyQualified($WorkDirectory) -or ![IO.Path]::IsPathFullyQualified($OutputFile)) {
        throw [ArgumentException]::new('Private absolute download paths are required')
    }
    $swaRepository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $swaBuildRoot = [IO.Path]::GetFullPath((Join-Path $swaRepository '.verification/swa-cli-headless-20261020/build'))
    $swaWork = [IO.Path]::GetFullPath($WorkDirectory)
    $swaWorkParent = [IO.Directory]::GetParent($swaWork)
    if ($null -eq $swaWorkParent -or !$swaWorkParent.FullName.Equals($swaBuildRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($swaWork) -cnotmatch '^candidate-[A-Za-z0-9]{6}$') {
        throw [ArgumentException]::new('The actual private candidate work directory is required')
    }
    $swaTarget = [IO.Path]::GetFullPath($OutputFile)
    if ([IO.Path]::GetFileName($swaTarget) -cne [IO.Path]::GetFileName($swaDownloadUri.AbsolutePath)) {
        throw [ArgumentException]::new('The download target must retain the exact pinned filename')
    }
    $swaRelative = [IO.Path]::GetRelativePath($swaWork, $swaTarget)
    if ($swaRelative -eq '.' -or $swaRelative -eq '..' -or $swaRelative.StartsWith('..\', [StringComparison]::Ordinal) -or [IO.Path]::IsPathRooted($swaRelative)) {
        throw [ArgumentException]::new('The download target escaped its private work directory')
    }
    Assert-ActualDirectory $swaWork
    Assert-ActualDirectory ([IO.Path]::GetDirectoryName($swaTarget))
    if (Test-Path -LiteralPath $swaTarget) { throw [IO.IOException]::new('The download target already exists') }

    $swaStage = 'open-private-file'
    $swaFile = [IO.FileStream]::new($swaTarget, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 81920, [IO.FileOptions]::Asynchronous)
    $swaResources.Add($swaFile)
    $swaCancellation = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(600))
    $swaResources.Add($swaCancellation)
    $swaHandler = [Net.Http.HttpClientHandler]::new()
    $swaResources.Add($swaHandler)
    $swaHandler.UseProxy = $true
    $swaHandler.Proxy = [Net.Http.HttpClient]::DefaultProxy
    $swaHandler.AllowAutoRedirect = $false
    $swaHandler.UseCookies = $false
    $swaClient = [Net.Http.HttpClient]::new($swaHandler, $false)
    $swaResources.Add($swaClient)
    $swaClient.Timeout = [Threading.Timeout]::InfiniteTimeSpan
    $swaRequest = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Get, $swaDownloadUri)
    $swaResources.Add($swaRequest)

    $swaStage = 'http-headers'
    $swaResponse = $swaClient.SendAsync($swaRequest, [Net.Http.HttpCompletionOption]::ResponseHeadersRead, $swaCancellation.Token).GetAwaiter().GetResult()
    $swaResources.Add($swaResponse)
    $swaStatus = [int]$swaResponse.StatusCode
    if (!$swaResponse.IsSuccessStatusCode) { throw [Net.Http.HttpRequestException]::new('The official Node request failed') }
    $swaStage = 'http-body'
    $swaStream = $swaResponse.Content.ReadAsStreamAsync($swaCancellation.Token).GetAwaiter().GetResult()
    $swaResources.Add($swaStream)
    [void]($swaStream.CopyToAsync($swaFile, 81920, $swaCancellation.Token).GetAwaiter().GetResult())
    [void]($swaFile.FlushAsync($swaCancellation.Token).GetAwaiter().GetResult())
    Assert-ActualDirectory ([IO.Path]::GetDirectoryName($swaTarget))
    if ($swaFile.Length -le 0) { throw [IO.IOException]::new('The official Node response is empty') }
    $swaResult = [pscustomobject]@{schema='swa.node-download.v1';asset=$swaDownloadUri.AbsolutePath;bytes=$swaFile.Length;http_status=$swaStatus}
} catch {
    $swaExit = 1
    # 原始异常可能包含代理或认证信息，只报告安全阶段与实际异常类别。
    [Console]::Error.WriteLine((ConvertTo-Json -InputObject @{schema='swa.node-download.v1';stage=$swaStage;http_status=$swaStatus;error_type=$_.Exception.GetBaseException().GetType().FullName} -Compress))
} finally {
    for ($swaIndex = $swaResources.Count - 1; $swaIndex -ge 0; $swaIndex--) {
        try { $swaResources[$swaIndex].Dispose() } catch {
            $swaExit = 1
            [Console]::Error.WriteLine((ConvertTo-Json -InputObject @{schema='swa.node-download.v1';stage='dispose';error_type=$_.Exception.GetBaseException().GetType().FullName} -Compress))
        }
    }
}
if ($swaExit -eq 0) { ConvertTo-Json -InputObject $swaResult -Compress }
exit $swaExit
