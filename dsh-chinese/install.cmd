@echo off
setlocal EnableExtensions
REM ===========================================================================
REM  dsh-chinese installer
REM  Run this from any folder AFTER copying the whole "dsh-chinese" folder to
REM  the target machine. It adds the plugin to the active DSH profile using the
REM  official `dsh plugin` command (which auto-reconciles dsh.profile.bundles).
REM
REM  Usage:
REM      install.cmd                 # install into profile "web" (most common)
REM      install.cmd <profile-name>  # install into another profile
REM
REM  Requires: a working DSH CLI (`dsh`) on PATH. If `dsh` is not on PATH,
REM  fall back to the manual method described in README-安装说明.md.
REM ===========================================================================

set "PROFILE=%~1"
if "%PROFILE%"=="" set "PROFILE=web"

REM The plugin source is the folder this script lives in.
set "PKG=%~dp0"
REM Trim trailing backslash.
if "%PKG:~-1%"=="\" set "PKG=%PKG:~0,-1%"

echo Installing dsh-chinese into DSH profile "%PROFILE%" ...

where dsh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [dsh plugin] %PROFILE% add "%PKG%"
    call dsh plugin --profile "%PROFILE%" add "%PKG%"
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo SUCCESS: dsh-chinese installed. Restart DeepSeek Harness, then open
        echo Settings - the "Chinese replies" toggle appears near the top.
        exit /b 0
    )
    echo.
    echo The dsh command ran but returned an error (see above).
    echo Falling back to the manual method...
) else (
    echo [warn] 'dsh' not found on PATH.
)

REM ---- Manual fallback: copy package + declare bundle in the profile ----
set "BASE=%APPDATA%\dsh-desktop\harness\profiles\%PROFILE%"
if not exist "%BASE%\" (
    echo ERROR: profile directory not found: %BASE%
    echo Provide a path via:  install.cmd ^<profile-name^>
    exit /b 1
)
set "DEST=%BASE%\node_modules\dsh-chinese"
if not exist "%DEST%\" mkdir "%DEST%"
echo Copying plugin to %DEST%
xcopy /E /I /Y "%PKG%" "%DEST%\" >nul
if %ERRORLEVEL% NEQ 0 ( echo ERROR: copy failed & exit /b 1 )

echo.
echo Reminder: open the profile manifest
echo     %BASE%\package.json
echo and ensure:
echo   1. "dsh-chinese" is present under dependencies, e.g.
echo        "dsh-chinese": "file:./node_modules/dsh-chinese"
echo   2. "dsh-chinese" is present under dsh.profile.bundles
echo Then restart DeepSeek Harness.
exit /b 0
