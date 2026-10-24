# ============================================================
# Seedance 提示词导演 3.01 —— 一键安装脚本
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
#   （或直接双击同目录 install.bat）
# 可选参数：
#   -DSHHome <路径>    DSH 配置目录（默认 %APPDATA%\dsh-desktop\harness）
#   -Workspace <路径>  工具脚本安装的工作区（默认自动检测 E:\Deepseek）
#   -SkipKey           跳过 TT_API_KEY 交互设置（稍后手动配）
#   -DryRun            只预览将执行的动作，不实际写入
# ============================================================
[CmdletBinding()]
param(
  [string]$DSHHome   = '',
  [string]$Workspace = '',
  [switch]$SkipKey,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
if ([string]::IsNullOrEmpty($DSHHome)) { $DSHHome = Join-Path $env:APPDATA 'dsh-desktop\harness' }
$presetName = 'seedance-prompter-v301'
$presetSrc  = Join-Path $src ("agent-presets\{0}" -f $presetName)
$toolsSrc   = Join-Path $src 'tools-转换工具'

function Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Done([string]$msg) { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Skip([string]$msg) { Write-Host "    [跳过] $msg" -ForegroundColor Yellow }
function Warn([string]$msg) { Write-Host "    [注意] $msg" -ForegroundColor Magenta }

Write-Host '=====================================================' -ForegroundColor Cyan
Write-Host '  Seedance 提示词导演 3.01  一键安装' -ForegroundColor Cyan
Write-Host "  源目录 : $src" -ForegroundColor Cyan
Write-Host "  DSH_HOME: $DSHHome" -ForegroundColor Cyan
Write-Host '=====================================================' -ForegroundColor Cyan
if ($DryRun) { Write-Host '（干跑模式 -DryRun：仅预览，不写任何文件）' -ForegroundColor Yellow }

# ---------- 0. 预检 ----------
if (-not (Test-Path $DSHHome)) { throw "找不到 DSH 配置目录：$DSHHome`n请用 -DSHHome 指定目标机 %APPDATA%\dsh-desktop\harness 路径。" }
if (-not (Test-Path $presetSrc)) { throw "便携包内缺少预设目录：$presetSrc`n请确认 install.ps1 与 agent-presets\ 在同一目录。" }
if (-not (Test-Path $toolsSrc))  { throw "便携包内缺少工具目录：$toolsSrc" }
Done '预检通过'

# ---------- 1. 安装预设本体（含 skills 子目录） ----------
Step '1/5 安装预设本体（agent.cordis.yml + preset.yml + skills\）'
$presetDst = Join-Path $DSHHome (".agent-presets\{0}" -f $presetName)
if (Test-Path $presetDst) {
  Skip "预设已存在：$presetName（如需覆盖请先手动删除该目录后重跑）"
} else {
  if ($DryRun) { Write-Host '    将复制：agent-presets\seedance-prompter-v301\ → .agent-presets\' }
  else {
    Copy-Item $presetSrc $presetDst -Recurse -Force
    Done "预设已安装：$presetDst"
  }
}

# ---------- 2. 合并 settings.yaml（缺失才补，已有配置不动，先备份） ----------
Step '2/5 合并 DSH 配置 settings.yaml（agent-presets / agent-default-model / llm-pi-ai）'
$settingsPath = Join-Path $DSHHome 'settings.yaml'
if (-not (Test-Path $settingsPath)) {
  if ($DryRun) { Write-Host '    settings.yaml 不存在，将按参考配置新建' }
  else {
    $refTxt = @'
llm-pi-ai:
  providers:
    tt:
      displayName: TT
      apiKeyEnv: TT_API_KEY
      api: openai-completions
      baseURL: https://tbtk.asia/v1
      models:
        - id: deepseek-v4-flash-0731
        - id: deepseek-v4-flash
        - id: deepseek-v4-pro
agent-default-model:
  provider: tt
  model: deepseek-v4-flash-0731
agent-presets:
  default: seedance-prompter-v301
'@
    [System.IO.File]::WriteAllText($settingsPath, $refTxt, (New-Object System.Text.UTF8Encoding($false)))
    Done 'settings.yaml 已新建（含模型路由与预设挂载参考配置）'
  }
} else {
  if ($DryRun) {
    Write-Host '    settings.yaml 存在 → 将备份并智能合并（不覆盖已有模型/provider 配置）'
  } else {
    $bak = "$settingsPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $settingsPath $bak -Force
    Done "已备份原配置 → $bak"

    # 读入行并检测原文件 BOM，保持原编码写回
    $rawBytes = [System.IO.File]::ReadAllBytes($settingsPath)
    $hadBom = ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF)
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($l in [System.IO.File]::ReadAllLines($settingsPath, [System.Text.Encoding]::UTF8)) { $lines.Add($l) }

    # 顶层键索引
    $topIdx = @{}
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match '^[A-Za-z0-9_\-]+:') {
        $key = ($lines[$i] -split ':')[0].Trim()
        if (-not $topIdx.ContainsKey($key)) { $topIdx[$key] = $i }
      }
    }

    # 2a. agent-presets.default → 指向 v301
    if ($topIdx.ContainsKey('agent-presets')) {
      $j = $topIdx['agent-presets']; $found = $false
      for ($k = $j + 1; $k -lt $lines.Count; $k++) {
        if ($lines[$k] -match '^\s+\S') {
          if ($lines[$k] -match '^\s+default:') {
            $found = $true
            if ($lines[$k] -match 'seedance-prompter-v301') { Skip 'agent-presets.default 已是 v301' }
            else {
              $m = [regex]::Match($lines[$k], '^(\s*)')
              $indent = $m.Groups[1].Value
              $lines[$k] = $indent + 'default: ' + $presetName
              Done 'agent-presets.default 已指向 v301'
            }
          }
        } else { break }
      }
      if (-not $found) { $lines.Insert($j + 1, '  default: ' + $presetName); Done '已补 agent-presets.default' }
    } else {
      $lines.Add('agent-presets:'); $lines.Add('  default: ' + $presetName)
      Done '已补 agent-presets 挂载（default → v301）'
    }

    # 2b. agent-default-model 缺失才补
    if ($topIdx.ContainsKey('agent-default-model')) { Skip 'agent-default-model 已存在（未改动，如需调整模型请手动改）' }
    else {
      $lines.Add('agent-default-model:'); $lines.Add('  provider: tt'); $lines.Add('  model: deepseek-v4-flash-0731')
      Done '已补 agent-default-model（tt / deepseek-v4-flash-0731）'
    }

    # 2c. llm-pi-ai 缺失才补（含 tt provider 参考）
    if ($topIdx.ContainsKey('llm-pi-ai')) { Skip 'llm-pi-ai 已存在（未改动，baseURL/模型以目标机既有配置为准）' }
    else {
      $lines.Add('llm-pi-ai:')
      $lines.Add('  providers:')
      $lines.Add('    tt:')
      $lines.Add('      displayName: TT')
      $lines.Add('      apiKeyEnv: TT_API_KEY')
      $lines.Add('      api: openai-completions')
      $lines.Add('      baseURL: https://tbtk.asia/v1')
      $lines.Add('      models:')
      $lines.Add('        - id: deepseek-v4-flash-0731')
      $lines.Add('        - id: deepseek-v4-flash')
      $lines.Add('        - id: deepseek-v4-pro')
      Done '已补 llm-pi-ai.providers.tt 参考配置（baseURL 请按目标机实际中转修改）'
    }

    $enc = New-Object System.Text.UTF8Encoding($hadBom)
    [System.IO.File]::WriteAllLines($settingsPath, $lines, $enc)
    Done 'settings.yaml 合并完成'
  }
}

