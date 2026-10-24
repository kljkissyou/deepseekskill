@echo off
chcp 65001 >nul
title 交付卡片一键安装
setlocal
set "NODE="
where node >nul 2>nul && set "NODE=node"
if not defined NODE (
  for %%R in ("%ProgramFiles%" "%ProgramFiles(x86)%" "%LOCALAPPDATA%\Programs" "D:" "E:") do (
    if not defined NODE if exist "%%~R\DeepSeek\DSH Desktop\resources\app\node_modules\node\bin\node.exe" set "NODE=%%~R\DeepSeek\DSH Desktop\resources\app\node_modules\node\bin\node.exe"
  )
)
if not defined NODE (
  echo [X] 找不到 node.exe。请先安装 Node.js，或把 node 所在目录加入 PATH 后重试。
  pause
  exit /b 1
)
"%NODE%" "%~dp0install.mjs" %*
echo.
pause
