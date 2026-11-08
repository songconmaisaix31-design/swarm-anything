#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PnpmCli,
    [Parameter(Mandatory)][string]$Python,
    [ValidateSet('private-directory', 'process-incarnation')][string]$Component = 'private-directory'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$env:SWA_PI_PROBE_PHASE = 'preflight'
if (-not $IsWindows -or [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne 'X64') { throw 'Actual Windows x64 is required' }
$processIncarnation = $Component -ieq 'process-incarnation'
$failedRevision = if ($processIncarnation) { '4aef552c63dd1ab5cd787fd2514d92a7815b943c' } else { '11717767f82a8a4070351ff74674aa0d268f79b2' }
$checkout = (Get-Item -LiteralPath $env:GITHUB_WORKSPACE).FullName
Set-Location -LiteralPath $checkout
$observationRevision = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $observationRevision -cnotmatch '^[0-9a-f]{40}$' -or $observationRevision -cne $env:GITHUB_SHA) { throw 'The actual component observer source differs from the CI revision' }
$revision = $observationRevision
if ($processIncarnation) {
    $status = & git status --porcelain --untracked-files=normal
    if ($LASTEXITCODE -ne 0 -or $status) { throw 'The actual process component source is not clean' }
}
$developmentNode = (Get-Command node -CommandType Application | Select-Object -First 1).Source
if ((& $developmentNode --version).Trim() -cne 'v24.16.0' -or (& $developmentNode $PnpmCli --version).Trim() -cne '11.27.0') { throw 'The pinned development tools differ' }
if (-not [IO.Path]::IsPathFullyQualified($Python) -or -not (Test-Path -LiteralPath $Python -PathType Leaf)) { throw 'An actual absolute Python input is required' }

function Assert-PlainAncestors([string]$Path) {
    if (-not [IO.Path]::IsPathFullyQualified($Path)) { throw 'An absolute local component path is required' }
    for ($ancestor = [IO.Path]::GetFullPath($Path); $ancestor; $ancestor = [IO.Path]::GetDirectoryName($ancestor)) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'A local component ancestor is redirected or is not a directory' }
        }
    }
}

$evidence = Join-Path $checkout $(if ($processIncarnation) { '.verification/swa-ci/windows-process-incarnation' } else { '.verification/swa-ci/windows-private-directory' })
Assert-PlainAncestors $evidence
if (Test-Path -LiteralPath $evidence) { throw 'The component evidence directory already exists' }
New-Item -ItemType Directory -Path $evidence | Out-Null
$result = [ordered]@{ diagnostic_only = $true; failed_source_revision = $failedRevision; source_revision = $revision; observation_revision = $env:GITHUB_SHA; status = 'NOT_RUN'; candidate_built = $false; install_started = $false; service_started = $false; account_session_started = $false; model_calls = 0 }

function Invoke-Preparation([string]$Phase, [string]$Program, [string[]]$Arguments) {
    $env:SWA_PI_PROBE_PHASE = $Phase
    & $Program @Arguments *> (Join-Path $evidence ($Phase + '.raw.log'))
    $code = $LASTEXITCODE
    Set-Content -LiteralPath (Join-Path $evidence ($Phase + '.exit.txt')) -Value $code
    if ($code -ne 0) { throw ('Component preparation failed: ' + $Phase + '; exit=' + $code) }
}

