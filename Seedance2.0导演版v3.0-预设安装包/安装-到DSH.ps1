# ============================================================
#  Seedance 2.0 导演版 v3.0 - 一键安装到 DSH .agent-presets
#  用法：右键“使用 PowerShell 运行”，或在 PowerShell 中执行
#        powershell -NoProfile -ExecutionPolicy Bypass -File .\安装-到DSH.ps1
# ============================================================
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'seedance-prompter-v300'
if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "[错误] 找不到预设目录: $src" -ForegroundColor Red
    exit 1
}

# 1. 定位 DSH_HOME / .agent-presets
$candidates = @()
if ($env:DSH_HOME) {
    $candidates += (Join-Path $env:DSH_HOME '.agent-presets')
}
if ($env:APPDATA) {
    $candidates += (Join-Path $env:APPDATA 'dsh-desktop\harness\.agent-presets')
}
if ($env:USERPROFILE) {
    $candidates += (Join-Path $env:USERPROFILE '.dsh\.agent-presets')
}

$targetRoot = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $targetRoot) {
    $targetRoot = Join-Path $env:APPDATA 'dsh-desktop\harness\.agent-presets'
    try {
        New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
    } catch {
    }
}

if (-not $targetRoot) {
    Write-Host "[错误] 找不到 .agent-presets 目录" -ForegroundColor Red
    exit 1
}

$dest = Join-Path $targetRoot 'seedance-prompter-v300'

try {
    if (Test-Path -LiteralPath $dest) {
        Write-Host "[信息] 已存在旧版目录，将覆盖: $dest" -ForegroundColor Yellow
        Remove-Item -LiteralPath $dest -Recurse -Force
    }

    Copy-Item -LiteralPath $src -Destination $dest -Recurse -Force

    Write-Host "[完成] 已安装到:" -ForegroundColor Green
    Write-Host "       $dest"
    Write-Host "       请重启 DSH Desktop，新建会话时选择「Seedance 2.0 导演版 v3.0」。" -ForegroundColor Green
} catch {
    $msg = $_.Exception.Message
    if ($msg -match '拒绝|denied|Unauthorized|UnauthorizedAccess') {
        Write-Host "[提示] 当前权限不足，尝试请求管理员权限安装..." -ForegroundColor Yellow
        $scriptFile = $MyInvocation.MyCommand.Path
        if (-not $scriptFile) { $scriptFile = Join-Path $PSScriptRoot '安装-到DSH.ps1' }
        try {
            Start-Process powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', "`"$scriptFile`"") -Verb RunAs -Wait
            if (Test-Path -LiteralPath $dest) {
                Write-Host "[完成] 已通过管理员权限安装到:" -ForegroundColor Green
                Write-Host "       $dest"
            } else {
                Write-Host "[未完成] 管理员安装可能被取消，请手动复制目录到 $dest" -ForegroundColor Red
            }
        } catch {
            Write-Host "[错误] 无法自动提升权限：$($_.Exception.Message)" -ForegroundColor Red
            Write-Host "请手动把目录复制到: $dest" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[错误] 安装失败：$msg" -ForegroundColor Red
        exit 1
    }
}
