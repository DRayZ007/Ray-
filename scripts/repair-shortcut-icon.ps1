[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory = $true)][string]$InstallDirectory,
  [string]$IconSource = (Join-Path $PSScriptRoot '../resources/icon.ico'),
  [string]$BackupDirectory = (Join-Path $PSScriptRoot '../build/shortcut-icon-repair')
)
$ErrorActionPreference = 'Stop'
$installRoot = (Resolve-Path -LiteralPath $InstallDirectory).Path
$executable = Join-Path $installRoot '马克笔记.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw "Application missing: $executable" }
$source = (Resolve-Path -LiteralPath $IconSource).Path
$bytes = [IO.File]::ReadAllBytes($source)
if ($bytes.Length -lt 6 -or [BitConverter]::ToUInt16($bytes, 0) -ne 0 -or [BitConverter]::ToUInt16($bytes, 2) -ne 1) { throw 'IconSource must be a Windows ICO file.' }
$iconHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
$iconPath = Join-Path $installRoot "resources/icon-$($iconHash.Substring(0, 12)).ico"
$shell = New-Object -ComObject WScript.Shell
$directories = @(
  [Environment]::GetFolderPath('DesktopDirectory'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('CommonPrograms')
) | Where-Object { $_ } | Select-Object -Unique
$links = @($directories | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -Filter '马克笔记.lnk' -Recurse -ErrorAction SilentlyContinue
} | Where-Object { $shell.CreateShortcut($_.FullName).TargetPath -eq $executable })
if ($links.Count -eq 0) { throw 'No shortcuts pointing to this installation were found.' }
if (-not $PSCmdlet.ShouldProcess($installRoot, "Copy current icon and refresh $($links.Count) existing shortcut(s)")) { return }
$backupRoot = Join-Path $BackupDirectory ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
Copy-Item -LiteralPath $source -Destination $iconPath
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MarkNotesShellIconRefresh {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern void SHChangeNotify(uint eventId, uint flags, string item, IntPtr other);
}
'@
$records = @()
for ($index = 0; $index -lt $links.Count; $index++) {
  $linkPath = $links[$index].FullName
  $link = $shell.CreateShortcut($linkPath)
  Copy-Item -LiteralPath $linkPath -Destination (Join-Path $backupRoot "before-$index.lnk")
  $previousIcon = $link.IconLocation
  $link.IconLocation = "$iconPath,0"
  $link.Save()
  $verified = $shell.CreateShortcut($linkPath)
  if ($verified.TargetPath -ne $executable -or $verified.IconLocation -ne "$iconPath,0") { throw "Shortcut verification failed: $linkPath" }
  [MarkNotesShellIconRefresh]::SHChangeNotify(0x2000, 0x1005, $linkPath, [IntPtr]::Zero)
  $records += [pscustomobject]@{ Shortcut = $linkPath; Target = $verified.TargetPath; PreviousIcon = $previousIcon; Icon = $verified.IconLocation }
}
$records | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot 'repair.json') -Encoding utf8
[MarkNotesShellIconRefresh]::SHChangeNotify(0x08000000, 0, $null, [IntPtr]::Zero)
$records | Format-List
