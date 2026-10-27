#Requires -Version 7.2
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference = 'Stop'
$swaRepository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$swaAllowed = [IO.Path]::GetFullPath((Join-Path $swaRepository '.verification/swa-cli-headless-20261020')).TrimEnd('\') + '\'
if (-not [IO.Path]::IsPathFullyQualified($OutputRoot)) { throw '需要新测试输出的绝对路径' }
$swaOutput = [IO.Path]::GetFullPath($OutputRoot)
if (-not $swaOutput.StartsWith($swaAllowed,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $swaOutput)) { throw '测试二进制输出必须是本项忽略目录内的全新目录' }
$swaRevision = (& git -C $swaRepository rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $swaRevision -notmatch '^[0-9a-f]{40}$') { throw '准确源码提交缺失' }
$swaDirty = & git -C $swaRepository status --porcelain
if ($LASTEXITCODE -ne 0 -or $swaDirty) { throw '编译前需要准确干净源码' }
New-Item -ItemType Directory -Path $swaOutput | Out-Null
foreach ($swaDirectory in @('temp','go-cache','go-modcache','gopath')) { New-Item -ItemType Directory -Path (Join-Path $swaOutput $swaDirectory) | Out-Null }
$env:TEMP = Join-Path $swaOutput 'temp'
$env:TMP = $env:TEMP
$env:GOTMPDIR = $env:TEMP
$env:GOCACHE = Join-Path $swaOutput 'go-cache'
$env:GOMODCACHE = Join-Path $swaOutput 'go-modcache'
$env:GOPATH = Join-Path $swaOutput 'gopath'
$swaGo = (Get-Command go.exe -ErrorAction Stop).Source
$swaPackages = @(
    @{ package = './cmd/swa'; binary = 'cmd-swa.test.exe'; test = 'TestOrcaCLIRealInstalledController' },
    @{ package = './internal/adapters/orca'; binary = 'orca-adapter.test.exe'; test = 'TestOrcaCLIRealPrivateRuntimeScope' },
    @{ package = './internal/workspace/app'; binary = 'workspace-app.test.exe'; test = 'TestOrcaCLIRealCurrentProjectAuthorization' },
    @{ package = './internal/adapters/swahttp'; binary = 'swahttp.test.exe'; test = 'TestOrcaCLIRealHTTPAuthorityBoundary' }
)
Push-Location $swaRepository
try {
    foreach ($swaPackage in $swaPackages) {
        & C:/Python313/python.exe (Join-Path $PSScriptRoot 'resource-gate.py') 2>&1 | Tee-Object -FilePath (Join-Path $swaOutput ($swaPackage.binary + '.resources.log'))
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & $swaGo test -c -p=4 -o (Join-Path $swaOutput $swaPackage.binary) $swaPackage.package 2>&1 | Tee-Object -FilePath (Join-Path $swaOutput ($swaPackage.binary + '.compile.log'))
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    $swaArgumentLog = Join-Path $swaOutput 'cli-pretransport.log'
    & C:/Python313/python.exe (Join-Path $PSScriptRoot 'resource-gate.py') 2>&1 | Tee-Object -FilePath (Join-Path $swaOutput 'cli-pretransport.resources.log')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & (Join-Path $swaOutput 'cmd-swa.test.exe') '-test.v' '-test.run' '^TestOrcaCLI(Rejects|Missing)' 2>&1 | Tee-Object -FilePath $swaArgumentLog
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $swaArguments = Get-Content -LiteralPath $swaArgumentLog -Raw
    if ($swaArguments -match '--- SKIP:') { throw 'CLI 传输前检查出现未运行函数' }
    foreach ($swaRequired in @('TestOrcaCLIRejectsAuthorityArgumentsBeforeTransport','TestOrcaCLIRejectsUnknownActionAndIrrelevantInput','TestOrcaCLIMissingCurrentGrantIsDenied')) {
        if ($swaArguments -notmatch ('--- PASS: ' + [Regex]::Escape($swaRequired) + ' ')) { throw 'CLI 传输前检查没有实际运行对应函数' }
    }
} finally { Pop-Location }
$swaFinalRevision = (& git -C $swaRepository rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $swaFinalRevision -cne $swaRevision) { throw '编译期间准确源码提交已变化，不能发布SOURCE' }
$swaFinalDirty = & git -C $swaRepository status --porcelain
if ($LASTEXITCODE -ne 0 -or $swaFinalDirty) { throw '编译结束时源码不干净，不能发布SOURCE' }
[IO.File]::WriteAllText((Join-Path $swaOutput 'SOURCE'), $swaRevision + "`n")
[IO.File]::WriteAllText((Join-Path $swaOutput 'tests.json'), ($swaPackages | ConvertTo-Json))
@{ source_revision = $swaRevision; tests_directory = $swaOutput; actual_pretransport_tests_executed = 3; actual_runtime_tests_executed = $false; model_calls = 0 } | ConvertTo-Json -Compress
