@echo off
rem Re-apply the workspace-write sandbox fix after a DSH Desktop update.
rem An update replaces app.asar, which silently removes the patch.
setlocal
set "EXE=E:\Program Files\DeepSeek\DSH Desktop\DSH Desktop.exe"
if not exist "%EXE%" (
  echo [ERROR] DSH Desktop.exe not found: %EXE%
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=1
"%EXE%" "%~dp0patch-asar.mjs" %*
echo.
echo exit code = %ERRORLEVEL%
endlocal
