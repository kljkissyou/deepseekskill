@echo off
chcp 65001 >nul
title 交付卡片一键卸载
setlocal
set "NODE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE set "NODE=%%N"
if not defined NODE (
  for /f "usebackq delims=" %%N in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\find-node.ps1"`) do if not defined NODE set "NODE=%%N"
)
if not defined NODE (
  echo [X] 找不到 node.exe。
  echo     办法一：安装 Node.js 后重试 ^(https://nodejs.org^)。
  echo     办法二：把 DSH 自带的 node 目录加入 PATH 后重试。
  echo     办法三：手动指定，例如  "C:\path\to\node.exe" "%~dp0install.mjs" --uninstall
  pause
  exit /b 1
)
echo 使用的 node: %NODE%
"%NODE%" "%~dp0install.mjs" --uninstall %*
echo.
pause
