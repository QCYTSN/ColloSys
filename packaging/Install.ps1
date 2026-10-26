param([string]$Destination = (Join-Path $env:LOCALAPPDATA 'Programs\ColloSys'), [switch]$NoShortcut)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Install Git for Windows first, then run this installer again.' }
$destinationFull = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $destinationFull) { throw 'Destination already exists. Choose a new installation folder; existing files were not changed.' }
New-Item -ItemType Directory -Path $destinationFull | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'app') -Destination $destinationFull -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Launch.vbs') -Destination $destinationFull
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Launch.ps1') -Destination $destinationFull
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Uninstall.ps1') -Destination $destinationFull
if (-not $NoShortcut) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'ColloSys.lnk'))
  $shortcut.TargetPath = (Join-Path $env:WINDIR 'System32\wscript.exe')
  $shortcut.Arguments = '"' + (Join-Path $destinationFull 'Launch.vbs') + '"'
  $shortcut.WorkingDirectory = $destinationFull
  $shortcut.Save()
}
Write-Output "Installed in $destinationFull. Launch ColloSys from the desktop shortcut. Project files are never moved."
