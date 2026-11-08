#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PackageRoot,
    [Parameter(Mandatory)][string]$InstallRoot,
    [Parameter(Mandatory)][string[]]$ProtectedRoots
)

$ErrorActionPreference = 'Stop'

function Get-PlainAbsolutePath([string]$InputPath) {
    if (-not [System.IO.Path]::IsPathFullyQualified($InputPath)) { throw '需要明确的绝对目录' }
    $resolved = [System.IO.Path]::GetFullPath($InputPath).TrimEnd('\')
    $current = $resolved
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "目录经过 reparse point: $current" }
        }
        $parent = [System.IO.Path]::GetDirectoryName($current)
        if ($parent -eq $current) { break }
        $current = $parent
    }
    return $resolved
}

function Test-ContainsPath([string]$ParentPath, [string]$ChildPath) {
    return $ChildPath.Equals($ParentPath, [System.StringComparison]::OrdinalIgnoreCase) -or $ChildPath.StartsWith($ParentPath + '\', [System.StringComparison]::OrdinalIgnoreCase)
}

function Set-PrivateInstallDirectoryAcl([string]$Directory) {
    $user = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $security = [Security.AccessControl.DirectorySecurity]::new()
    $security.SetOwner($user)
    $security.SetAccessRuleProtection($true, $false)
    $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    foreach ($principal in @($user, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($principal, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
        $security.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Directory -AclObject $security
}

$package = Get-PlainAbsolutePath $PackageRoot
$destination = Get-PlainAbsolutePath $InstallRoot
if (-not (Test-Path -LiteralPath $package -PathType Container)) { throw '候选目录不存在' }
if (Test-Path -LiteralPath $destination) { throw '安装目标必须不存在，禁止覆盖已有目录' }
if (Test-ContainsPath $package $destination) { throw '安装目标必须独立于候选目录' }
foreach ($root in $ProtectedRoots) {
    $protected = Get-PlainAbsolutePath $root
    if ((Test-ContainsPath $protected $destination) -or (Test-ContainsPath $destination $protected) -or (Test-ContainsPath $protected $package) -or (Test-ContainsPath $package $protected)) { throw '安装或候选目录与受保护目录重叠' }
}
foreach ($entry in Get-ChildItem -LiteralPath $package -Recurse -Force) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '平铺安装候选包含 reparse point，不能复制' }
}
$bundledNode = Join-Path $package 'node/node.exe'
$nodeHash = (Get-FileHash -LiteralPath $bundledNode -Algorithm SHA256).Hash.ToLowerInvariant()
if ($nodeHash -ne 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32') { throw '随包 Node 与准确 24.21.0 x64 输入不符' }
$revision = (Get-Content -LiteralPath (Join-Path $package 'VERSION') -Raw).Trim()
if ($revision -notmatch '^[0-9a-f]{40}$') { throw '准确源码版本缺失' }
$reported = & (Join-Path $package 'swa.exe') --version
if ($LASTEXITCODE -ne 0 -or $reported.Trim() -ne $revision) { throw '候选 CLI 与准确源码版本不符' }
if (-not (Test-Path -LiteralPath ([System.IO.Path]::GetDirectoryName($destination)) -PathType Container)) { throw '安装目标的明确父目录必须存在' }
New-Item -ItemType Directory -Path $destination | Out-Null
Set-PrivateInstallDirectoryAcl $destination
$copy = "require('node:fs').cpSync(process.argv[1],process.argv[2],{recursive:true,dereference:true,errorOnExist:true,force:false})"
& $bundledNode --max-old-space-size=1024 -e $copy $package $destination
if ($LASTEXITCODE -ne 0) { throw '复制安装闭包失败，保留实际目标供检查' }
$installed = Join-Path $destination 'swa.exe'
$installedRevision = & $installed --version
if ($LASTEXITCODE -ne 0 -or $installedRevision.Trim() -ne $revision) { throw '安装后 CLI 版本不符' }
[ordered]@{ ok = $true; install_root = $destination; executable = $installed; source_revision = $revision; path_modified = $false; service_started = $false } | ConvertTo-Json -Compress
