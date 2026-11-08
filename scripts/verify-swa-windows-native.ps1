#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PnpmCli,
    [Parameter(Mandatory)][string]$Python,
    [ValidateSet('2022', '2026')][string]$MsvsVersion = '2026',
    [ValidateSet('cli', 'combined')][string]$Edition = 'cli',
    [switch]$ControllerInputCheck
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$env:SWA_CI_PHASE = 'preflight-platform'
if (-not $IsWindows -or [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne 'X64') { throw 'Native Windows x64 is required' }
$inputs = [ordered]@{ pnpm = $PnpmCli; python = $Python; checkout = $env:GITHUB_WORKSPACE; temporary = $env:RUNNER_TEMP; program_files = $env:ProgramFiles }
foreach ($role in $inputs.Keys) {
    $env:SWA_CI_PHASE = 'preflight-input-' + $role
    $path = $inputs[$role]
    if (-not [IO.Path]::IsPathFullyQualified($path) -or -not (Test-Path -LiteralPath $path)) { throw ('An actual absolute CI input is missing: ' + $role) }
}
$env:SWA_CI_PHASE = 'preflight-source'
$checkout = (Get-Item -LiteralPath $env:GITHUB_WORKSPACE).FullName
Set-Location -LiteralPath $checkout
$revision = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $revision -cnotmatch '^[0-9a-f]{40}$' -or $revision -cne $env:GITHUB_SHA) { throw 'The exact CI source revision differs' }
$sourceStatus = & git status --porcelain --untracked-files=normal
if ($LASTEXITCODE -ne 0 -or $sourceStatus) { throw 'The candidate source is not clean' }
$evidence = Join-Path $checkout '.verification/swa-ci/windows'
$logs = Join-Path $evidence 'logs'
if (Test-Path -LiteralPath $evidence) { throw 'This evidence directory already exists' }
New-Item -ItemType Directory -Path $logs | Out-Null
Set-Content -LiteralPath (Join-Path $evidence 'SOURCE') -Value $revision
$node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$go = (Get-Command go -CommandType Application | Select-Object -First 1).Source
$powershell = Join-Path $env:ProgramFiles 'PowerShell/7/pwsh.exe'
$env:SWA_PNPM_CLI = (Get-Item -LiteralPath $PnpmCli).FullName
$env:SWA_BUILD_PYTHON = (Get-Item -LiteralPath $Python).FullName
$env:ASTROCYTE_GO = $go
$env:GOTOOLCHAIN = 'local'
$env:SWA_CI_PHASE = 'preflight-toolchain'
$result = [ordered]@{ source_revision = $revision; platform = 'win32-x64'; edition = $Edition; status = 'NOT_RUN'; model_calls = 0; agent_acceptance = 'NOT_RUN' }
$serviceObservation = $null

function Assert-NoReparse([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Evidence input contains a reparse point' }
        }
        $parent = [IO.Path]::GetDirectoryName($current)
        if ($parent -eq $current) { break }
        $current = $parent
    }
}

