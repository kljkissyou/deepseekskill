@echo off
rem Seedance 提示词导演 3.01 一键安装入口（双击运行）
chcp 936 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
