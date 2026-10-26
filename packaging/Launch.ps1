$ErrorActionPreference = 'Stop'
$dataDirectory = if ($env:COLLOSYS_DATA) { $env:COLLOSYS_DATA } else { Join-Path $env:LOCALAPPDATA 'ColloSys\data' }
$launchInfo = Join-Path $dataDirectory 'launcher.json'
try {
  if (Test-Path -LiteralPath $launchInfo) {
    $info = Get-Content -LiteralPath $launchInfo -Raw | ConvertFrom-Json
    $alive = Get-Process -Id $info.pid -ErrorAction SilentlyContinue
    if ($alive -and $info.url -match '^http://127\.0\.0\.1:5173/#pair=[a-f0-9]{64}$') {
      $health = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/api/health' -UseBasicParsing -TimeoutSec 2
      if ($health.StatusCode -eq 200) { Start-Process explorer.exe -ArgumentList $info.url -WindowStyle Hidden; exit }
    }
  }
} catch { }
try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git for Windows is required. Install it before starting ColloSys.' }
  New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null
  $appDirectory = Join-Path $PSScriptRoot 'app'
  $process = Start-Process -FilePath (Join-Path $appDirectory 'runtime\node.exe') -ArgumentList '--import tsx scripts\start.ts' -WorkingDirectory $appDirectory -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $dataDirectory 'launcher-output.log') -RedirectStandardError (Join-Path $dataDirectory 'launcher-error.log')
  if ($process.ExitCode -ne 0) { throw "ColloSys could not start. Close other ColloSys instances and inspect $dataDirectory\launcher-error.log" }
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'ColloSys') | Out-Null
}