function Save-ServiceEvidenceSummary {
    $exitFile = Join-Path $evidence 'service-observer-exit.json'
    $summaryFile = Join-Path $evidence 'service-evidence-summary.json'
    $serviceDirectory = Join-Path $evidence 'smoke/readiness-eof'
    Assert-NoReparse $exitFile
    $serviceObservation | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $exitFile
    foreach ($path in @($exitFile, $summaryFile, $serviceDirectory, (Join-Path $install 'node/node.exe'), (Join-Path $install 'VERSION'))) { Assert-NoReparse $path }
    foreach ($name in @('windows-service-evidence-summary.mjs', 'serve-lifecycle.mjs', 'controller-taskcreate-check.mjs', 'controller-input-check.mjs', 'process-incarnation-closure.mjs')) { Assert-NoReparse (Join-Path $checkout ('tests/swa-cli-headless/' + $name)) }
    foreach ($name in @('service-query-evidence.json', 'service-process-lifecycle.json', 'result.json')) { Assert-NoReparse (Join-Path $serviceDirectory $name) }
    $summaryStart = [Diagnostics.ProcessStartInfo]::new()
    $summaryStart.FileName = Join-Path $install 'node/node.exe'
    $summaryStart.WorkingDirectory = $install
    $summaryStart.UseShellExecute = $false
    $summaryStart.RedirectStandardOutput = $true
    $summaryStart.RedirectStandardError = $true
    foreach ($argument in @((Join-Path $checkout 'tests/swa-cli-headless/windows-service-evidence-summary.mjs'), '--source-root', $checkout, '--install-root', $install, '--evidence', $serviceDirectory, '--source-revision', $revision, '--observer-exit-file', $exitFile, '--output', $summaryFile)) { $summaryStart.ArgumentList.Add($argument) }
    $summaryProcess = [Diagnostics.Process]::new()
    $summaryProcess.StartInfo = $summaryStart
    $watch = [Diagnostics.Stopwatch]::StartNew()
    if (-not $summaryProcess.Start()) { throw 'The evidence summary process did not start' }
    $summaryOutput = $summaryProcess.StandardOutput.ReadToEndAsync()
    $summaryErrors = $summaryProcess.StandardError.ReadToEndAsync()
    if (-not $summaryProcess.WaitForExit([Math]::Max(0, 30000 - [int]$watch.ElapsedMilliseconds))) { throw 'The evidence summary exceeded its deadline' }
    $remaining = [Math]::Max(0, 30000 - [int]$watch.ElapsedMilliseconds)
    if (-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($summaryOutput, $summaryErrors), $remaining)) { throw 'The evidence summary streams remain incomplete' }
    Set-Content -LiteralPath (Join-Path $logs 'service-evidence-summary.exit.txt') -Value $summaryProcess.ExitCode
    $text = $summaryOutput.GetAwaiter().GetResult()
    if ([Text.Encoding]::UTF8.GetByteCount($text) -gt 8192 -or $summaryErrors.GetAwaiter().GetResult().Length -ne 0) { throw 'The evidence summary output is invalid' }
    $safe = $text | ConvertFrom-Json
    if ($safe.schema_version -ne 1 -or $safe.source_revision -cne $revision -or $safe.status -cnotin @('PASS', 'FAIL') -or -not $safe.first_failure -or -not $safe.service_evidence) { throw 'The evidence summary envelope is invalid' }
    $messages = @($safe.first_failure, $safe.service_evidence) | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress -Depth 30 }
    foreach ($message in $messages) { if ([Text.Encoding]::UTF8.GetByteCount($message) -gt 3500) { throw 'The evidence summary exceeds its annotation bound' } }
    foreach ($message in $messages) { Write-Output ('::warning::' + $message.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')) }
    if ($summaryProcess.ExitCode -ne 0 -or $safe.status -cne 'PASS') { throw 'The actual service evidence did not pass' }
}

function Invoke-Logged([string]$Name, [string]$Program, [string[]]$Arguments) {
    $env:SWA_CI_PHASE = $Name
    $log = Join-Path $logs ($Name + '.log')
    & $Program @Arguments *> $log
    $code = $LASTEXITCODE
    Set-Content -LiteralPath (Join-Path $logs ($Name + '.exit.txt')) -Value $code
    if ($code -ne 0) {
        Get-Content -LiteralPath $log -Tail 60
        throw "$Name exited $code; its original output and partial files are retained"
    }
    Write-Output "$Name exit=0"
}

try {
    if ((& $node --version).Trim() -cne 'v24.16.0' -or (& $node $PnpmCli --version).Trim() -cne '11.27.0') { throw 'The development Node or pnpm version differs' }
    if ((& $go version).Trim() -cne 'go version go1.27.2 windows/amd64') { throw 'The Go version differs' }
    Invoke-Logged 'frozen-install' $node @($PnpmCli, '--filter', '{.}', '--filter', '{./web}', '--filter', '@swa/orca-runtime', '--filter', '@orca/process-host', 'install', '--frozen-lockfile')
    Invoke-Logged 'go-download' $go @('mod', 'download')
    Invoke-Logged 'go-verify' $go @('mod', 'verify')
    $env:SWA_CI_PHASE = 'msvc-toolchain'
    $major = if ($MsvsVersion -ceq '2026') { 18 } else { 17 }
    $toolset = if ($MsvsVersion -ceq '2026') { 'v145' } else { 'v143' }
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    $metadataJSON = & $vswhere -products '*' -version ('[' + $major + '.0,' + ($major + 1) + '.0)') -requires 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64' -format json -utf8 -nologo
    if ($LASTEXITCODE -ne 0) { throw 'The official selected Visual Studio discovery failed' }
    $installations = @($metadataJSON | ConvertFrom-Json | Sort-Object { [version]$_.installationVersion } -Descending)
    if ($installations.Count -eq 0) { throw 'The explicitly selected Visual Studio x64 toolchain is not installed' }
    $selected = $installations[0]
    if (-not $selected.isComplete -or ([version]$selected.installationVersion).Major -ne $major) { throw 'The selected Visual Studio installation is incomplete or has the wrong version' }
    & (Join-Path $selected.installationPath 'Common7/Tools/Launch-VsDevShell.ps1') -Arch amd64 -HostArch amd64 -SkipAutomaticLocation *> (Join-Path $logs 'toolchain-devshell.log')
    if (-not $env:VCINSTALLDIR -or -not $env:VSCMD_VER -or ([version]$env:VSCMD_VER).Major -ne $major) { throw 'The official developer environment did not establish the selected compiler version' }
    $actualVS = [IO.Path]::GetFullPath((Join-Path $env:VCINSTALLDIR '..'))
    if (-not $actualVS.Equals([IO.Path]::GetFullPath($selected.installationPath), [StringComparison]::OrdinalIgnoreCase)) { throw 'The developer environment belongs to a different Visual Studio installation' }
    $msbuild = Join-Path $selected.installationPath 'MSBuild/Current/Bin/MSBuild.exe'
    if (-not (Test-Path -LiteralPath $msbuild -PathType Leaf) -or -not $env:WindowsSdkDir -or -not $env:WindowsSDKVersion -or -not (Test-Path -LiteralPath (Join-Path $env:WindowsSdkDir ('Include/' + $env:WindowsSDKVersion)) -PathType Container)) { throw 'The selected actual MSBuild or Windows SDK is missing' }
    $compiler = (Get-Command cl -CommandType Application | Select-Object -First 1).Source
    if (-not [IO.Path]::GetFullPath($compiler).StartsWith(([IO.Path]::GetFullPath($selected.installationPath).TrimEnd('\') + '\VC\Tools\MSVC\'), [StringComparison]::OrdinalIgnoreCase) -or $compiler -notmatch '\\bin\\Hostx64\\x64\\cl\.exe$') { throw 'The actual x64 compiler is outside the selected installation' }
    $compilerVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($compiler)
    $env:npm_config_msvs_version = $MsvsVersion
    $gypOptions = & $node -e 'const{createRequire}=require("node:module");const r=createRequire(process.cwd()+"/runtime/swa-orca/package.json");const gyp=r("node-gyp/lib/node-gyp.js")();gyp.parseArgv([process.execPath,r.resolve("node-gyp/bin/node-gyp.js"),"rebuild"]);console.log(JSON.stringify({msvs_version:gyp.opts["msvs-version"]}))'
    if ($LASTEXITCODE -ne 0 -or ($gypOptions | ConvertFrom-Json).msvs_version -cne $MsvsVersion) { throw 'The effective node-gyp compiler selection conflicts with the explicit CI selection' }
    [ordered]@{ selected_msvs_version = $MsvsVersion; actual_vs_path = $actualVS; actual_vs_version = $selected.installationVersion; developer_environment_version = $env:VSCMD_VER; expected_gyp_toolset = $toolset; actual_msbuild = $msbuild; actual_sdk_version = $env:WindowsSDKVersion; actual_cl_path = $compiler; actual_cl_file_version = $compilerVersion.FileVersion; actual_cl_product_version = $compilerVersion.ProductVersion; effective_gyp_msvs_version = ($gypOptions | ConvertFrom-Json).msvs_version; native_compilation = 'NOT_RUN' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logs 'toolchain-preflight.log')
    $name = 'swa-windows-' + $Edition + '-' + $revision
    $candidate = Join-Path $checkout ('dist/' + $name)
    Invoke-Logged 'build' $node @($PnpmCli, 'build:swa', '--output', $candidate, '--edition', $Edition, '--python', $Python, '--msvs-version', $MsvsVersion)
    $artifacts = Join-Path $env:RUNNER_TEMP 'swa-artifacts'
    $packages = Join-Path $env:RUNNER_TEMP 'swa-packages'
    $installs = Join-Path $env:RUNNER_TEMP 'swa-installs'
    foreach ($path in @($artifacts, $packages, $installs)) {
        if (Test-Path -LiteralPath $path) { throw 'A candidate output parent already exists' }
        New-Item -ItemType Directory -Path $path | Out-Null
    }
    $env:SWA_CI_PHASE = 'archive'
    $archive = Join-Path $artifacts ($name + '.zip')
    [IO.Compression.ZipFile]::CreateFromDirectory($candidate, $archive, [IO.Compression.CompressionLevel]::Optimal, $true)
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath ($archive + '.sha256') -Value ($hash + '  ' + [IO.Path]::GetFileName($archive))
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $hash) { throw 'The archive checksum differs' }
    $env:SWA_CI_PHASE = 'extract'
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $packages, $false)
    Set-Content -LiteralPath (Join-Path $logs 'archive-check.log') -Value ('ZIP SHA256=' + $hash + '; ordinary .NET extraction completed without overwrite')
    $package = Join-Path $packages $name
    $install = Join-Path $installs $name
    $checker = Join-Path $package 'scripts/check-swa-runtime.mjs'
    Invoke-Logged 'extracted-check' (Join-Path $package 'node/node.exe') @($checker, '--candidate', $package)
    $env:SWA_CI_PHASE = 'install'
    try {
        & (Join-Path $package 'install-swa.ps1') -PackageRoot $package -InstallRoot $install -ProtectedRoots @($checkout, $env:ProgramFiles) *> (Join-Path $logs 'install.log')
        Set-Content -LiteralPath (Join-Path $logs 'install.exit.txt') -Value 0
    } catch {
        Set-Content -LiteralPath (Join-Path $logs 'install.exit.txt') -Value 1
        throw
    }
    Invoke-Logged 'installed-check' (Join-Path $install 'node/node.exe') @((Join-Path $install 'scripts/check-swa-runtime.mjs'), '--candidate', $install)
    $actual = (& (Join-Path $install 'swa.exe') --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $actual -cne $revision -or (Get-Content -LiteralPath (Join-Path $install 'VERSION') -Raw).Trim() -cne $revision) { throw 'The installed source version differs' }
    $env:SWA_CI_PHASE = 'installed-acl'
    $acl = Get-Acl -LiteralPath $install
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $ownerMatches = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $sid
    $rulesProtected = $acl.AreAccessRulesProtected
    [ordered]@{ owner_matches_current_user = $ownerMatches; access_rules_protected = $rulesProtected } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logs 'installed-acl.json')
    if (-not $rulesProtected) { throw 'The actual installation root still inherits access rules' }
    if (-not $ownerMatches) { throw 'The actual installation root owner differs from the current user' }
    $seenTrustees = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $expectedInheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        $trustee = $rule.IdentityReference.Value
        if ($rule.IsInherited -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $trustee -notin @($sid, 'S-1-5-18') -or -not $seenTrustees.Add($trustee) -or $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or $rule.InheritanceFlags -ne $expectedInheritance -or $rule.PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None) { throw 'The installation root has unexpected access rules' }
    }
    if (-not $seenTrustees.Contains($sid)) { throw 'The installation root lacks the exact owner access rule' }
    $env:SWA_CI_PHASE = 'service-smoke'
    $private = Join-Path $env:RUNNER_TEMP ('swa-data-' + $revision)
    if (Test-Path -LiteralPath $private) { throw 'The private CI data parent already exists' }
    New-Item -ItemType Directory -Path $private | Out-Null
    $privateHome = Join-Path $private 'discovery-home'
    $roaming = Join-Path $private 'appdata'
    $local = Join-Path $private 'localappdata'
    $temporary = Join-Path $private 'temp'
    $dataParent = Join-Path $private 'product'
    foreach ($path in @($privateHome, $roaming, $local, $temporary, $dataParent)) { New-Item -ItemType Directory -Path $path | Out-Null }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Join-Path $install 'node/node.exe'
    $start.WorkingDirectory = $install
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.Environment.Clear()
    foreach ($key in @('SystemRoot', 'WINDIR', 'ComSpec', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'PATHEXT')) {
        $value = [Environment]::GetEnvironmentVariable($key)
        if ($value) { $start.Environment[$key] = $value }
    }
    $git = (Get-Command git -CommandType Application | Select-Object -First 1).Source
    $start.Environment['PATH'] = ((Join-Path $install 'node'), (Join-Path $env:SystemRoot 'System32'), (Split-Path -Parent $powershell), (Split-Path -Parent $git)) -join ';'
    $start.Environment['USERPROFILE'] = $privateHome
    $start.Environment['HOME'] = $privateHome
    $start.Environment['APPDATA'] = $roaming
    $start.Environment['LOCALAPPDATA'] = $local
    $start.Environment['TEMP'] = $temporary
    $start.Environment['TMP'] = $temporary
    $env:SWA_CI_PHASE = 'process-incarnation'
    $ordinaryData = Join-Path $private 'ordinary-processes'
    New-Item -ItemType Directory -Path $ordinaryData | Out-Null
    $ordinaryStart = [Diagnostics.ProcessStartInfo]::new()
    $ordinaryStart.FileName = $start.FileName
    $ordinaryStart.WorkingDirectory = $install
    $ordinaryStart.UseShellExecute = $false
    $ordinaryStart.RedirectStandardOutput = $true
    $ordinaryStart.RedirectStandardError = $true
    $ordinaryStart.Environment.Clear()
    foreach ($entry in $start.Environment.GetEnumerator()) { $ordinaryStart.Environment[$entry.Key] = $entry.Value }
    foreach ($argument in @((Join-Path $checkout 'tests/swa-cli-headless/windows-process-incarnation-control.mjs'), '--source-root', $checkout, '--runtime-root', (Join-Path $install 'runtime'), '--data-root', $ordinaryData, '--output-dir', (Join-Path $evidence 'process-incarnation'), '--source-revision', $revision)) { $ordinaryStart.ArgumentList.Add($argument) }
    $ordinaryProcess = [Diagnostics.Process]::new()
    $ordinaryProcess.StartInfo = $ordinaryStart
    $ordinaryWatch = [Diagnostics.Stopwatch]::StartNew()
    if (-not $ordinaryProcess.Start()) { throw 'The ordinary process fixture did not start' }
    $ordinaryOutput = $ordinaryProcess.StandardOutput.ReadToEndAsync()
    $ordinaryErrors = $ordinaryProcess.StandardError.ReadToEndAsync()
    if (-not $ordinaryProcess.WaitForExit([Math]::Max(0, 90000 - [int]$ordinaryWatch.ElapsedMilliseconds))) { throw 'The ordinary process fixture remains unknown after its deadline' }
    $ordinaryRemaining = [Math]::Max(0, 90000 - [int]$ordinaryWatch.ElapsedMilliseconds)
    if (-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($ordinaryOutput, $ordinaryErrors), $ordinaryRemaining)) { throw 'The ordinary process fixture streams remain unknown after its deadline' }
    Set-Content -LiteralPath (Join-Path $logs 'process-incarnation.log') -Value ($ordinaryOutput.GetAwaiter().GetResult() + $ordinaryErrors.GetAwaiter().GetResult())
    Set-Content -LiteralPath (Join-Path $logs 'process-incarnation.exit.txt') -Value $ordinaryProcess.ExitCode
    if ($ordinaryProcess.ExitCode -ne 0) { throw 'The ordinary process fixture failed or remains unknown' }
    $env:SWA_CI_PHASE = 'service-smoke'
    foreach ($argument in @('--max-old-space-size=1024', (Join-Path $checkout 'tests/swa-cli-headless/serve-lifecycle.mjs'), '--candidate', $install, '--source-revision', $revision, '--edition', $Edition, '--evidence', (Join-Path $evidence 'smoke'), '--data-parent', $dataParent, '--protected-roots', ($checkout + ';' + $env:ProgramFiles), '--port', '18793', '--mode', 'readiness-eof')) { $start.ArgumentList.Add($argument) }
    if ($ControllerInputCheck) { $start.ArgumentList.Add('--controller-input-check'); $start.ArgumentList.Add('--retain-query-evidence') }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    if ($ControllerInputCheck) { $serviceObservation = [ordered]@{ schema_version = 1; source_revision = $revision; phase = 'service-observer'; started = $false; exit = $null; timed_out = $false; stdout_bytes = $null; stderr_bytes = $null; stdout_eof = $false; stderr_eof = $false; outer_error = $null } }
    $serviceWait = if ($ControllerInputCheck) { 660000 } else { 240000 }
    $serviceWatch = [Diagnostics.Stopwatch]::StartNew()
    $output = $null
    $errors = $null
    if (-not $process.Start()) { throw 'The actual installed service check did not start' }
    if ($serviceObservation) { $serviceObservation.started = $true }
    $output = $process.StandardOutput.ReadToEndAsync()
    $errors = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit([Math]::Max(0, $serviceWait - [int]$serviceWatch.ElapsedMilliseconds))) {
        if ($serviceObservation) { $serviceObservation.timed_out = $true }
        throw 'The service check is unknown after its deadline; no whole-tree exit is claimed'
    }
    if ($serviceObservation) { $serviceObservation.exit = $process.ExitCode }
    $serviceRemaining = [Math]::Max(0, $serviceWait - [int]$serviceWatch.ElapsedMilliseconds)
    if (-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($output, $errors), $serviceRemaining) -or $serviceWatch.ElapsedMilliseconds -gt $serviceWait) {
        if ($serviceObservation) { $serviceObservation.timed_out = $true }
        throw 'The service streams remain unknown after the original deadline'
    }
    $actualOutput = $output.GetAwaiter().GetResult()
    $actualErrors = $errors.GetAwaiter().GetResult()
    if ($serviceObservation) {
        $serviceObservation.stdout_eof = $output.IsCompletedSuccessfully
        $serviceObservation.stderr_eof = $errors.IsCompletedSuccessfully
        $serviceObservation.stdout_bytes = [Text.Encoding]::UTF8.GetByteCount($actualOutput)
        $serviceObservation.stderr_bytes = [Text.Encoding]::UTF8.GetByteCount($actualErrors)
    }
    Set-Content -LiteralPath (Join-Path $logs 'service-smoke.log') -Value ($actualOutput + $actualErrors)
    Set-Content -LiteralPath (Join-Path $logs 'service-smoke.exit.txt') -Value $process.ExitCode
    if ($process.ExitCode -ne 0) { throw 'The actual service/Job shutdown check failed or remains unknown' }
    $env:SWA_CI_PHASE = 'final-source'
    $finalRevision = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $finalRevision -cne $revision) { throw 'The source version changed during verification' }
    $finalStatus = & git status --porcelain --untracked-files=normal
    if ($LASTEXITCODE -ne 0 -or $finalStatus) { throw 'The source changed during verification' }
    $result.status = 'PASS'
    $result.archive_sha256 = $hash
    $result.installed_version = $actual
    $result.service = 'PASS'
    $result.whole_service_job_shutdown = 'PASS'
} catch {
    if ($serviceObservation -and $env:SWA_CI_PHASE -ceq 'service-smoke') { $serviceObservation.outer_error = 'UNKNOWN' }
    $result.status = 'FAIL'
    $result.failed_stage = $env:SWA_CI_PHASE
    $result.failure = $_.Exception.Message
    throw
} finally {
    $summaryFailed = $false
    if ($serviceObservation) {
        try {
            if ($serviceObservation.started) {
                if ($process.HasExited) { $serviceObservation.exit = $process.ExitCode }
                $serviceObservation.stdout_eof = $null -ne $output -and $output.IsCompletedSuccessfully
                $serviceObservation.stderr_eof = $null -ne $errors -and $errors.IsCompletedSuccessfully
                if ($serviceObservation.stdout_eof) { $serviceObservation.stdout_bytes = [Text.Encoding]::UTF8.GetByteCount($output.GetAwaiter().GetResult()) }
                if ($serviceObservation.stderr_eof) { $serviceObservation.stderr_bytes = [Text.Encoding]::UTF8.GetByteCount($errors.GetAwaiter().GetResult()) }
            }
            Save-ServiceEvidenceSummary
            $result.service_evidence = 'PASS'
        }
        catch {
            $summaryFailed = $true
            $result.service_evidence = 'FAIL'
            Write-Output '::warning::{"schema_version":1,"status":"FAIL","error_kind":"SAFE_EVIDENCE_FAILED"}'
        }
    }
    $primaryPassed = $result.status -ceq 'PASS'
    if ($summaryFailed -and $primaryPassed) { $result.status = 'FAIL'; $result.failed_stage = 'service-evidence'; $result.failure = 'The safe service evidence failed' }
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence 'result.json')
    if ($summaryFailed -and $primaryPassed) { throw 'The safe service evidence failed; original files are retained' }
}
