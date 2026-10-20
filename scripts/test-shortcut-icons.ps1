[CmdletBinding()]
param([string]$NsisCompiler, [string]$PluginDirectory)
$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cacheRoot = Join-Path $env:LOCALAPPDATA 'electron-builder/Cache'
if (-not $NsisCompiler) { $NsisCompiler = (Get-ChildItem -LiteralPath $cacheRoot -Filter makensis.exe -Recurse | Where-Object { $_.Directory.Name -ne 'Bin' } | Select-Object -First 1).FullName }
if (-not $PluginDirectory) { $PluginDirectory = (Get-ChildItem -LiteralPath $cacheRoot -Filter WinShell.dll -Recurse | Where-Object { $_.Directory.Name -eq 'x86-unicode' } | Select-Object -First 1).Directory.FullName }
if (-not $NsisCompiler -or -not $PluginDirectory) { throw 'Build the installer first to populate the NSIS compiler and plugin cache.' }
$testRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot "build/shortcut-tests/$([Guid]::NewGuid().ToString('N'))"))
if (-not $testRoot.StartsWith($workspaceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test path escaped workspace.' }
New-Item -ItemType Directory -Force -Path (Join-Path $testRoot 'resources') | Out-Null
$executable = Join-Path $testRoot '马克笔记.exe'
[IO.File]::WriteAllText($executable, 'Shortcut target only; never executed.')
$iconPath = Join-Path $testRoot 'resources/icon-0.0.test.ico'
Copy-Item -LiteralPath (Join-Path $workspaceRoot 'resources/icon.ico') -Destination $iconPath
$desktopLink = Join-Path $testRoot 'desktop.lnk'
$startLink = Join-Path $testRoot 'start.lnk'
$harnessPath = Join-Path $testRoot 'shortcut-harness.exe'
$source = @'
Unicode true
!include LogicLib.nsh
!addplugindir /x86-unicode "@PLUGINS@"
!define VERSION "0.0.test"
!define APP_ID "com.marknotes.shortcuttest"
!define APP_DESCRIPTION "Mark Notes shortcut test"
!include "@INCLUDE@"
Name "Mark Notes shortcut test"
OutFile "@OUTPUT@"
InstallDir "@ROOT@"
RequestExecutionLevel user
SilentInstall silent
Var appExe
Var newDesktopLink
Var newStartMenuLink
Section
  StrCpy $appExe "$INSTDIR\马克笔记.exe"
  StrCpy $newDesktopLink "$INSTDIR\desktop.lnk"
  StrCpy $newStartMenuLink "$INSTDIR\start.lnk"
  !insertmacro customInstall
SectionEnd
'@
$source = $source.Replace('@PLUGINS@', $PluginDirectory).Replace('@INCLUDE@', (Join-Path $workspaceRoot 'resources/installer.nsh')).Replace('@OUTPUT@', $harnessPath).Replace('@ROOT@', $testRoot)
$sourcePath = Join-Path $testRoot 'shortcut-harness.nsi'
[IO.File]::WriteAllText($sourcePath, $source, [Text.UTF8Encoding]::new($false))
& $NsisCompiler /V2 /INPUTCHARSET UTF8 $sourcePath
if ($LASTEXITCODE -ne 0) { throw 'NSIS shortcut harness compilation failed.' }
$shell = New-Object -ComObject WScript.Shell
foreach ($linkPath in @($desktopLink, $startLink)) {
  $link = $shell.CreateShortcut($linkPath)
  $link.TargetPath = $executable
  $link.IconLocation = "$executable,0"
  $link.Save()
}
function Invoke-ShortcutUpdate {
  $process = Start-Process -FilePath $harnessPath -WindowStyle Hidden -PassThru -Wait
  if ($process.ExitCode -ne 0) { throw "Shortcut update exited $($process.ExitCode)" }
}
function Assert-Shortcut([string]$linkPath) {
  if (-not (Test-Path -LiteralPath $linkPath)) { throw "Shortcut missing: $linkPath" }
  $link = $shell.CreateShortcut($linkPath)
  if ($link.TargetPath -ne $executable -or $link.IconLocation -ne "$iconPath,0") { throw "Shortcut not refreshed: $linkPath" }
  $shellApp = New-Object -ComObject Shell.Application
  $item = $shellApp.Namespace($testRoot).ParseName([IO.Path]::GetFileName($linkPath))
  if ($item.ExtendedProperty('System.AppUserModel.ID') -ne 'com.marknotes.shortcuttest') { throw 'Shortcut lost its application identity.' }
}
Invoke-ShortcutUpdate
Assert-Shortcut $desktopLink
Assert-Shortcut $startLink
# Re-run the production upgrade hook with a deliberately removed desktop link.
Remove-Item -LiteralPath $desktopLink
$link = $shell.CreateShortcut($startLink)
$link.IconLocation = "$executable,0"
$link.Save()
Invoke-ShortcutUpdate
if (Test-Path -LiteralPath $desktopLink) { throw 'Removed desktop shortcut was unexpectedly recreated.' }
Assert-Shortcut $startLink
Remove-Item -LiteralPath $startLink
Invoke-ShortcutUpdate
if ((Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startLink)) { throw 'Missing shortcuts were unexpectedly created.' }
'PASS: production NSIS hook refreshes legacy desktop/start icons, preserves app identity, and respects missing shortcuts.' | Tee-Object -FilePath (Join-Path $testRoot 'result.txt')
