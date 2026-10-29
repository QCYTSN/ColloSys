param([int]$DesktopProcessId)
$ErrorActionPreference = 'Stop'
$targetProcess = Get-Process -Id $DesktopProcessId
if ($targetProcess.ProcessName -ne 'electron' -or $targetProcess.MainWindowTitle -ne 'ColloSys' -or $targetProcess.MainWindowHandle -eq 0) { throw 'Expected the verified TEST ColloSys window' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class ColloSysDragCheck {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rectangle);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
[void][ColloSysDragCheck]::SetProcessDPIAware()
$target = $targetProcess.MainWindowHandle
$previous = [ColloSysDragCheck]::GetForegroundWindow()
$cursor = New-Object ColloSysDragCheck+Point
$before = New-Object ColloSysDragCheck+Rect
[void][ColloSysDragCheck]::GetCursorPos([ref]$cursor)
if (-not [ColloSysDragCheck]::GetWindowRect($target, [ref]$before)) { throw 'Window bounds unavailable' }
try {
  [void][ColloSysDragCheck]::SetForegroundWindow($target)
  Start-Sleep -Milliseconds 150
  if ([ColloSysDragCheck]::GetForegroundWindow() -ne $target) { throw 'Target not foreground; refusing mouse input' }
  # The center of the real non-client caption, away from all window buttons.
  $x = [int](($before.Left + $before.Right) / 2)
  $y = $before.Top + 18
  [void][ColloSysDragCheck]::SetCursorPos($x, $y)
  [ColloSysDragCheck]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  for ($step = 1; $step -le 6; $step++) {
    [void][ColloSysDragCheck]::SetCursorPos($x + 10 * $step, $y + 8 * $step)
    Start-Sleep -Milliseconds 30
  }
  [ColloSysDragCheck]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 100
  $after = New-Object ColloSysDragCheck+Rect
  [void][ColloSysDragCheck]::GetWindowRect($target, [ref]$after)
  if ($after.Left -eq $before.Left -and $after.Top -eq $before.Top) { throw 'Native caption drag did not move the window' }
  @{before=@{x=$before.Left;y=$before.Top};after=@{x=$after.Left;y=$after.Top};method='Win32 pointer drag on verified native caption'} | ConvertTo-Json -Compress
} finally {
  [ColloSysDragCheck]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  [void][ColloSysDragCheck]::SetCursorPos($cursor.X, $cursor.Y)
  if ($previous -ne [IntPtr]::Zero) { [void][ColloSysDragCheck]::SetForegroundWindow($previous) }
}
