#Requires -Version 7.2
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PnpmCli, [switch]$PathOnly)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$env:SWA_VS_PROBE_PHASE = 'preflight'
if (-not $IsWindows) { throw 'This local probe requires actual Windows' }
$checkout = (Get-Item -LiteralPath $env:GITHUB_WORKSPACE).FullName
Set-Location -LiteralPath $checkout
$evidence = Join-Path $checkout '.verification/swa-ci/vs-probe'
$rejectedWork = Join-Path $env:RUNNER_TEMP 'swa-visualstudio-probe'
foreach ($directory in @($evidence, $rejectedWork)) {
    if (Test-Path -LiteralPath $directory) { throw 'A probe output directory already exists' }
    New-Item -ItemType Directory -Path $directory | Out-Null
}
$developmentNode = (Get-Command node -CommandType Application | Select-Object -First 1).Source
if ((& $developmentNode --version).Trim() -cne 'v24.16.0' -or (& $developmentNode $PnpmCli --version).Trim() -cne '11.27.0') { throw 'The pinned development tools differ' }
$env:SWA_VS_PROBE_PHASE = 'frozen-prerequisites'
& $developmentNode $PnpmCli --filter '@swa/orca-runtime' install --frozen-lockfile *> (Join-Path $evidence 'frozen-install.log')
if ($LASTEXITCODE -ne 0) { throw 'Frozen local probe prerequisites failed' }
$env:SWA_VS_PROBE_PHASE = 'original-node-pin'
$assetJSON = & $developmentNode --input-type=module -e 'import{NODE_RUNTIME_ASSETS,nodeRuntimeReleaseUrl}from"./third_party/orca-v1.4.230/src/shared/node-runtime-pin.ts";let a=NODE_RUNTIME_ASSETS["win32-x64"];console.log(JSON.stringify({...a,url:nodeRuntimeReleaseUrl("official",a.archive)}));'
if ($LASTEXITCODE -ne 0) { throw 'Original Node pin could not be loaded' }
$asset = $assetJSON | ConvertFrom-Json
$env:SWA_VS_PROBE_PHASE = 'download-work-guard'
$download = Join-Path $checkout 'scripts/download-swa-node.ps1'
$rejectedOutput = Join-Path $rejectedWork $asset.archive
$guardLog = Join-Path $evidence 'download-work-guard.log'
& (Join-Path $PSHOME 'pwsh.exe') -NoProfile -NonInteractive -File $download -Uri $asset.url -WorkDirectory $rejectedWork -OutputFile $rejectedOutput *> $guardLog
$guardExit = $LASTEXITCODE
$guard = Get-Content -LiteralPath $guardLog -Raw | ConvertFrom-Json
if ($guardExit -ne 1 -or $guard.schema -cne 'swa.node-download.v1' -or $guard.stage -cne 'validate' -or $guard.error_type -cne 'System.ArgumentException' -or (Test-Path -LiteralPath $rejectedOutput)) { throw 'The original invalid download work path did not fail at its expected guard' }
$guardResult = [ordered]@{ diagnostic_only = $true; original_invalid_work_exit = $guardExit; stage = $guard.stage; error_type = $guard.error_type; output_exists = $false; http_request_started = $false }
$guardResult | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'download-work-guard.json')
$guardMessage = ($guardResult | ConvertTo-Json -Compress).Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
Write-Host ('::warning title=Original download work guard reproduction::' + $guardMessage)
$buildRoot = Join-Path $checkout '.verification/swa-cli-headless-20261020/build'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$work = Join-Path $buildRoot ('candidate-' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(3)))
New-Item -ItemType Directory -Path $work | Out-Null
$env:SWA_VS_PROBE_PHASE = 'pinned-node-download'
$archive = Join-Path $work $asset.archive
& (Join-Path $PSHOME 'pwsh.exe') -NoProfile -NonInteractive -File $download -Uri $asset.url -WorkDirectory $work -OutputFile $archive *> (Join-Path $evidence 'node-download.log')
if ($LASTEXITCODE -ne 0) { throw 'The original pinned Node downloader failed; its safe phase log is retained' }
$env:SWA_VS_PROBE_PHASE = 'pinned-node-verification'
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $asset.archiveSha256) { throw 'The original Node archive checksum differs' }
$extracted = Join-Path $work 'node'
[IO.Compression.ZipFile]::ExtractToDirectory($archive, $extracted, $false)
$node = Join-Path $extracted 'node-v24.21.0-win-x64/node.exe'
if ((Get-Item -LiteralPath $node).Length -ne $asset.executableSize -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -cne $asset.executableSha256 -or (& $node --version).Trim() -cne 'v24.21.0') { throw 'The actual pinned Node executable differs' }
if (-not $PathOnly) {
    $finder = (& $developmentNode --input-type=module -e 'import{createRequire}from"node:module";let r=createRequire(process.cwd()+"/runtime/swa-orca/package.json");console.log(r.resolve("node-gyp/lib/find-visualstudio.js"));').Trim()
    if ($LASTEXITCODE -ne 0) { throw 'The exact locked finder is unavailable' }
}
$probe = Join-Path $checkout 'scripts/probe-swa-visualstudio.mjs'
# 与原失败 builder 相同的配置入口，真实工具版本仍由官方环境发现。
if (-not $PathOnly) { $env:npm_config_msvs_version = '2022' }
function Publish-Probe([string]$Title, [object]$Value) {
    $message = $Value | ConvertTo-Json -Depth 12 -Compress
    $message = [regex]::Replace($message, '(?i)https?://\S+', '[URL omitted]')
    $message = [regex]::Replace($message, '(?i)[a-z]:(?:\\)+Users(?:\\)+[^\\/\s"'']+', '[CI user home]')
    if ($message.Length -gt 8000) { $message = $message.Substring(0, 8000) + '[bounded summary]' }
    $escaped = $message.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Host ('::warning title=' + $Title + '::' + $escaped)
}
if ($PathOnly) {
    $env:SWA_VS_PROBE_PHASE = 'path-and-git'
    $git = (Get-Command git -CommandType Application | Select-Object -First 1).Source
    $pathProbe = Join-Path $checkout 'scripts/probe-swa-windows-path.mjs'
    $before = Join-Path $evidence 'path-before-devshell.json'
    & $node $pathProbe --git $git --phase before-devshell --output $before 2> (Join-Path $evidence 'path-before-devshell.log')
    $beforeExit = $LASTEXITCODE
    if (Test-Path -LiteralPath $before -PathType Leaf) { Publish-Probe 'Actual PATH and Git before Developer Shell' (Get-Content -LiteralPath $before -Raw | ConvertFrom-Json) }
    if ($beforeExit -ne 0) { throw 'The initial bounded PATH/Git observation did not finish' }
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    $metadataJSON = & $vswhere -products '*' -version '[18.0,19.0)' -requires 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64' -format json -utf8 -nologo
    if ($LASTEXITCODE -ne 0) { throw 'Official PATH probe Visual Studio discovery failed' }
    $installations = @($metadataJSON | ConvertFrom-Json | Sort-Object { [version]$_.installationVersion } -Descending)
    if ($installations.Count -eq 0 -or -not $installations[0].isComplete) { throw 'The PATH probe requires an actual complete VS2026 x64 installation' }
    $selected = $installations[0]
    & (Join-Path $selected.installationPath 'Common7/Tools/Launch-VsDevShell.ps1') -Arch amd64 -HostArch amd64 -SkipAutomaticLocation *> (Join-Path $evidence 'path-devshell-entry.log')
    if (-not $env:VCINSTALLDIR -or ([version]$env:VSCMD_VER).Major -ne 18 -or -not [IO.Path]::GetFullPath((Join-Path $env:VCINSTALLDIR '..')).Equals([IO.Path]::GetFullPath($selected.installationPath), [StringComparison]::OrdinalIgnoreCase)) { throw 'The PATH probe developer environment does not match the selected real installation' }
    $after = Join-Path $evidence 'path-after-devshell.json'
    & $node $pathProbe --git $git --phase after-devshell --output $after 2> (Join-Path $evidence 'path-after-devshell.log')
    $afterExit = $LASTEXITCODE
    if (Test-Path -LiteralPath $after -PathType Leaf) { Publish-Probe 'Actual PATH and Git after Developer Shell' (Get-Content -LiteralPath $after -Raw | ConvertFrom-Json) }
    if ($afterExit -ne 0) { throw 'The final bounded PATH/Git observation did not finish' }
    exit 0
}
$baseline = Join-Path $evidence 'baseline.json'
$env:SWA_VS_PROBE_PHASE = 'baseline-finder'
& $node $probe --finder $finder --output $baseline --mode baseline
$baselineExit = $LASTEXITCODE
Publish-Probe 'VS baseline observation only' (@{ process_exit = $baselineExit; observation = (Get-Content -LiteralPath $baseline -Raw | ConvertFrom-Json) })
if ($baselineExit -ne 0) { throw 'The bounded baseline probe did not finish; its outcome is unknown' }
$env:SWA_VS_PROBE_PHASE = 'official-vs-discovery'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$metadataJSON = & $vswhere -products '*' -version '[18.0,19.0)' -requires 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64' -format json -utf8 -nologo
if ($LASTEXITCODE -ne 0) { throw 'Official VS2026 installation discovery failed' }
$installations = @($metadataJSON | ConvertFrom-Json | Sort-Object { [version]$_.installationVersion } -Descending)
if ($installations.Count -eq 0) { throw 'No actual VS2026 x64 tool installation was reported' }
$selected = $installations[0]
Publish-Probe 'Official VS2026 metadata' (@{ installation_path = $selected.installationPath; installation_version = $selected.installationVersion; complete = $selected.isComplete })
$env:SWA_VS_PROBE_PHASE = 'experimental-probe-selection'
if ($env:VCINSTALLDIR) { throw 'The selection-only control requires the original environment without Developer Shell' }
$env:npm_config_msvs_version = '2026'
$selection = Join-Path $evidence 'experimental-probe-selection.json'
& $node $probe --finder $finder --output $selection --mode experimental-probe-selection
$selectionExit = $LASTEXITCODE
Publish-Probe 'Experimental 2026 selection without Developer Shell' (@{ process_exit = $selectionExit; observation = (Get-Content -LiteralPath $selection -Raw | ConvertFrom-Json) })
if ($selectionExit -ne 0) { throw 'The bounded experimental selection probe did not finish; its outcome is unknown' }
$launch = Join-Path $selected.installationPath 'Common7/Tools/Launch-VsDevShell.ps1'
$env:SWA_VS_PROBE_PHASE = 'official-developer-shell'
& $launch -Arch amd64 -HostArch amd64 -SkipAutomaticLocation *> (Join-Path $evidence 'devshell-entry.log')
$devshell = Join-Path $evidence 'devshell.json'
$env:SWA_VS_PROBE_PHASE = 'developer-shell-finder'
& $node $probe --finder $finder --output $devshell --mode devshell
$devshellExit = $LASTEXITCODE
$actual = Get-Content -LiteralPath $devshell -Raw | ConvertFrom-Json
Publish-Probe 'VS developer environment observation only' (@{ process_exit = $devshellExit; observation = $actual })
if ($devshellExit -ne 0 -or -not $actual.finder.vc_install_dir_present -or -not $actual.finder.accepted -or $actual.finder.actual.versionYear -ne 2026 -or $actual.finder.actual.toolset -cne 'v145') { throw 'The actual official developer environment did not establish the required finder result' }
if (-not [IO.Path]::GetFullPath($actual.finder.actual.path).Equals([IO.Path]::GetFullPath($selected.installationPath), [StringComparison]::OrdinalIgnoreCase)) { throw 'The finder selected a different Visual Studio installation' }
if (-not (Test-Path -LiteralPath $actual.finder.actual.msBuild -PathType Leaf)) { throw 'The actual MSBuild executable is missing' }
if (-not $env:WindowsSdkDir -or -not $env:WindowsSDKVersion -or -not (Test-Path -LiteralPath (Join-Path $env:WindowsSdkDir ('Include/' + $env:WindowsSDKVersion)) -PathType Container)) { throw 'The actual developer environment Windows SDK is missing' }
$env:SWA_VS_PROBE_PHASE = 'actual-compiler-version'
$compiler = (Get-Command cl -CommandType Application | Select-Object -First 1).Source
if (-not [IO.Path]::GetFullPath($compiler).StartsWith(([IO.Path]::GetFullPath($selected.installationPath).TrimEnd('\') + '\VC\Tools\MSVC\'), [StringComparison]::OrdinalIgnoreCase) -or $compiler -notmatch '\\bin\\Hostx64\\x64\\cl\.exe$') { throw 'The actual compiler is outside the selected VS2026 x64 toolchain' }
$version = [Diagnostics.FileVersionInfo]::GetVersionInfo($compiler)
& $compiler /Bv *> (Join-Path $evidence 'compiler-version.log')
$compilerExit = $LASTEXITCODE
if ($compilerExit -notin @(0, 2)) { throw 'The compiler version observation returned an unclassified exit' }
$result = [ordered]@{ diagnostic_only = $true; baseline_finder_accepted = (Get-Content -LiteralPath $baseline -Raw | ConvertFrom-Json).finder.accepted; experimental_selection_2026_finder_accepted = (Get-Content -LiteralPath $selection -Raw | ConvertFrom-Json).finder.accepted; devshell_finder_accepted = $actual.finder.accepted; actual_compiler_path = $compiler; actual_compiler_file_version = $version.FileVersion; actual_compiler_product_version = $version.ProductVersion; compiler_Bv_exit = $compilerExit; compiler_Bv_without_input_is_compile_test = $false; complete_candidate_built = $false; model_calls = 0 }
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence 'result.json')
Publish-Probe 'VS local MRE result only' $result
exit 0
