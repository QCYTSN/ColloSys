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
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
[void][ColloSysWindowCheck]::SetProcessDPIAware()
$handle = $nativeProcess.MainWindowHandle
[void][ColloSysWindowCheck]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 250
$bounds = New-Object ColloSysWindowCheck+Rect
if (-not [ColloSysWindowCheck]::GetWindowRect($handle, [ref]$bounds)) { throw 'Native window bounds unavailable' }
$bitmap = [System.Drawing.Bitmap]::new($bounds.Right - $bounds.Left, $bounds.Bottom - $bounds.Top)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
  $bitmap.Save($EvidencePath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
if ($Close) {
  if (-not [ColloSysWindowCheck]::PostMessage($handle, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)) { throw 'Native close request failed' }
}
Write-Output 'Verified actual ColloSys native window'
