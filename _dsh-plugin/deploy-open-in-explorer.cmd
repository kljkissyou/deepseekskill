@echo off
chcp 65001 >nul
title dsh-open-in-explorer deploy
set NODE="E:\Program Files\DeepSeek\DSH Desktop\resources\app\node_modules\node\bin\node.exe"
if not exist %NODE% set NODE=node
%NODE% "%~dp0deploy-open-in-explorer.mjs" %*
echo.
pause