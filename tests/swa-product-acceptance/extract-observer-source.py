# 只物化已核原 Git blob 的普通归档条目，不执行项目代码。

import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import stat
import subprocess
import sys
import zipfile


def ordinary_windows(path, directory):
    if os.name != "nt":
        return
    if not path.is_absolute() or os.path.normcase(str(path.resolve(strict=True))) != os.path.normcase(os.path.abspath(path)):
        raise ValueError("source_windows_redirected_path")
    current = path
    while True:
        info = current.lstat()
        if info.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise ValueError("source_windows_reparse_path")
        expected_directory = directory if current == path else True
        if not (stat.S_ISDIR(info.st_mode) if expected_directory else stat.S_ISREG(info.st_mode)):
            raise ValueError("source_windows_not_ordinary")
        if current.parent == current:
            break
        current = current.parent


def main():
    arguments = sys.argv[1:]
    profile = None
    if len(arguments) == 6 and arguments[-2] == "--profile" and arguments[-1] in ("stepfun-pi-n3", "stepfun-pi-questions", "stepfun-opencode", "opencode-initialize-only"):
        profile = arguments[-1]
        arguments = arguments[:4]
    archive_name, repository_name, revision, target_name = arguments
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("source_revision_invalid")
    repository = Path(repository_name)
    target = Path(target_name)
    if not repository.is_absolute() or not target.is_absolute():
        raise ValueError("source_absolute_paths_required")
    ordinary_windows(repository, True)
    ordinary_windows(Path(archive_name), False)
    ordinary_windows(target.parent, True)
    if target.exists() or target.is_symlink():
        raise ValueError("source_target_already_exists")
    allowed = [
        "third_party/orca-v1.4.230/src/shared",
        "third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity.ts",
        "third_party/orca-v1.4.230/src/main/agent-hooks/managed-hook-owner-identity.ts",
        "third_party/orca-v1.4.230/src/main/pty-process-table-parser.ts",
        "third_party/orca-v1.4.230/package.json",
        "third_party/orca-v1.4.230/tsconfig.json",
        "third_party/orca-v1.4.230/config/tsconfig.node.json",
    ]
    if profile in ("stepfun-pi-n3", "stepfun-pi-questions"):
        allowed.extend([
            "third_party/orca-v1.4.230/src/main/pi/rpc-protocol.ts",
            "third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt.ts",
            "scripts/build-swa-runtime.mjs",
            "third_party/orca-v1.4.230/src/main/native-chat/agent-session-timeline/provider-timeline-identity.ts",
            "third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-payload-bounds.ts",
        ])
    if profile == "stepfun-pi-questions":
        allowed.extend([
            "runtime/swa-orca/src/contracts.ts",
            "runtime/swa-orca/src/task-budget.ts",
            "third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error.ts",
        ])
    if profile == "stepfun-opencode":
        allowed.extend([
            "third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt.ts",
            "third_party/orca-v1.4.230/src/main/native-chat/agent-session-timeline/provider-timeline-identity.ts",
            "third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-payload-bounds.ts",
            "third_party/orca-v1.4.230/src/main/acp/acp-rpc-envelope.ts",
            "third_party/orca-v1.4.230/src/main/acp/acp-errors.ts",
            "third_party/orca-v1.4.230/src/main/acp/generated/acp-protocol.generated.ts",
        ])
    if profile == "opencode-initialize-only":
        allowed.extend(["scripts/build-swa-runtime.mjs", "runtime/swa-orca/package.json"])
        allowed.extend("runtime/swa-orca/src/" + name for name in [
            "native-opencode-policy.ts", "private-opencode-account.ts", "native-opencode-import.ts", "native-pi-policy.ts",
            "native-codex-policy.ts", "private-posix-security.ts", "contracts.ts", "task-budget.ts", "pi-official-sources.json",
        ])
        allowed.extend([
            "third_party/orca-v1.4.230/src/packages/process-host/package.json",
            "third_party/orca-v1.4.230/src/packages/process-host/src",
        ])
        allowed.extend("third_party/orca-v1.4.230/src/main/" + name for name in [
            "acp/acp-session-runtime.ts", "acp/acp-errors.ts", "acp/acp-response-settlement.ts", "acp/acp-json-rpc-peer.ts",
            "acp/acp-permission-requests.ts", "acp/acp-session-events.ts", "acp/acp-session-setup.ts", "acp/acp-incoming-requests.ts",
            "acp/acp-peer-limits.ts", "acp/acp-oversized-lines.ts", "acp/acp-write-queue.ts", "acp/acp-stdio-error-boundary.ts",
            "acp/acp-rpc-envelope.ts", "acp/generated/acp-protocol.generated.ts", "zod-schema-compilation.ts",
            "provider-process/managed-provider-process.ts", "provider-process/swa-provider-process-tree.ts",
            "provider-process/swa-linux-provider-process-tree.ts", "provider-process/provider-process-close.ts",
            "provider-process/provider-process-supervisor.ts", "provider-process/provider-process-teardown.ts",
            "provider-process/provider-executable-missing.ts", "provider-process/provider-spawn-failure-report.ts",
            "provider-process/provider-process-exit-deadline.ts", "provider-process/provider-process-launch.ts",
            "provider-process/provider-stdio-write-queue.ts", "provider-process/provider-stdio-error-boundary.ts",
            "windows/windows-process-table.ts", "windows/windows-process-table-timeout-error.ts",
            "windows/windows-process-table-cim-scan.ts", "windows/windows-command-line-recovery-health.ts",
            "windows-process-tree-kill.ts", "windows-pty-root-identity.ts", "pty-descendant-exit-verification.ts",
            "pty-descendant-termination.ts", "own-chromium-tree-kill-guard.ts", "orca-chromium-process-pids.ts",
            "providers/windows-foreground-process-rows.ts", "crash-reporting/self-initiated-tree-kill-log.ts",
            "crash-reporting/durable-crash-breadcrumb.ts", "crash-reporting/main-process-lifecycle-identity.ts",
            "crash-reporting/crash-breadcrumb-store.ts", "observability/tracer.ts", "observability/redactor.ts",
            "agent-hooks/windows-powershell-hook-launcher.ts", "pi/rpc-protocol.ts", "runtime/orchestration/orchestration-error.ts",
            "opencode/opencode-structured-account-home.ts", "managed-data-accounts/service.ts",
            "managed-data-accounts/credential-capture.ts", "managed-data-accounts/profile-removal.ts",
            "host-tree-removal.ts", "asar-transparent-fs.ts", "opencode-usage/schema-helpers.ts",
            "sqlite/sync-database.ts", "sqlite/node-sqlite-reader-api.ts", "sqlite/node-sqlite-statement.ts", "sqlite/sqlite-integer-reader.ts",
        ])
    git_environment = dict(os.environ, GIT_OPTIONAL_LOCKS="0", GIT_PAGER="cat")
    result = subprocess.run(
        ["git", "--no-pager", "-C", str(repository), "ls-tree", "-rz", "--full-tree", revision, "--", *allowed],
        env=git_environment, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=30,
    )
    expected = {}
    for row in result.stdout.split(b"\0"):
        if not row:
            continue
        metadata, encoded_path = row.split(b"\t", 1)
        mode, kind, blob = metadata.decode("ascii").split(" ")
        path = encoded_path.decode("utf-8", errors="strict")
        if mode not in ("100644", "100755") or kind != "blob" or path in expected:
            raise ValueError("source_git_entry_not_ordinary")
        expected[path] = blob
    if not expected or len(expected) > 4096:
        raise ValueError("source_inventory_out_of_bounds")
    if Path(archive_name).stat().st_size > 64 * 1024 * 1024:
        raise ValueError("source_archive_exceeds_bound")
    verified = {}
    directories = set()
    total = 0
    with zipfile.ZipFile(archive_name) as archive:
        if archive.comment != revision.encode("ascii"):
            raise ValueError("source_archive_revision_comment_differs")
        if len(archive.infolist()) > 8192:
            raise ValueError("source_archive_inventory_exceeds_bound")
        for item in archive.infolist():
            name = item.filename
            normalized = PurePosixPath(name)
            if "\\" in name or normalized.is_absolute() or any(part in ("", ".", "..") for part in name.rstrip("/").split("/")):
                raise ValueError("source_archive_path_invalid")
            if os.name == "nt" and (PureWindowsPath(name).drive or os.path.isreserved(name)):
                raise ValueError("source_archive_windows_path_invalid")
            mode = item.external_attr >> 16
            kind = stat.S_IFMT(mode)
            if item.is_dir():
                if kind not in (0, stat.S_IFDIR) or name in directories:
                    raise ValueError("source_archive_directory_invalid")
                if not any(path.startswith(name) for path in expected):
                    raise ValueError("source_archive_directory_outside_inventory")
                directories.add(name)
                continue
            if kind not in (0, stat.S_IFREG) or name not in expected or name in verified:
                raise ValueError("source_archive_file_outside_inventory")
            if item.file_size > 8 * 1024 * 1024:
                raise ValueError("source_file_exceeds_bound")
            total += item.file_size
            if total > 128 * 1024 * 1024:
                raise ValueError("source_total_exceeds_bound")
            data = archive.read(item)
            blob = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
            if blob != expected[name]:
                raise ValueError("source_archive_differs_from_git_blob")
            verified[name] = data
    if verified.keys() != expected.keys():
        raise ValueError("source_archive_inventory_incomplete")
    target.mkdir(mode=0o700)
    ordinary_windows(target, True)
    summaries = []
    for name, data in verified.items():
        destination = target / name
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        ordinary_windows(destination.parent, True)
        with destination.open("xb") as stream:
            stream.write(data)
        if os.name != "nt":
            destination.chmod(0o600)
        ordinary_windows(destination, False)
        summaries.append({"path": name, "blob": expected[name], "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    print(json.dumps({"revision": revision, "files": len(summaries), "bytes": total, "entries": summaries}))


try:
    main()
except Exception:
    # Git 环境、未知路径和原始命令错误不进入诊断输出。
    print("source_archive_verification_failed", file=sys.stderr)
    sys.exit(1)
