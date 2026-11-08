#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$EvidenceRoot,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedRevision
)

$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathFullyQualified($EvidenceRoot)) { throw 'An absolute downloaded evidence directory is required' }
$source = (Get-Content -LiteralPath (Join-Path $EvidenceRoot 'SOURCE') -Raw).Trim()
if ($source -cne $ExpectedRevision) { throw 'The prior artifact source revision differs' }
$result = Get-Content -LiteralPath (Join-Path $EvidenceRoot 'result.json') -Raw | ConvertFrom-Json
if ($result.status -cne 'FAIL') { throw 'This is not an original failed artifact' }
if ($source -ceq '11717767f82a8a4070351ff74674aa0d268f79b2' -or $source -ceq '4aef552c63dd1ab5cd787fd2514d92a7815b943c') {
    $priorRun = if ($source -ceq '11717767f82a8a4070351ff74674aa0d268f79b2') { '39778043411' } else { '39846687508' }
    if ($result.failed_stage -cne 'service-smoke') { throw 'The original service candidate failed at a different stage' }
    function Format-ServiceError([string]$Text) {
        if ($Text -match '(?i)(authorization|\bbearer\b|\bbasic\s+[A-Za-z0-9+/=]+|token|nonce|api[-_]?key|secret|password|cookie|credential)') { return '[sensitive log line omitted]' }
        $safeText = [regex]::Replace($Text, '(?i)https?://\S+', '[URL omitted]')
        $safeText = [regex]::Replace($safeText, '(?i)[a-z]:[\\/]Users[\\/][^\\/\s"'']+', '[CI user home]')
        $safeText = [regex]::Replace($safeText, '/(?:home|Users)/[^/\s"'']+', '[user home]')
        $safeText = [regex]::Replace($safeText, '(?i)\bS-\d-(?:\d+-){1,14}\d+\b', '[SID omitted]')
        $safeText = [regex]::Replace($safeText, '(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', '[UUID omitted]')
        $safeText = [regex]::Replace($safeText, '(?i)\b[0-9a-f]{64}\b', '[digest or secret omitted]')
        $safeText = [regex]::Replace($safeText, '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '')
        if ($safeText.Length -gt 500) { $safeText = $safeText.Substring(0, 500) + ' [line truncated]' }
        return $safeText
    }
    $exits = [ordered]@{}
    foreach ($stage in @('frozen-install', 'go-download', 'go-verify', 'build', 'extracted-check', 'install', 'installed-check')) {
        $code = (Get-Content -LiteralPath (Join-Path $EvidenceRoot ('logs/' + $stage + '.exit.txt')) -Raw).Trim()
        if ($code -cne '0') { throw 'An original preceding service operation did not succeed' }
        $exits[$stage] = 0
    }
    $acl = Get-Content -LiteralPath (Join-Path $EvidenceRoot 'logs/installed-acl.json') -Raw | ConvertFrom-Json
    if ($acl.owner_matches_current_user -isnot [bool] -or $acl.access_rules_protected -isnot [bool]) { throw 'The actual original ACL booleans are unavailable' }
    $helperExit = 'UNKNOWN'
    $helperExitFile = Join-Path $EvidenceRoot 'logs/service-smoke.exit.txt'
    if (Test-Path -LiteralPath $helperExitFile -PathType Leaf) {
        $helperExitText = (Get-Content -LiteralPath $helperExitFile -Raw).Trim()
        if ($helperExitText -cnotmatch '^-?[0-9]{1,9}$') { throw 'The actual service helper exit is invalid' }
        $helperExit = [int]$helperExitText
    }
    $mode = $null
    $modeFile = Join-Path $EvidenceRoot 'smoke/readiness-eof/result.json'
    if (Test-Path -LiteralPath $modeFile -PathType Leaf) { $mode = Get-Content -LiteralPath $modeFile -Raw | ConvertFrom-Json }
    $actual = $null
    $actualFile = Join-Path $EvidenceRoot 'smoke/readiness-eof/actual-observation.json'
    if (Test-Path -LiteralPath $actualFile -PathType Leaf) { $actual = Get-Content -LiteralPath $actualFile -Raw | ConvertFrom-Json }
    $latest = $null
    $latestFile = Join-Path $EvidenceRoot 'smoke/readiness-eof/latest-actual-observation.json'
    if (Test-Path -LiteralPath $latestFile -PathType Leaf) { $latest = Get-Content -LiteralPath $latestFile -Raw | ConvertFrom-Json }
    $observation = [ordered]@{
        diagnostic_only = $true; prior_run = $priorRun; source_revision = $source; original_status = 'FAIL'; failed_stage = 'service-smoke'; recorded_preceding_exits = $exits
        actual_installed_acl = [ordered]@{ owner_matches_current_user = $acl.owner_matches_current_user; access_rules_protected = $acl.access_rules_protected }
        service_helper_exit = $helperExit
        mode_result_present = $null -ne $mode
        mode_status = if ($mode.status -cin @('UNKNOWN', 'OBSERVED', 'INCONCLUSIVE', 'AWAITING_ASSERTIONS')) { $mode.status } else { 'UNKNOWN' }
        serve_exit = if ($null -ne $actual -and $actual.PSObject.Properties.Name -contains 'exit') { $actual.exit } else { 'UNKNOWN' }
        unknown_process_observation_count = if ($actual.unknown_process_observations -is [array]) { $actual.unknown_process_observations.Count } elseif ($latest.unknown_process_observations -is [array]) { $latest.unknown_process_observations.Count } else { 'UNKNOWN' }
        exit_observation_count = if ($actual.exit_observations -is [array]) { $actual.exit_observations.Count } else { 'UNKNOWN' }
        cim_process_exit = if ($null -ne $actual.actual_cim_process_exit -and $actual.actual_cim_process_exit.PSObject.Properties.Name -contains 'exit') { $actual.actual_cim_process_exit.exit } else { 'UNKNOWN' }
        cim_all_exited = if ($actual.actual_cim_report.all_exited -is [bool]) { $actual.actual_cim_report.all_exited } else { 'UNKNOWN' }
        ready_service_observation_present = Test-Path -LiteralPath (Join-Path $EvidenceRoot 'smoke/readiness-eof/ready-service-observation.json') -PathType Leaf
        unsettled_observation_present = Test-Path -LiteralPath (Join-Path $EvidenceRoot 'smoke/readiness-eof/unsettled.json') -PathType Leaf
        complete_service_acceptance = 'FAIL'; model_calls = 0
    }
    $facts = ($observation | ConvertTo-Json -Depth 7 -Compress).Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Host ('::warning title=Retained Windows service failure facts::' + $facts)
    if ($source -ceq '4aef552c63dd1ab5cd787fd2514d92a7815b943c') {
        function Get-RetainedNumber($Value) {
            if (($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) -and [double]::IsFinite([double]$Value) -and $Value -ge 0 -and $Value -le 9007199254740991) { return $Value }
            return 'UNKNOWN'
        }
        function Get-RetainedBoolean($Value) {
            if ($Value -is [bool]) { return $Value }
            return 'UNKNOWN'
        }
        function Get-RetainedNullableText($Object, [string]$Field) {
            if ($null -eq $Object -or $Object.PSObject.Properties.Name -notcontains $Field) { return 'UNKNOWN' }
            if ($null -eq $Object.$Field) { return $null }
            if ($Object.$Field -is [string]) { return (Format-ServiceError $Object.$Field) }
            return 'UNKNOWN'
        }
        function Get-RetainedSnapshotChain($Snapshot, $RootPid, $RootCreation, $TargetPid, $TargetCreation) {
            $projection = [ordered]@{
                snapshot_source = 'latest-actual-observation.json/current_owned_processes'
                snapshot_scope = 'single-raw-ppid-closure-subset'
                snapshot_observed_at_ms = Get-RetainedNumber $Snapshot.observed_at_ms
                snapshot_retained_row_count = if ($Snapshot.current_owned_processes -is [array]) { $Snapshot.current_owned_processes.Count } else { 'UNKNOWN' }
                root_metadata_matches_actual_spawn = 'UNKNOWN'
                status = 'UNKNOWN'; stop = 'SNAPSHOT_UNAVAILABLE'; chain_order = 'ancestor-to-target'; chain = @(); chain_truncated = 'UNKNOWN'
            }
            $snapshotPid = Get-RetainedNumber $Snapshot.pid
            $snapshotCreation = Get-RetainedNumber $Snapshot.creation_time_ms
            if ($Snapshot.current_owned_processes -isnot [array] -or $projection.snapshot_observed_at_ms -eq 'UNKNOWN' -or $projection.snapshot_observed_at_ms -lt 1 -or [math]::Floor($projection.snapshot_observed_at_ms) -ne $projection.snapshot_observed_at_ms -or $RootPid -eq 'UNKNOWN' -or $RootCreation -eq 'UNKNOWN' -or $snapshotPid -eq 'UNKNOWN' -or $snapshotCreation -eq 'UNKNOWN') { return $projection }
            $projection.root_metadata_matches_actual_spawn = $snapshotPid -ceq $RootPid -and $snapshotCreation -ceq $RootCreation
            if (-not $projection.root_metadata_matches_actual_spawn) { $projection.stop = 'SNAPSHOT_ROOT_MISMATCH'; return $projection }
            if ($TargetPid -eq 'UNKNOWN' -or $null -eq $TargetCreation -or $TargetCreation -eq 'UNKNOWN' -or $TargetPid -lt 1 -or $TargetPid -gt [uint32]::MaxValue -or [math]::Floor($TargetPid) -ne $TargetPid -or $TargetCreation -lt 1 -or [math]::Floor($TargetCreation) -ne $TargetCreation) { $projection.stop = 'INVALID_TARGET_IDENTITY'; return $projection }
            $projection.chain_truncated = $false
            $seen = [Collections.Generic.HashSet[long]]::new()
            $currentPid = $TargetPid
            for ($hop = 0; $hop -lt 8; $hop++) {
                if (-not $seen.Add([long]$currentPid)) { $projection.stop = 'CYCLE'; break }
                $rows = @($Snapshot.current_owned_processes | Where-Object { (Get-RetainedNumber $_.pid) -ceq $currentPid })
                if ($rows.Count -eq 0) { $projection.stop = 'MISSING_SNAPSHOT_NODE'; break }
                if ($rows.Count -ne 1) { $projection.stop = 'DUPLICATE_SNAPSHOT_PID'; break }
                $rowPid = Get-RetainedNumber $rows[0].pid
                $parentPid = Get-RetainedNumber $rows[0].ppid
                $created = Get-RetainedNumber $rows[0].creationTimeMs
                if ($rowPid -eq 'UNKNOWN' -or $parentPid -eq 'UNKNOWN' -or $created -eq 'UNKNOWN' -or $rowPid -lt 1 -or $rowPid -gt [uint32]::MaxValue -or [math]::Floor($rowPid) -ne $rowPid -or $parentPid -gt [uint32]::MaxValue -or [math]::Floor($parentPid) -ne $parentPid -or $created -lt 1 -or [math]::Floor($created) -ne $created) { $projection.stop = 'INVALID_SNAPSHOT_IDENTITY'; break }
                $projection.chain += [ordered]@{ pid = $rowPid; ppid = $parentPid; creationTimeMs = $created }
                if ($hop -eq 0 -and $created -cne $TargetCreation) { $projection.stop = 'TARGET_INCARNATION_MISMATCH'; break }
                if ($rowPid -ceq $RootPid) {
                    if ($created -ceq $RootCreation) { $projection.status = 'OBSERVED'; $projection.stop = 'ACTUAL_SPAWN_ROOT_REACHED' } else { $projection.stop = 'ROOT_INCARNATION_MISMATCH' }
                    break
                }
                if ($parentPid -eq 0) { $projection.stop = 'PARENT_ZERO_BEFORE_ROOT'; break }
                $currentPid = $parentPid
                if ($hop -eq 7) { $projection.chain_truncated = $true; $projection.stop = 'NODE_LIMIT' }
            }
            $chain = @($projection.chain)
            [array]::Reverse($chain)
            $projection.chain = $chain
            return $projection
        }
        $cimExit = $actual.actual_cim_process_exit
        $cimReport = $actual.actual_cim_report
        $rootPid = Get-RetainedNumber $actual.pid
        if ($rootPid -ne 'UNKNOWN' -and ($rootPid -lt 1 -or $rootPid -gt [uint32]::MaxValue -or [math]::Floor($rootPid) -ne $rootPid)) { $rootPid = 'UNKNOWN' }
        $rootCreation = 'UNKNOWN'
        if ($rootPid -ne 'UNKNOWN' -and $actual.events -is [array]) {
            $spawnEvents = @($actual.events | Where-Object { $_.type -ceq 'actual-spawn' -and (Get-RetainedNumber $_.pid) -ceq $rootPid })
            if ($spawnEvents.Count -eq 1) { $rootCreation = Get-RetainedNumber $spawnEvents[0].creation_time_ms }
            if ($rootCreation -ne 'UNKNOWN' -and ($rootCreation -lt 1 -or [math]::Floor($rootCreation) -ne $rootCreation)) { $rootCreation = 'UNKNOWN' }
        }
        $readyObservation = $null
        if ($cimReport.observations -is [array] -and @($cimReport.observations | Where-Object { $_.known_identities_exited -is [bool] -and $_.known_identities_exited -eq $false }).Count -gt 0) {
            $readyFile = Join-Path $EvidenceRoot 'smoke/readiness-eof/ready-service-observation.json'
            if (Test-Path -LiteralPath $readyFile -PathType Leaf) {
                $readyObservation = Get-Content -LiteralPath $readyFile -Raw | ConvertFrom-Json
                if ($readyObservation.source_revision -cne $source) { throw 'The retained ready observation source revision differs' }
            }
        }
        $termination = 'UNKNOWN'
        if ($null -ne $cimExit -and $cimExit.PSObject.Properties.Name -contains 'actual_helper_termination') {
            $termination = if ($null -eq $cimExit.actual_helper_termination) { $null } elseif ($cimExit.actual_helper_termination -is [pscustomobject]) { [ordered]@{ signal_sent = Get-RetainedBoolean $cimExit.actual_helper_termination.signal_sent } } else { 'UNKNOWN' }
        }
        $queryFailure = 'UNKNOWN'
        if ($null -ne $cimReport -and $cimReport.PSObject.Properties.Name -contains 'query_failure') {
            if ($null -eq $cimReport.query_failure) { $queryFailure = $null } elseif ($cimReport.query_failure -is [pscustomobject]) {
                $failure = $cimReport.query_failure
                $queryFailure = [ordered]@{
                    query_index = Get-RetainedNumber $failure.query_index
                    query_succeeded = Get-RetainedBoolean $failure.query_succeeded
                    monotonic_ms = Get-RetainedNumber $failure.monotonic_ms
                    exception_type = if ($failure.exception_type -is [string] -and $failure.exception_type -cmatch '^[A-Za-z_][A-Za-z0-9_.+]{0,159}$') { $failure.exception_type } else { 'UNKNOWN' }
                    message = Get-RetainedNullableText $failure 'message'
                }
            }
        }
        $cimRows = 'UNKNOWN'
        if ($cimReport.observations -is [array]) {
            $cimRows = @($cimReport.observations | Select-Object -First 2 | ForEach-Object {
                $row = $_
                $projected = [ordered]@{
                    query_succeeded = Get-RetainedBoolean $row.query_succeeded
                    complete_result_count = Get-RetainedNumber $row.complete_result_count
                    invalid_pid_record_count = Get-RetainedNumber $row.invalid_pid_record_count
                    required_identity_fields_complete = Get-RetainedBoolean $row.required_identity_fields_complete
                    known_identities_exited = Get-RetainedBoolean $row.known_identities_exited
                    unknown_pids_absent = Get-RetainedBoolean $row.unknown_pids_absent
                    monotonic_ms = Get-RetainedNumber $row.monotonic_ms
                    actual_match_count = if ($row.actual_matches -is [array]) { $row.actual_matches.Count } else { 'UNKNOWN' }
                }
                if ($row.known_identities_exited -is [bool] -and $row.known_identities_exited -eq $false) {
                    $projected.actual_matches = 'UNKNOWN'
                    $projected.actual_matches_truncated = 'UNKNOWN'
                    $projected.observed_processes_same_pid = 'UNKNOWN'
                    $projected.observed_processes_same_pid_count = 'UNKNOWN'
                    $projected.observed_processes_same_pid_truncated = 'UNKNOWN'
                    if ($row.actual_matches -is [array]) {
                        $matches = @($row.actual_matches | Select-Object -First 8)
                        $projected.actual_matches = @($matches | ForEach-Object {
                            $matchPid = Get-RetainedNumber $_.pid
                            $matchCreation = if ($_.PSObject.Properties.Name -contains 'creation_time_ms' -and $null -eq $_.creation_time_ms) { $null } else { Get-RetainedNumber $_.creation_time_ms }
                            $identity = [ordered]@{ pid = $matchPid; creation_time_ms = $matchCreation; ready_identity_match_count = 'UNKNOWN'; ready_observed_role = 'UNKNOWN'; ready_observed_parent_pid = 'UNKNOWN'; ready_observed_named_job_membership = 'UNKNOWN' }
                            $identity.single_snapshot_raw_ppid_chain = Get-RetainedSnapshotChain $latest $rootPid $rootCreation $matchPid $matchCreation
                            if ($matchPid -ne 'UNKNOWN' -and $matchPid -gt 0 -and $matchPid -le [uint32]::MaxValue -and [math]::Floor($matchPid) -eq $matchPid -and $null -ne $matchCreation -and $matchCreation -ne 'UNKNOWN' -and $matchCreation -gt 0 -and [math]::Floor($matchCreation) -eq $matchCreation -and $readyObservation.members -is [array]) {
                                $readyMatches = @($readyObservation.members | Where-Object { (Get-RetainedNumber $_.pid) -ceq $matchPid -and (Get-RetainedNumber $_.creation_time_ms) -ceq $matchCreation })
                                $identity.ready_identity_match_count = $readyMatches.Count
                                if ($readyMatches.Count -eq 1) {
                                    $member = $readyMatches[0]
                                    $identity.ready_observed_role = if ($member.role -is [string] -and $member.role -cin @('serve', 'runtime', 'server', 'daemon')) { $member.role } else { 'UNKNOWN' }
                                    $identity.ready_observed_parent_pid = Get-RetainedNumber $member.parent_pid
                                    $identity.ready_observed_named_job_membership = Get-RetainedBoolean $member.actual_named_job_membership
                                }
                            }
                            $identity
                        })
                        $projected.actual_matches_truncated = $row.actual_matches.Count -gt 8
                        if ($actual.observed_processes -is [array]) {
                            $matchPids = @($matches | ForEach-Object { Get-RetainedNumber $_.pid } | Where-Object { $_ -ne 'UNKNOWN' })
                            $known = @($actual.observed_processes | Where-Object { $_.pid -in $matchPids })
                            $projected.observed_processes_same_pid = @($known | Select-Object -First 8 | ForEach-Object { [ordered]@{ pid = Get-RetainedNumber $_.pid; creationTimeMs = Get-RetainedNumber $_.creationTimeMs; ppid = Get-RetainedNumber $_.ppid; parent_pid = Get-RetainedNumber $_.parent_pid } })
                            $projected.observed_processes_same_pid_count = $known.Count
                            $projected.observed_processes_same_pid_truncated = $known.Count -gt 8
                        }
                    }
                }
                $projected
            })
        }
        $nativeRows = 'UNKNOWN'
        if ($actual.exit_observations -is [array]) {
            $nativeRows = @($actual.exit_observations | Select-Object -First 2 | ForEach-Object { [ordered]@{ observed_at_ms = Get-RetainedNumber $_.observed_at_ms; remaining_count = if ($_.remaining -is [array]) { $_.remaining.Count } else { 'UNKNOWN' } } })
        }
        $details = [ordered]@{
            diagnostic_only = $true; prior_run = $priorRun; source_revision = $source; complete_service_acceptance = 'FAIL'
            actual_pid = $rootPid
            root_creation_time_ms = $rootCreation
            actual_cim_process_exit = [ordered]@{
                exit = if ($null -ne $cimExit -and $cimExit.PSObject.Properties.Name -contains 'exit' -and $null -eq $cimExit.exit) { $null } else { Get-RetainedNumber $cimExit.exit }
                signal = Get-RetainedNullableText $cimExit 'signal'
                query_timed_out = Get-RetainedBoolean $cimExit.query_timed_out
                query_deadline_ms = Get-RetainedNumber $cimExit.query_deadline_ms
                completion_unknown = Get-RetainedBoolean $cimExit.completion_unknown
                actual_helper_termination = $termination
            }
            actual_cim_error = Get-RetainedNullableText $actual 'actual_cim_error'
            actual_cim_report = [ordered]@{
                schema_version = Get-RetainedNumber $cimReport.schema_version
                query_failure = $queryFailure
                observation_count = if ($cimReport.observations -is [array]) { $cimReport.observations.Count } else { 'UNKNOWN' }
                observations_truncated = if ($cimReport.observations -is [array]) { $cimReport.observations.Count -gt 2 } else { 'UNKNOWN' }
                observations = $cimRows
            }
            exit_observation_count = if ($actual.exit_observations -is [array]) { $actual.exit_observations.Count } else { 'UNKNOWN' }
            exit_observations_truncated = if ($actual.exit_observations -is [array]) { $actual.exit_observations.Count -gt 2 } else { 'UNKNOWN' }
            exit_observations = $nativeRows
        }
        $detailText = $details | ConvertTo-Json -Depth 12 -Compress
        if ($detailText.Length -gt 8000) { throw 'The retained CIM field projection exceeds its output limit' }
        $escapedDetails = $detailText.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
        Write-Host ('::warning title=Retained Windows CIM exit predicates::' + $escapedDetails)
    }
    $errorLines = [Collections.Generic.List[string]]::new()
    foreach ($relative in @('logs/service-smoke.log', 'smoke/readiness-eof/stderr.log')) {
        $log = Join-Path $EvidenceRoot $relative
        if (Test-Path -LiteralPath $log -PathType Leaf) {
            foreach ($line in (Get-Content -LiteralPath $log | Where-Object { $_ -match '(?i)(\berror\b|\bfatal\b|ERR_[A-Z_]+|失败|异常|拒绝|\bunknown\b|\bactual:|\bexpected:|\boperator:|tests[\\/]swa-cli-headless[\\/]serve-lifecycle\.mjs:[0-9]+|scripts[\\/][A-Za-z0-9-]+\.(?:mjs|ps1):[0-9]+)' } | Select-Object -Last 60)) { $errorLines.Add((Format-ServiceError $line)) }
        }
    }
    if ($latest.stderr -is [string]) {
        foreach ($line in ($latest.stderr -split '\r?\n' | Where-Object { $_ -match '(?i)(\berror\b|\bfatal\b|ERR_[A-Z_]+|失败|异常|拒绝|\bunknown\b)' } | Select-Object -Last 20)) { $errorLines.Add((Format-ServiceError $line)) }
    }
    $stdoutFile = Join-Path $EvidenceRoot 'smoke/readiness-eof/stdout.json'
    if (Test-Path -LiteralPath $stdoutFile -PathType Leaf) {
        $stdout = Get-Content -LiteralPath $stdoutFile -Raw
        if (Test-Json -Json $stdout -ErrorAction SilentlyContinue) {
            $envelope = $stdout | ConvertFrom-Json
            if ($envelope.error.code -is [string] -and $envelope.error.code -cmatch '^[a-z_]{1,80}$') { $errorLines.Add('Original serve error code: ' + $envelope.error.code) }
            if ($envelope.error.message -is [string]) { $errorLines.Add((Format-ServiceError $envelope.error.message)) }
        } else { $errorLines.Add('[original stdout is not a complete JSON envelope; no raw output exported]') }
    }
    $message = 'Prior run' + $priorRun + '; source=' + $source + '; filtered original service errors:' + "`n" + ($errorLines -join "`n")
    if ($errorLines.Count -eq 0) { $message += '[no whitelisted error line found; root cause remains unknown]' }
    if ($message.Length -gt 8000) { $message = $message.Substring(0, 8000) + ' [original artifact retained]' }
    $escaped = $message.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Host ('::warning title=Retained Windows filtered service errors::' + $escaped)
    Write-Output 'Only the retained artifact was read; no candidate, native build, service or model was run.'
    return
}
if ($source -ceq 'c7ab4a7479182f29f990cd649accac193514d169') {
    if ($result.failed_stage -cne 'installed-acl') { throw 'The original c7 installation failed at a different stage' }
    $exits = [ordered]@{}
    foreach ($stage in @('frozen-install', 'go-download', 'go-verify', 'build', 'extracted-check', 'install', 'installed-check')) {
        $code = (Get-Content -LiteralPath (Join-Path $EvidenceRoot ('logs/' + $stage + '.exit.txt')) -Raw).Trim()
        if ($code -cne '0') { throw 'An original preceding installation operation did not succeed' }
        $exits[$stage] = 0
    }
    $observation = [ordered]@{ diagnostic_only = $true; prior_run = '39773729265'; source_revision = $source; original_status = 'FAIL'; failed_stage = 'installed-acl'; recorded_preceding_exits = $exits; original_owner_match = 'UNKNOWN'; original_access_rules_protected = 'UNKNOWN'; original_acl_values_recorded = $false; complete_installation_acceptance = 'FAIL'; model_calls = 0 }
    $message = ($observation | ConvertTo-Json -Depth 6 -Compress).Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Host ('::warning title=Retained Windows installed ACL failure facts::' + $message)
    Write-Output 'The original artifact has no owner/protection observation; the failed compound assertion remains unresolved.'
    return
}
if ($source -ceq '50d099ddf9787a283573a477fb5f29017aef6c89') {
    if ($result.source_revision -cne $source -or $result.failed_stage -cne 'build' -or $result.platform -cne 'win32-x64' -or $result.edition -cne 'combined' -or ($result.model_calls -isnot [int] -and $result.model_calls -isnot [long]) -or $result.model_calls -ne 0) { throw 'The retained N46 artifact does not match the original combined build failure' }
    $exits = [ordered]@{}
    foreach ($stage in @('frozen-install', 'go-download', 'go-verify')) {
        $code = (Get-Content -LiteralPath (Join-Path $EvidenceRoot ('logs/' + $stage + '.exit.txt')) -Raw).Trim()
        if ($code -cne '0') { throw 'An original preceding build operation did not succeed' }
        $exits[$stage] = [int]$code
    }
    $buildExit = (Get-Content -LiteralPath (Join-Path $EvidenceRoot 'logs/build.exit.txt') -Raw).Trim()
    if ($buildExit -cne '1') { throw 'The retained original build exit differs' }
    $observation = [ordered]@{ diagnostic_only = $true; prior_run = '39900064207'; source_revision = $source; original_status = 'FAIL'; failed_stage = 'build'; platform = $result.platform; edition = $result.edition; recorded_preceding_exits = $exits; recorded_build_exit = [int]$buildExit; complete_candidate_acceptance = 'FAIL'; model_calls = $result.model_calls }
    $facts = ($observation | ConvertTo-Json -Depth 6 -Compress).Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Host ('::warning title=Retained Windows N46 build failure facts::' + $facts)
} elseif ($source -cne '82e1b09503486c14a9dececb5e3673827894c120' -or $result.failed_stage -cne 'build') { throw 'This is not the expected original failed build artifact' }
$priorBuildRun = if ($source -ceq '50d099ddf9787a283573a477fb5f29017aef6c89') { '39900064207' } else { '39769388709' }
$buildLog = Join-Path $EvidenceRoot 'logs/build.log'
if (-not (Test-Path -LiteralPath $buildLog -PathType Leaf)) { throw 'The original build log is missing' }
if ($source -ceq '50d099ddf9787a283573a477fb5f29017aef6c89') {
    $webTools = @(Get-Content -LiteralPath $buildLog | Where-Object { $_ -match '(?i)(\berror\b|\bfatal\b|ERR_[A-Z_]+|\bMSB[0-9]+\b|\bLNK[0-9]+\b|\.go:[0-9]+:|scripts[\\/]build-swa-(?:package|native)\.mjs:[0-9]+:[0-9]+|\bELIFECYCLE\b|not recognized as an internal or external command|command not found|Cannot find module|\bMODULE_NOT_FOUND\b|\bENOENT\b|^\s*>\s*(?:@swa/web@\S+\s+build(?:\s|$)|vite\s+build(?:\s|$)))' } | ForEach-Object { '[logs/build.log] ' + $_ })
    $frozenTools = @(Get-Content -LiteralPath (Join-Path $EvidenceRoot 'logs/frozen-install.log') | Where-Object { $_ -match '(?i)(No projects matched the filters|Local package\.json exists, but node_modules missing)' } | ForEach-Object { '[logs/frozen-install.log] ' + $_ })
    $selected = @(@($webTools + $frozenTools) | Select-Object -Last 100)
} else {
    $selected = @(Get-Content -LiteralPath $buildLog | Where-Object { $_ -match '(?i)(\berror\b|\bfatal\b|ERR_[A-Z_]+|\bMSB[0-9]+\b|\bLNK[0-9]+\b|\.go:[0-9]+:|scripts[\\/]build-swa-(?:package|native)\.mjs:[0-9]+:[0-9]+)' } | Select-Object -Last 100)
}
$safe = [Collections.Generic.List[string]]::new()
foreach ($line in $selected) {
    if ($line -match '(?i)(authorization|\bbearer\b|\bbasic\s+[A-Za-z0-9+/=]+|token|api[-_]?key|client[-_]?secret|password|cookie|credential)') {
        $safe.Add('[sensitive log line omitted]')
        continue
    }
    $sanitized = [regex]::Replace($line, '(?i)https?://\S+', '[URL omitted]')
    $sanitized = [regex]::Replace($sanitized, '(?i)[a-z]:[\\/]Users[\\/][^\\/\s"'']+', '[CI user home]')
    $sanitized = [regex]::Replace($sanitized, '/(?:home|Users)/[^/\s"'']+', '[user home]')
    $sanitized = [regex]::Replace($sanitized, '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '')
    if ($sanitized.Length -gt 500) { $sanitized = $sanitized.Substring(0, 500) + ' [line truncated]' }
    $safe.Add($sanitized)
}
$message = 'Prior run' + $priorBuildRun + '; source=' + $source + '; phase=build; filtered original errors:' + "`n" + ($safe -join "`n")
if (-not $safe.Count) { $message += '[no whitelisted error line found; root cause remains unknown]' }
if ($message.Length -gt 8000) { $message = $message.Substring(0, 8000) + ' [original artifact retained]' }
$escaped = $message.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
Write-Host ('::warning title=Prior Windows build diagnostic only::' + $escaped)
Write-Output 'Read-only artifact diagnosis completed; no build, installation, service or model was run.'