# ---------- 3. TT_API_KEY 凭据 ----------
Step '3/5 模型凭据 TT_API_KEY'
if ($env:TT_API_KEY) { Skip "环境变量 TT_API_KEY 已存在（长度 $($env:TT_API_KEY.Length)）" }
elseif ($SkipKey)    { Warn '-SkipKey：跳过设置。请稍后手动新建用户环境变量 TT_API_KEY 或到 DSH 设置-模型提供商填写' }
else {
  if ($DryRun) { Write-Host '    将交互询问 TT_API_KEY 并写入用户环境变量' }
  else {
    Write-Host '    请输入模型中转站的 API Key（输入后直接回车可跳过，稍后手动配）：' -NoNewline -ForegroundColor Yellow
    $key = Read-Host
    if (-not [string]::IsNullOrWhiteSpace($key)) {
      [System.Environment]::SetEnvironmentVariable('TT_API_KEY', $key.Trim(), 'User')
      $env:TT_API_KEY = $key.Trim()
      Done 'TT_API_KEY 已写入用户环境变量'
    } else { Warn '已跳过。请稍后手动配置，否则无法调用模型' }
  }
}

# ---------- 4. 安装转换工具（docx/xlsx 交付用） ----------
Step '4/5 安装转换工具到工作区 .tools\'
if ([string]::IsNullOrEmpty($Workspace)) {
  if (Test-Path 'E:\Deepseek') { $Workspace = 'E:\Deepseek' }
  elseif (Test-Path (Join-Path $env:USERPROFILE 'Deepseek')) { $Workspace = Join-Path $env:USERPROFILE 'Deepseek' }
  elseif (-not $DryRun) {
    Write-Host '    未检测到工作区，请输入工具安装目录（如 D:\Deepseek）：' -NoNewline -ForegroundColor Yellow
    $Workspace = Read-Host
  }
}
if (-not [string]::IsNullOrEmpty($Workspace)) {
  $toolsDst     = Join-Path $Workspace '.tools'
  $mdDst        = Join-Path $toolsDst 'md2docx'
  $map = @{
    (Join-Path $toolsSrc 'gen-table-xlsx.ps1')         = (Join-Path $toolsDst 'gen-table-xlsx.ps1')
    (Join-Path $toolsSrc 'md2docx-multicolor.ps1')     = (Join-Path $mdDst 'md2docx-multicolor.ps1')
    (Join-Path $toolsSrc 'md2docx.ps1')                = (Join-Path $mdDst 'md2docx.ps1')
  }
  foreach ($s in $map.Keys) {
    $d = $map[$s]
    if (Test-Path $d) { Skip ("已存在：{0}" -f $d.Replace($Workspace, '<工作区>')) }
    elseif ($DryRun)  { Write-Host ("    将复制：{0} → {1}" -f $s.Replace($src,'<包内>'), $d.Replace($Workspace,'<工作区>')) }
    else {
      $parent = Split-Path $d -Parent
      if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
      Copy-Item $s $d -Force
      Done ("已安装：{0}" -f $d.Replace($Workspace, '<工作区>'))
    }
  }
} else { Warn '未指定工作区，工具未安装（如需 .docx/.xlsx 交付请手动复制 tools-转换工具\ 下的脚本）' }

# ---------- 5. 收尾 ----------
Step '5/5 完成'
if ($DryRun) {
  Write-Host '（干跑结束：以上为将执行的动作，未写任何文件）' -ForegroundColor Yellow
} else {
  Write-Host '    ✅ 一键安装完成！请按以下步骤启用：' -ForegroundColor Green
  Write-Host '    1. 完全退出 DSH 桌面版，再重新打开（settings.yaml 启动时读取）' -ForegroundColor Green
  Write-Host '    2. 新建会话 → Agent 预设下拉选择「Seedance 2.0 导演版 v3.01」' -ForegroundColor Green
  Write-Host '    3. 会话内用 skill 工具加载 seedance-camera，应显示「3.01 分段式」模板' -ForegroundColor Green
  Write-Host '    4. 如模型路由不对：检查 settings.yaml 的 agent-default-model 与 TT_API_KEY' -ForegroundColor Green
  Write-Host ''
  Write-Host '    疑难排查见 README-部署说明.md（5 大根因：模型路由/缺skills/绝对路径/BOM/未合并配置）' -ForegroundColor DarkGray
}
