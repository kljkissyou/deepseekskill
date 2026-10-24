# find-node.ps1 —— 给 安装.cmd / 卸载.cmd 找一个可用的 node.exe
#
# 输出：命中的绝对路径（一行）；找不到就什么都不输出，退出码 1。
# v1.1 起不再写死 "DeepSeek\DSH Desktop\resources\app\node_modules\node\bin\node.exe"，
# 而是同时覆盖新旧两种 DSH 安装布局，并扫描常见的 Program Files 目录。
$ErrorActionPreference = 'SilentlyContinue'
$script:found = $null

function Consider([string]$p) {
    if ($script:found) { return }
    if ([string]::IsNullOrWhiteSpace($p)) { return }
    if (Test-Path -LiteralPath $p -PathType Leaf) { $script:found = $p }
}

# ① PATH 里的 node 优先（用户自己装过 Node.js 的情况）
$cmd = Get-Command node.exe -ErrorAction SilentlyContinue
if ($cmd) { Consider $cmd.Source }

# ② Node.js 的常规安装位置
Consider (Join-Path $env:ProgramFiles 'nodejs\node.exe')
Consider (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
Consider (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')

# ③ DSH Desktop 启动时导出的解释器（如果是从 DSH 里起的进程）
Consider $env:DSH_DESKTOP_NODE_EXECUTABLE

# ④ DSH 应用包自带的 node（两种布局）
$rels = @(
    'resources\runtime\primary-runtime\dependencies\node\bin\node.exe',
    'resources\app\node_modules\node\bin\node.exe',
    'resources\runtime\bin\node.exe'
)
$bases = @()
foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, (Join-Path $env:LOCALAPPDATA 'Programs'))) {
    if ($base -and (Test-Path -LiteralPath $base)) { $bases += $base }
}
foreach ($drive in @('C:\', 'D:\', 'E:\', 'F:\', 'G:\')) {
    foreach ($pf in @('Program Files', 'Program Files (x86)', 'Programs')) {
        $p = Join-Path $drive $pf
        if (Test-Path -LiteralPath $p) { $bases += $p }
    }
}
foreach ($base in ($bases | Select-Object -Unique)) {
    foreach ($dir in (Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue)) {
        if ($dir.Name -notmatch 'dsh|deepseek|harness') { continue }
        foreach ($rel in $rels) { Consider (Join-Path $dir.FullName $rel) }
    }
}

if ($script:found) {
    Write-Output $script:found
    exit 0
}
exit 1