function Invoke-MetadataProcess([Diagnostics.ProcessStartInfo]$Start, [string]$Directory, [int]$TimeoutMilliseconds = 60000, [int]$MaximumBytes = 65536) {
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $Start
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $state = [ordered]@{ started = $false; exited = $false; exit_code = $null; timed_out = $false; output_limit_exceeded = $false; io_failed = $false; cleanup_attempted = $false; cleanup_wait_completed = $false; kernel_tree_exit_proven = $false; stdout_bytes_observed = 0; stderr_bytes_observed = 0 }
    $streams = @()
    try {
        if (-not $process.Start()) { throw 'The metadata process did not start' }
        $state.started = $true
        foreach ($name in @('stdout', 'stderr')) {
            $stream = if ($name -ceq 'stdout') { $process.StandardOutput.BaseStream } else { $process.StandardError.BaseStream }
            $buffer = [byte[]]::new(4096)
            $streams += [pscustomobject]@{ Name = $name; Stream = $stream; Buffer = $buffer; Memory = [IO.MemoryStream]::new(); Task = $stream.ReadAsync($buffer, 0, $buffer.Length); Bytes = 0 }
        }
        while (-not $process.HasExited -or @($streams | Where-Object { $null -ne $_.Task }).Count -ne 0) {
            if ($timer.ElapsedMilliseconds -ge $TimeoutMilliseconds) { $state.timed_out = $true; break }
            foreach ($stream in $streams) {
                if ($null -ne $stream.Task -and $stream.Task.IsCompleted) {
                    $count = $stream.Task.GetAwaiter().GetResult()
                    if ($count -eq 0) { $stream.Task = $null; continue }
                    $stream.Bytes += $count
                    if ($stream.Bytes -gt $MaximumBytes) { $state.output_limit_exceeded = $true; break }
                    $stream.Memory.Write($stream.Buffer, 0, $count)
                    $stream.Task = $stream.Stream.ReadAsync($stream.Buffer, 0, $stream.Buffer.Length)
                }
            }
            if ($state.output_limit_exceeded) { break }
            Start-Sleep -Milliseconds 10
        }
    } catch {
        $state.io_failed = $true
    } finally {
        if ($state.started) {
            if (-not $process.HasExited) {
                $state.cleanup_attempted = $true
                try { $process.Kill($true) } catch { $state.io_failed = $true }
                $state.cleanup_wait_completed = $process.WaitForExit(5000)
            }
            $state.exited = $process.HasExited
            if ($state.exited) { $state.exit_code = $process.ExitCode }
        }
        foreach ($stream in $streams) {
            $state[$stream.Name + '_bytes_observed'] = $stream.Bytes
            [IO.File]::WriteAllBytes((Join-Path $Directory ('metadata.' + $stream.Name + '.raw.log')), $stream.Memory.ToArray())
            $stream.Stream.Dispose()
            $stream.Memory.Dispose()
        }
        $process.Dispose()
        $timer.Stop()
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Directory 'metadata-process.json')
    return [pscustomobject]$state
}

function Publish-Metadata([string]$Title, [object]$Value) {
    $message = $Value | ConvertTo-Json -Depth 14 -Compress
    if ($message.Length -gt 8000) { $message = $message.Substring(0, 8000) + ' [bounded metadata; original JSON retained]' }
    $escaped = $message.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Host ('::warning title=' + $Title + '::' + $escaped)
}

