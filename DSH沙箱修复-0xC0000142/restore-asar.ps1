# Restore DSH Desktop's app.asar from a patch backup.
#
#   .\restore-asar.ps1                      # restore the newest backup
#   .\restore-asar.ps1 -List                # list available backups
#   .\restore-asar.ps1 -BackupFile <path>   # restore a specific backup
#
# ASCII-only on purpose: PowerShell 5.1 mis-parses non-ASCII .ps1 files that lack a BOM.
param(
  [string]$BackupFile = '',
  [string]$Asar       = 'E:\Program Files\DeepSeek\DSH Desktop\resources\app.asar',
  [string]$BackupDir  = 'E:\Deepseek\_backup-asar',
  [switch]$List
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $BackupDir)) { throw "backup dir not found: $BackupDir" }
$backups = Get-ChildItem -Path $BackupDir -Filter 'app.asar.orig-*' | Sort-Object LastWriteTime -Descending

if ($List) {
  if ($backups.Count -eq 0) { Write-Output 'no backups found'; exit 0 }
  foreach ($b in $backups) {
    Write-Output ("{0}  {1,12} bytes  {2}" -f $b.LastWriteTime.ToString('s'), $b.Length, $b.FullName)
  }
  exit 0
}

if ($BackupFile -eq '') {
  if ($backups.Count -eq 0) { throw 'no backups found' }
  $BackupFile = $backups[0].FullName
}
if (-not (Test-Path $BackupFile)) { throw "backup file not found: $BackupFile" }

Write-Output "asar       = $Asar"
Write-Output "backup     = $BackupFile"
Write-Output ("backup size= " + (Get-Item $BackupFile).Length)

$backupHash = (Get-FileHash -Algorithm SHA256 -Path $BackupFile).Hash
Write-Output "sha256(backup) = $backupHash"

$stamp = (Get-Date).ToString('yyyy-MM-ddTHH-mm-ss')
$current = Join-Path $BackupDir ("app.asar.before-restore-" + $stamp)
Copy-Item -Path $Asar -Destination $current -Force
Write-Output ("saved current app.asar to " + $current)

Copy-Item -Path $BackupFile -Destination $Asar -Force
$afterHash = (Get-FileHash -Algorithm SHA256 -Path $Asar).Hash
Write-Output "sha256(asar after restore) = $afterHash"
if ($afterHash -ne $backupHash) { throw 'RESTORE HASH MISMATCH' }
Write-Output 'RESTORE OK — restart DSH Desktop for it to take effect.'
