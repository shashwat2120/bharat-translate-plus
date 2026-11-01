# Builds dist/bharat-translate-plus-v<version>.zip with only the files the extension needs.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File scripts/pack.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$zipPath = Join-Path $root "dist/bharat-translate-plus-v$($manifest.version).zip"

$include = @("manifest.json", "background.js", "sidepanel.html", "sidepanel.css", "sidepanel.js", "icons")

New-Item -ItemType Directory -Force (Split-Path $zipPath) | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, "Create")
try {
  foreach ($item in $include) {
    $full = Join-Path $root $item
    $files = if ((Get-Item $full).PSIsContainer) { Get-ChildItem $full -Recurse -File } else { Get-Item $full }
    foreach ($f in $files) {
      # Forward slashes, so the Chrome Web Store accepts the archive on any OS.
      $entry = $f.FullName.Substring($root.Length + 1).Replace("\", "/")
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entry)
    }
  }
} finally {
  $zip.Dispose()
}

Write-Host "Created $zipPath"
$check = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$check.Entries | ForEach-Object { Write-Host "  $($_.FullName)" }
$check.Dispose()
