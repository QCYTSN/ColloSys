param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$testRoot = [IO.Path]::GetFullPath($Directory)
if (Test-Path -LiteralPath $testRoot) { throw 'Use a new isolated installation test directory.' }
New-Item -ItemType Directory -Path $testRoot | Out-Null
Expand-Archive -LiteralPath $Archive -DestinationPath (Join-Path $testRoot 'extracted')
$package = Get-ChildItem -LiteralPath (Join-Path $testRoot 'extracted') -Directory | Select-Object -First 1
& (Join-Path $package.FullName 'Install.ps1') -Destination (Join-Path $testRoot 'installed') -NoShortcut
if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'installed\app\runtime\node.exe'))) { throw 'Installed runtime missing' }
