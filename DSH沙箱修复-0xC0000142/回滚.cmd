@echo off
rem Restore app.asar from the newest backup made by patch-asar.mjs.
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-asar.ps1" %*
echo.
echo exit code = %ERRORLEVEL%
endlocal
