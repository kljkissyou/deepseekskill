<#
  DSH 桌面版 profile 应急回退脚本
  ---------------------------------------------------------------
  用途：如果重启 DeepSeek Harness 桌面版后无法进入界面（插件加载失败导致白屏/闪退），
        运行本脚本把 profile 退回到「只加载官方内置插件」的最小可启动状态。

  用法（请先完全退出 DeepSeek Harness）：
      1) 回退到最小可启动状态：  powershell -ExecutionPolicy Bypass -File rescue-desktop-profile.ps1
      2) 撤销回退、恢复回退前的配置：
         powershell -ExecutionPolicy Bypass -File rescue-desktop-profile.ps1 -Restore

  只会改动这几个文件，不会删除 node_modules / generations / 会话数据：
      profiles\desktop\package.json
      profiles\desktop\cordis.patch.yml
#>

param(
    [switch]$Restore
)

$ErrorActionPreference = 'Stop'
$profileDir = 'C:\Users\Administrator\.dsh\profiles\desktop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stateFile = Join-Path $profileDir '.rescue-state.json'

function Stop-App {
    $procs = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
    if ($procs) {
        Write-Host '请先完全退出 DeepSeek Harness（托盘图标右键退出），然后重新运行本脚本。' -ForegroundColor Yellow
        exit 1
    }
}

Stop-App

if (-not $Restore) {
    $pkg = Join-Path $profileDir 'package.json'
    $patch = Join-Path $profileDir 'cordis.patch.yml'

    $backupPkg = Join-Path $profileDir "package.json.rescue-$stamp"
    $backupPatch = Join-Path $profileDir "cordis.patch.yml.rescue-$stamp"
    Copy-Item $pkg $backupPkg -Force
    if (Test-Path $patch) { Copy-Item $patch $backupPatch -Force }

    $minimal = [ordered]@{
        name       = 'dsh-profile-desktop'
        private    = $true
        dependencies = [ordered]@{}
        dsh        = [ordered]@{
            profile = [ordered]@{
                bundles = @('@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app')
            }
        }
    }
    $json = $minimal | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText($pkg, $json, (New-Object Text.UTF8Encoding($false)))

    # 用户补丁层先挪走：其中的条目引用了当前缺失的插件，加载时会报 patch 错误
    if (Test-Path $patch) { Move-Item $patch (Join-Path $profileDir 'cordis.patch.yml.rescue-disabled') -Force }

    [ordered]@{ backupPackageJson = $backupPkg; backupPatch = $backupPatch; at = $stamp } |
        ConvertTo-Json | Set-Content $stateFile -Encoding UTF8

    Write-Host '已回退到最小可启动状态。现在可以重新打开 DeepSeek Harness。' -ForegroundColor Green
    Write-Host "原配置备份：$backupPkg"
    Write-Host '要恢复原配置，运行： rescue-desktop-profile.ps1 -Restore'
}
else {
    if (-not (Test-Path $stateFile)) { Write-Host '找不到回退记录(.rescue-state.json)，无需恢复。'; exit 0 }
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    Copy-Item $state.backupPackageJson (Join-Path $profileDir 'package.json') -Force
    if ($state.backupPatch -and (Test-Path $state.backupPatch)) {
        Copy-Item $state.backupPatch (Join-Path $profileDir 'cordis.patch.yml') -Force
    }
    Write-Host '已恢复回退前的 package.json / cordis.patch.yml。' -ForegroundColor Green
}
