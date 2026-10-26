param([int]$DesktopProcessId, [string]$EvidencePath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class ColloSysNativeCapture {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rectangle);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
[void][ColloSysNativeCapture]::SetProcessDPIAware()
$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$processCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $DesktopProcessId)
$picker = $null
for ($attempt = 0; $attempt -lt 40 -and $null -eq $picker; $attempt++) {
  $windows = $desktop.FindAll([System.Windows.Automation.TreeScope]::Children, $processCondition)
  foreach ($window in $windows) {
    if ($window.Current.Name -eq 'Choose a project directory') { $picker = $window; break }
    $nameCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Choose a project directory')
    $picker = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $nameCondition)
    if ($null -ne $picker) { break }
  }
  if ($null -eq $picker) { Start-Sleep -Milliseconds 250 }
}
if ($null -eq $picker) {
  $windows | ForEach-Object { Write-Output (($_.Current | Select-Object Name, ProcessId, ClassName) | ConvertTo-Json -Compress) }
  throw 'Actual native folder picker did not appear'
}
$bounds = New-Object ColloSysNativeCapture+Rect
if (-not [ColloSysNativeCapture]::GetWindowRect([IntPtr]$picker.Current.NativeWindowHandle, [ref]$bounds)) { throw 'No native picker window bounds' }
$bitmap = [System.Drawing.Bitmap]::new($bounds.Right - $bounds.Left, $bounds.Bottom - $bounds.Top)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
  $bitmap.Save($EvidencePath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
$cancelEnglish = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Cancel')
$cancelChinese = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, ([string][char]0x53D6 + [char]0x6D88))
$cancelCondition = [System.Windows.Automation.OrCondition]::new($cancelEnglish, $cancelChinese)
$cancel = $picker.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cancelCondition)
if ($null -eq $cancel) { throw 'Native Cancel button not found' }
$invoke = $null
if ($cancel.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invoke)) {
  $invoke.Invoke()
} else {
  # This Windows common dialog exposes Cancel through MSAA, not InvokePattern.
  # Send its standard IDCANCEL command to the observed, process-scoped dialog.
  if (-not [ColloSysNativeCapture]::PostMessage([IntPtr]$picker.Current.NativeWindowHandle, 0x111, [IntPtr]2, [IntPtr]::Zero)) { throw 'Native Cancel command failed' }
}
Write-Output 'Native folder picker canceled'