try {
    $buildRoot = Join-Path $checkout '.verification/swa-cli-headless-20261020/build'
    Assert-PlainAncestors $buildRoot
    New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
    $work = Join-Path $buildRoot ('candidate-' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(3)))
    if (Test-Path -LiteralPath $work) { throw 'The exclusive component work directory already exists' }
    New-Item -ItemType Directory -Path $work | Out-Null
    Invoke-Preparation 'fixed-source-fetch' 'git' @('fetch', '--no-tags', '--depth=1', 'origin', $revision)
    $resolved = (& git rev-parse ($revision + '^{commit}')).Trim()
    if ($LASTEXITCODE -ne 0 -or $resolved -cne $revision) { throw 'The exact failed source commit is unavailable' }
    $sourceArchive = Join-Path $work 'source.tar'
    Invoke-Preparation 'fixed-source-archive' 'git' @('archive', '--format=tar', '--output', $sourceArchive, $revision)
    $sourceRoot = Join-Path $work 's'
    New-Item -ItemType Directory -Path $sourceRoot | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32/tar.exe'
    Invoke-Preparation 'fixed-source-extract' $tar @('-xf', $sourceArchive, '-C', $sourceRoot)
    if (-not $processIncarnation) {
        Invoke-Preparation 'baseline-source-fetch' 'git' @('fetch', '--no-tags', '--depth=1', 'origin', $failedRevision)
        $baselineArchive = Join-Path $work 'baseline-source.tar'
        Invoke-Preparation 'baseline-source-archive' 'git' @('archive', '--format=tar', '--output', $baselineArchive, $failedRevision)
        $baselineRoot = Join-Path $work 'b'
        New-Item -ItemType Directory -Path $baselineRoot | Out-Null
        Invoke-Preparation 'baseline-source-extract' $tar @('-xf', $baselineArchive, '-C', $baselineRoot)
    }
    $env:SWA_PI_PROBE_PHASE = 'original-download-helper'
    $helperBlob = (& git rev-parse ($revision + ':scripts/download-swa-node.ps1')).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'The original downloader identity is unavailable' }
    $actualHelperBlob = (& git hash-object '--path=scripts/download-swa-node.ps1' 'scripts/download-swa-node.ps1').Trim()
    if ($LASTEXITCODE -ne 0 -or $actualHelperBlob -cne $helperBlob) { throw 'The current guarded downloader differs from the failed source' }
    $env:SWA_PI_PROBE_PHASE = 'original-node-pin'
    $pinJSON = & $developmentNode --input-type=module -e 'import{pathToFileURL}from"node:url";const m=await import(pathToFileURL(process.argv[1]));const p=m.NODE_RUNTIME_PIN,a=m.NODE_RUNTIME_ASSETS["win32-x64"],l=p.windowsImportLibs["win32-x64"];console.log(JSON.stringify({version:p.version,asset:a,headers:p.headers,library:l,nodeUrl:m.nodeRuntimeReleaseUrl("official",a.archive),headersUrl:m.nodeRuntimeReleaseUrl("official",p.headers.file),libraryUrl:m.nodeRuntimeReleaseUrl("official",l.file)}))' (Join-Path $sourceRoot 'third_party/orca-v1.4.230/src/shared/node-runtime-pin.ts') 2> (Join-Path $evidence 'pin-read.raw.log')
    if ($LASTEXITCODE -ne 0) { throw 'The fixed original Node pin could not be read' }
    $pin = $pinJSON | ConvertFrom-Json
    if ($pin.version -cne '24.21.0' -or $pin.asset.source -cne 'official') { throw 'The failed source has an unexpected Node pin' }
    $download = Join-Path $checkout 'scripts/download-swa-node.ps1'
    $powershell = Join-Path $PSHOME 'pwsh.exe'
    $archive = Join-Path $work $pin.asset.archive
    Invoke-Preparation 'node-download' $powershell @('-NoProfile', '-NonInteractive', '-File', $download, '-Uri', $pin.nodeUrl, '-WorkDirectory', $work, '-OutputFile', $archive)
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.asset.archiveSha256) { throw 'The original Node archive checksum differs' }
    $nodeRoot = Join-Path $work 'node'
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $nodeRoot, $false)
    $node = Join-Path $nodeRoot 'node-v24.21.0-win-x64/node.exe'
    if ((Get-Item -LiteralPath $node).Length -ne $pin.asset.executableSize -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.asset.executableSha256 -or (& $node --version).Trim() -cne 'v24.21.0') { throw 'The original Node executable differs' }
    $env:SWA_PI_PROBE_PHASE = 'original-python-preflight'
    $pythonJSON = & $node --input-type=module -e 'import{pathToFileURL}from"node:url";const m=await import(pathToFileURL(process.argv[1]));console.log(JSON.stringify(await m.buildPython(process.argv[2])))' (Join-Path $sourceRoot 'scripts/swa-package-config.mjs') $Python
    if ($LASTEXITCODE -ne 0) { throw 'The actual original Python preflight failed' }
    $pythonInfo = $pythonJSON | ConvertFrom-Json
    $Python = $pythonInfo.executable
    $headersArchive = Join-Path $work $pin.headers.file
    Invoke-Preparation 'headers-download' $powershell @('-NoProfile', '-NonInteractive', '-File', $download, '-Uri', $pin.headersUrl, '-WorkDirectory', $work, '-OutputFile', $headersArchive)
    if ((Get-FileHash -LiteralPath $headersArchive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.headers.sha256) { throw 'The original headers checksum differs' }
    $headersRoot = Join-Path $work 'headers'
    New-Item -ItemType Directory -Path $headersRoot | Out-Null
    Invoke-Preparation 'headers-extract' $tar @('-xzf', $headersArchive, '-C', $headersRoot)
    $nodeDir = Join-Path $headersRoot 'node-v24.21.0'
    New-Item -ItemType Directory -Path (Join-Path $nodeDir 'Release') | Out-Null
    $nodeLibrary = Join-Path $nodeDir 'Release/node.lib'
    Invoke-Preparation 'node-library-download' $powershell @('-NoProfile', '-NonInteractive', '-File', $download, '-Uri', $pin.libraryUrl, '-WorkDirectory', $work, '-OutputFile', $nodeLibrary)
    if ((Get-FileHash -LiteralPath $nodeLibrary -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.library.sha256) { throw 'The original import library checksum differs' }
    Set-Location -LiteralPath $sourceRoot
    Invoke-Preparation 'frozen-component-dependencies' $developmentNode @($PnpmCli, '--filter', '@swa/orca-runtime', 'install', '--frozen-lockfile', '--ignore-scripts')
    $runtime = Join-Path $work 'r'
    Invoke-Preparation 'component-production-deploy' $developmentNode @($PnpmCli, '--config.node-linker=hoisted', '--filter', '@swa/orca-runtime', '--prod', 'deploy', '--ignore-scripts', '--verify-store-integrity', $runtime, '--store-dir', (Join-Path $work 'store'))
    $toolRuntime = Join-Path $sourceRoot 'runtime/swa-orca'
    $gyp = (& $node -e 'const r=require("node:module").createRequire(process.argv[1]);if(r("node-gyp/package.json").version!=="12.3.0")process.exit(2);process.stdout.write(r.resolve("node-gyp/bin/node-gyp.js"))' (Join-Path $toolRuntime 'package.json')).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'The original locked node-gyp differs' }
    if ($processIncarnation) {
        $processTreeJSON = & $node -e 'const{createRequire}=require("node:module"),fs=require("node:fs"),path=require("node:path");const r=createRequire(process.argv[1]),t=createRequire(process.argv[2]),lock=t("yaml").parse(fs.readFileSync(path.join(process.argv[3],"pnpm-lock.yaml"),"utf8"));console.log(JSON.stringify({version:r("@vscode/windows-process-tree/package.json").version,patch:lock.patchedDependencies["@vscode/windows-process-tree@0.8.0"]}))' (Join-Path $runtime 'package.json') (Join-Path $toolRuntime 'package.json') $sourceRoot
        if ($LASTEXITCODE -ne 0) { throw 'The actual process-tree source identity is unavailable' }
        $processTreeSource = $processTreeJSON | ConvertFrom-Json
        if ($processTreeSource.version -cne '0.8.0' -or $processTreeSource.patch -cne '9da74aa3d17243aa53dcdc95c9f06e97437e7fbccf098aeb017579e2d24cbac2') { throw 'The actual process-tree frozen source differs' }
    }
    $env:SWA_PI_PROBE_PHASE = 'official-msvc-toolchain'
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    $vsJSON = & $vswhere -products '*' -version '[18.0,19.0)' -requires 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64' -format json -utf8 -nologo
    if ($LASTEXITCODE -ne 0) { throw 'Official VS2026 discovery failed' }
    $installations = @($vsJSON | ConvertFrom-Json | Sort-Object { [version]$_.installationVersion } -Descending)
    if ($installations.Count -eq 0 -or -not $installations[0].isComplete) { throw 'The original probe requires a complete VS2026 x64 installation' }
    $selected = $installations[0]
    & (Join-Path $selected.installationPath 'Common7/Tools/Launch-VsDevShell.ps1') -Arch amd64 -HostArch amd64 -SkipAutomaticLocation *> (Join-Path $evidence 'developer-shell.raw.log')
    if (-not $env:VCINSTALLDIR -or ([version]$env:VSCMD_VER).Major -ne 18 -or -not [IO.Path]::GetFullPath((Join-Path $env:VCINSTALLDIR '..')).Equals([IO.Path]::GetFullPath($selected.installationPath), [StringComparison]::OrdinalIgnoreCase)) { throw 'The actual developer environment differs from the selected installation' }
    if (-not (Test-Path -LiteralPath (Join-Path $selected.installationPath 'MSBuild/Current/Bin/MSBuild.exe') -PathType Leaf) -or -not $env:WindowsSdkDir -or -not $env:WindowsSDKVersion -or -not (Test-Path -LiteralPath (Join-Path $env:WindowsSdkDir ('Include/' + $env:WindowsSDKVersion)) -PathType Container)) { throw 'The actual MSBuild or SDK is unavailable' }
    $compiler = (Get-Command cl -CommandType Application | Select-Object -First 1).Source
    if (-not [IO.Path]::GetFullPath($compiler).StartsWith(([IO.Path]::GetFullPath($selected.installationPath).TrimEnd('\') + '\VC\Tools\MSVC\'), [StringComparison]::OrdinalIgnoreCase) -or $compiler -notmatch '\\bin\\Hostx64\\x64\\cl\.exe$') { throw 'The actual x64 compiler differs from the selected installation' }
    $env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH
    $env:npm_config_msvs_version = '2026'
    $env:npm_config_devdir = Join-Path $work 'gyp-cache'
    $effective = & $node -e 'const g=require("node:module").createRequire(process.argv[1])("node-gyp/lib/node-gyp.js")();g.parseArgv([process.execPath,process.argv[2],"rebuild"]);console.log(JSON.stringify({msvs_version:g.opts["msvs-version"]}))' (Join-Path $toolRuntime 'package.json') $gyp
    if ($LASTEXITCODE -ne 0 -or ($effective | ConvertFrom-Json).msvs_version -cne '2026') { throw 'The original effective node-gyp selection conflicts' }
    $nativeComponent = if ($processIncarnation) { '@vscode/windows-process-tree' } else { '@orca/windows-security' }
    $nativeIndex = if ($processIncarnation) { 1 } else { 2 }
    $configuration = [ordered]@{ name = $nativeComponent; index = $nativeIndex; runtime = $runtime; work = $work; node = $node; nodeDir = $nodeDir; python = $Python; gyp = $gyp } | ConvertTo-Json -Compress
    $buildPhase = if ($processIncarnation) { 'single-windows-process-tree-build' } else { 'single-windows-security-build' }
    Invoke-Preparation $buildPhase $node @('--input-type=module', '-e', 'import{pathToFileURL}from"node:url";const m=await import(pathToFileURL(process.argv[1]));await m.buildNativePackage({...JSON.parse(process.argv[2]),environment:{...process.env}})', (Join-Path $sourceRoot 'scripts/build-swa-native.mjs'), $configuration)
    $preparation = [ordered]@{ failed_source_revision = $failedRevision; source_revision = $revision; observation_revision = $env:GITHUB_SHA; downloader_git_blob = $helperBlob; node_version = $pin.version; node_sha256 = $pin.asset.executableSha256; headers_sha256 = $pin.headers.sha256; import_library_sha256 = $pin.library.sha256; python_version = $pythonInfo.version; compiler_year = '2026'; actual_vs_version = $selected.installationVersion; actual_cl_version = [Diagnostics.FileVersionInfo]::GetVersionInfo($compiler).FileVersion; native_component = $nativeComponent; native_component_index = $nativeIndex; other_native_components_built = $false; dependency_lifecycles_executed = $false; original_baseline_native_rebuilt = $false }
    if ($processIncarnation) {
        $nativeBinary = (& $node -e 'const r=require("node:module").createRequire(process.argv[1]),path=require("node:path");process.stdout.write(path.join(path.dirname(r.resolve("@vscode/windows-process-tree/package.json")),"build","Release","windows_process_tree.node"))' (Join-Path $runtime 'package.json')).Trim()
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $nativeBinary -PathType Leaf)) { throw 'The actual compiled process-tree binary is unavailable' }
        $preparation.native_package_version = $processTreeSource.version
        $preparation.native_patch_hash = $processTreeSource.patch
        $preparation.native_binary_sha256 = (Get-FileHash -LiteralPath $nativeBinary -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $preparation | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'preparation.json')
    $env:SWA_PI_PROBE_PHASE = 'metadata-process'
    $metadataHelper = if ($processIncarnation) { Join-Path $sourceRoot 'tests/swa-cli-headless/windows-process-incarnation-control.mjs' } else { Join-Path $checkout 'tests/swa-cli-headless/windows-private-directory-control.mjs' }
    $metadataHelperHash = (Get-FileHash -LiteralPath $metadataHelper -Algorithm SHA256).Hash.ToLowerInvariant()
    $private = Join-Path $env:RUNNER_TEMP ($(if ($processIncarnation) { 'swa-process-incarnation-' } else { 'swa-private-directory-' }) + $env:GITHUB_SHA)
    Assert-PlainAncestors $private
    if (Test-Path -LiteralPath $private) { throw 'The metadata private parent already exists' }
    New-Item -ItemType Directory -Path $private | Out-Null
    $paths = @{}
    foreach ($name in @('home', 'appdata', 'localappdata', 'temp', 'data')) {
        $paths[$name] = Join-Path $private $name
        New-Item -ItemType Directory -Path $paths[$name] | Out-Null
    }
    $output = Join-Path $evidence 'control'
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $node
    $start.WorkingDirectory = $private
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.Environment.Clear()
    foreach ($key in @('SystemRoot', 'WINDIR', 'SystemDrive', 'ComSpec', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'PATHEXT')) {
        $value = [Environment]::GetEnvironmentVariable($key)
        if ($value) { $start.Environment[$key] = $value }
    }
    $start.Environment['PATH'] = (Split-Path -Parent $node) + ';' + (Join-Path $env:SystemRoot 'System32')
    $start.Environment['HOME'] = $paths.home
    $start.Environment['USERPROFILE'] = $paths.home
    $start.Environment['APPDATA'] = $paths.appdata
    $start.Environment['LOCALAPPDATA'] = $paths.localappdata
    $start.Environment['TEMP'] = $paths.temp
    $start.Environment['TMP'] = $paths.temp
    $metadataArguments = if ($processIncarnation) { @($metadataHelper, '--source-root', $sourceRoot, '--runtime-root', $runtime, '--data-root', $paths.data, '--output-dir', $output, '--source-revision', $revision) } else { @($metadataHelper, '--source-root', $sourceRoot, '--baseline-root', $baselineRoot, '--runtime-root', $runtime, '--tool-runtime-root', $toolRuntime, '--data-root', $paths.data, '--output-dir', $output, '--source-revision', $revision) }
    foreach ($argument in $metadataArguments) { $start.ArgumentList.Add($argument) }
    $processResult = Invoke-MetadataProcess $start $evidence
    if ($processResult.exited) { Set-Content -LiteralPath (Join-Path $evidence 'metadata.exit.txt') -Value $processResult.exit_code }
    if (-not $processResult.started -or -not $processResult.exited -or $processResult.timed_out -or $processResult.output_limit_exceeded -or $processResult.io_failed) { throw 'The bounded metadata process remains failed or unknown' }
    $metadata = Get-Content -LiteralPath (Join-Path $output 'result.json') -Raw | ConvertFrom-Json
    if ($processIncarnation) {
        if ($metadata.schema_version -ne 1 -or $metadata.status -cne 'CONTROL_COMPLETE' -or $metadata.source_revision -cne $revision -or $metadata.helper_sha256 -cne $metadataHelperHash -or $metadata.probe_exit -ne 0 -or $processResult.exit_code -ne 0 -or $metadata.diagnostic_only -isnot [bool] -or -not $metadata.diagnostic_only -or $metadata.control_complete -isnot [bool] -or -not $metadata.control_complete -or $metadata.model_calls -ne 0 -or $metadata.candidate_built -isnot [bool] -or $metadata.candidate_built -or $metadata.install_started -isnot [bool] -or $metadata.install_started -or $metadata.service_started -isnot [bool] -or $metadata.service_started -or $metadata.account_session_started -isnot [bool] -or $metadata.account_session_started) { throw 'The actual process incarnation control evidence is incomplete or inconsistent' }
        $closureHash = (Get-FileHash -LiteralPath (Join-Path $sourceRoot 'tests/swa-cli-headless/process-incarnation-closure.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()
        $native = $metadata.native_component
        $flags = $native.supported_process_data_flags
        if ($metadata.closure_sha256 -cne $closureHash -or $native.name -cne '@vscode/windows-process-tree' -or $native.version -cne '0.8.0' -or $native.addon_sha256 -cne $preparation.native_binary_sha256 -or ($flags -isnot [int] -and $flags -isnot [long]) -or $flags -lt 0 -or $flags -gt [uint32]::MaxValue -or ($flags -band 4) -ne 4 -or $native.loaded_binary_matches_compiled -isnot [bool] -or -not $native.loaded_binary_matches_compiled) { throw 'The actual loaded process component or closure differs from its prepared source' }
        $expectedCases = @('live-root-child', 'normal-eof')
        if ($metadata.cases -isnot [array] -or $metadata.cases.Count -ne $expectedCases.Count) { throw 'The process incarnation control cases are incomplete' }
        for ($index = 0; $index -lt $expectedCases.Count; $index++) {
            if ($metadata.cases[$index].name -cne $expectedCases[$index]) { throw 'The actual process incarnation control case differs' }
            if (($metadata.cases[$index] | ConvertTo-Json -Depth 14 -Compress).Length -gt 8000) { throw 'The actual process incarnation control metadata exceeds its output limit' }
            Publish-Metadata 'Actual process incarnation control' $metadata.cases[$index]
        }
    } else {
        if ($metadata.failed_source_revision -cne $failedRevision -or $metadata.source_revision -cne $revision -or $metadata.helper_sha256 -cne $metadataHelperHash -or $metadata.probe_exit -ne 0 -or $processResult.exit_code -ne 0 -or -not $metadata.diagnostic_only -or -not $metadata.control_complete -or $metadata.model_calls -ne 0 -or $metadata.candidate_built -or $metadata.install_started -or $metadata.service_started -or $metadata.account_session_started) { throw 'The actual directory control evidence is incomplete or inconsistent' }
        $expectedCases = @('fresh_directory', 'existing_private_directory', 'existing_ordinary_directory', 'existing_public_file', 'missing_parent', 'invalid_empty', 'invalid_nul', 'invalid_relative', 'actual_junction', 'current_pi_consumer')
        if ($metadata.cases.Count -ne $expectedCases.Count) { throw 'The directory control cases are incomplete' }
        for ($index = 0; $index -lt $expectedCases.Count; $index++) {
            if ($metadata.cases[$index].name -cne $expectedCases[$index]) { throw 'The actual directory control case differs' }
            Publish-Metadata 'Actual private directory control' $metadata.cases[$index]
        }
    }
    Set-Content -LiteralPath (Join-Path $evidence 'control.exit.txt') -Value $processResult.exit_code
    $result.status = 'DIAGNOSTIC_COMPLETE'
    $result.control_exit = $processResult.exit_code
    $result.control_complete = $metadata.control_complete
    if ($processIncarnation) {
        $result.component = $Component
        Publish-Metadata 'Windows process incarnation component control only' $result
    } else {
        $result.baseline_run_reference = '39786376454'
        $result.baseline_native_rebuilt = $false
        $result.original_117_owner_and_aces = 'UNKNOWN'
        Publish-Metadata 'Windows private directory component control only' $result
    }
} catch {
    $result.status = 'FAIL'
    $result.failed_phase = $env:SWA_PI_PROBE_PHASE
    $result.exception_type = $_.Exception.GetType().FullName
    Publish-Metadata $(if ($processIncarnation) { 'Windows process incarnation preparation failed' } else { 'Windows Pi directory component preparation failed' }) $result
    throw 'The component diagnostic failed; see the bounded phase/type metadata'
} finally {
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence 'driver-result.json')
}
# abef原guard失败保持历史事实；本次全部实际组件控制通过才成功收尾。
exit 0
