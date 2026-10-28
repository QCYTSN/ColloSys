param([int]$DesktopProcessId, [string]$EvidencePath, [switch]$Close)
$ErrorActionPreference = 'Stop'
$nativeProcess = Get-Process -Id $DesktopProcessId
if ($nativeProcess.ProcessName -ne 'electron' -or $nativeProcess.MainWindowTitle -ne 'ColloSys' -or $nativeProcess.MainWindowHandle -eq 0) { throw 'Expected the verified ColloSys native window' }
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class ColloSysWindowCheck {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rectangle);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr target, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
[void][ColloSysWindowCheck]::SetProcessDPIAware()
$handle = $nativeProcess.MainWindowHandle
$bounds = New-Object ColloSysWindowCheck+Rect
if (-not [ColloSysWindowCheck]::GetWindowRect($handle, [ref]$bounds)) { throw 'Native window bounds unavailable' }
$bitmap = [System.Drawing.Bitmap]::new($bounds.Right - $bounds.Left, $bounds.Bottom - $bounds.Top)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  # Read only the verified target window, even when the person is using a
  # different foreground app. CopyFromScreen can silently capture that app.
  $dc = $graphics.GetHdc()
  try {
    if (-not [ColloSysWindowCheck]::PrintWindow($handle, $dc, 2)) { throw 'Target window capture failed' }
  } finally { $graphics.ReleaseHdc($dc) }
  $colors = New-Object 'System.Collections.Generic.HashSet[int]'
  for ($x = 10; $x -lt $bitmap.Width; $x += 43) {
    for ($y = 50; $y -lt $bitmap.Height; $y += 43) { [void]$colors.Add($bitmap.GetPixel($x, $y).ToArgb()) }
  }
  if ($colors.Count -lt 10) { throw 'Target window capture is blank; do not publish it as evidence' }
  $bitmap.Save($EvidencePath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
if ($Close) {
  if (-not [ColloSysWindowCheck]::PostMessage($handle, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)) { throw 'Native close request failed' }
}
Write-Output 'Verified actual ColloSys native window'
