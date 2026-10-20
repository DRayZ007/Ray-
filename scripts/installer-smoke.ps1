$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content -Raw (Join-Path $workspaceRoot 'package.json') | ConvertFrom-Json).version
$installer = Join-Path $workspaceRoot "release/MarkNotes-$version-x64-Setup.exe"
$installRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'build/installer-smoke/installed'))
if (-not $installRoot.StartsWith($workspaceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installation path escaped workspace' }
if (Test-Path -LiteralPath $installRoot) { throw 'Smoke installation directory already exists; inspect it before retrying.' }
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) '马克笔记.lnk'
$startShortcut = Join-Path ([Environment]::GetFolderPath('Programs')) '马克笔记.lnk'
foreach ($shortcut in @($desktopShortcut, $startShortcut, (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) '马克笔记.lnk'), (Join-Path ([Environment]::GetFolderPath('CommonPrograms')) '马克笔记.lnk'))) { if (Test-Path -LiteralPath $shortcut) { throw "Existing shortcut must be preserved: $shortcut" } }
$existing = Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*','HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*','HKLM:/Software/WOW6432Node/Microsoft/Windows/CurrentVersion/Uninstall/*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq '马克笔记' }
if ($existing) { throw 'An existing installation must be preserved; run installer smoke in a clean Windows account.' }
$smokeRoot = Split-Path $installRoot
New-Item -ItemType Directory -Force $smokeRoot | Out-Null
$previousExecutable = $env:MARK_NOTES_EXECUTABLE
$previousData = $env:MARK_NOTES_DATA_DIR
$env:MARK_NOTES_DATA_DIR = Join-Path $smokeRoot 'launch-data'
$installed = $false
try {
  $process = Start-Process -FilePath $installer -ArgumentList "/S /D=$installRoot" -WindowStyle Hidden -PassThru -Wait
  if ($process.ExitCode -ne 0) { throw "Installer exited $($process.ExitCode)" }
  $installed = $true
  $executable = Join-Path $installRoot '马克笔记.exe'
  if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed executable missing' }
  $shortcutIcon = Join-Path $installRoot "resources/icon-$version.ico"
  if ((Get-FileHash -LiteralPath $shortcutIcon).Hash -ne (Get-FileHash -LiteralPath (Join-Path $workspaceRoot 'resources/icon.ico')).Hash) { throw 'Installed shortcut icon differs from SVG-generated ICO' }
  $wsh = New-Object -ComObject WScript.Shell
  $shortcuts = foreach ($shortcut in @($desktopShortcut, $startShortcut)) {
    if (-not (Test-Path -LiteralPath $shortcut)) { throw "Shortcut missing: $shortcut" }
    $link = $wsh.CreateShortcut($shortcut)
    if ($link.TargetPath -ne $executable) { throw "Incorrect shortcut target: $($link.TargetPath)" }
    if ($link.IconLocation -ne "$shortcutIcon,0") { throw "Incorrect shortcut icon: $($link.IconLocation)" }
    [PSCustomObject]@{ Path = $shortcut; Target = $link.TargetPath; Icon = $link.IconLocation }
  }
  $shortcuts | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $smokeRoot 'shortcuts.json') -Encoding utf8
  # Simulate legacy links still referencing the unchanged exe path, then upgrade.
  foreach ($shortcut in @($desktopShortcut, $startShortcut)) {
    $link = $wsh.CreateShortcut($shortcut)
    $link.IconLocation = "$executable,0"
    $link.Save()
  }
  $upgrade = Start-Process -FilePath $installer -ArgumentList "/S /D=$installRoot" -WindowStyle Hidden -PassThru -Wait
  if ($upgrade.ExitCode -ne 0) { throw "Upgrade exited $($upgrade.ExitCode)" }
  foreach ($shortcut in @($desktopShortcut, $startShortcut)) {
    $link = $wsh.CreateShortcut($shortcut)
    if ($link.TargetPath -ne $executable -or $link.IconLocation -ne "$shortcutIcon,0") { throw "Upgrade failed to refresh shortcut: $shortcut" }
  }
  Add-Type -AssemblyName System.Drawing
  $icon = [Drawing.Icon]::ExtractAssociatedIcon($executable)
  try { $bitmap = $icon.ToBitmap(); try { $bitmap.Save((Join-Path $smokeRoot 'installed-icon.png')) } finally { $bitmap.Dispose() } } finally { $icon.Dispose() }
  $env:MARK_NOTES_EXECUTABLE = $executable
  & npx playwright test tests/desktop/smoke.spec.ts
  if ($LASTEXITCODE -ne 0) { throw 'Installed executable smoke tests failed' }
} finally {
  $env:MARK_NOTES_EXECUTABLE = $previousExecutable
  $env:MARK_NOTES_DATA_DIR = $previousData
  if ($installed) {
    $uninstaller = Join-Path $installRoot 'Uninstall 马克笔记.exe'
    if (-not (Test-Path -LiteralPath $uninstaller)) { throw "Uninstaller missing: $uninstaller" }
    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
    if ($uninstall.ExitCode -ne 0) { throw "Uninstaller exited $($uninstall.ExitCode)" }
    for ($i = 0; $i -lt 30 -and (Test-Path -LiteralPath (Join-Path $installRoot '马克笔记.exe')); $i++) { Start-Sleep -Milliseconds 300 }
    if (Test-Path -LiteralPath (Join-Path $installRoot '马克笔记.exe')) { throw 'Executable still exists after uninstall' }
    foreach ($shortcut in @($desktopShortcut, $startShortcut)) { if (Test-Path -LiteralPath $shortcut) { throw "Shortcut still exists after uninstall: $shortcut" } }
  }
}
'PASS: install, versioned shortcut icons, upgrade refresh, embedded icon, installed app editing/restart, uninstall'
