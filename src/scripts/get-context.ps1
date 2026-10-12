Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinUtil {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static string GetInfo() {
        IntPtr hwnd = GetForegroundWindow();
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(hwnd, sb, 512);
        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);
        return pid + "|||" + sb.ToString();
    }
}
"@ -ErrorAction SilentlyContinue

$info = [WinUtil]::GetInfo()
$parts = $info -split '\|\|\|'
$pidVal = [int]$parts[0]
$title = $parts[1]
$procName = ""
try {
    $procName = (Get-Process -Id $pidVal -ErrorAction SilentlyContinue).ProcessName
} catch {}

$focusedText = ""
try {
    Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue
    Add-Type -AssemblyName UIAutomationTypes -ErrorAction SilentlyContinue
    $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($focused -ne $null) {
        $valPattern = $null
        if ($focused.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valPattern)) {
            $val = $valPattern.Current.Value
            if ($val -ne $null -and $val.Length -gt 0) {
                # Truncate to last 500 chars if too long
                if ($val.Length -gt 500) { $focusedText = $val.Substring($val.Length - 500) } else { $focusedText = $val }
            }
        }
    }
} catch {}

$result = [PSCustomObject]@{
    ProcessName = $procName
    WindowTitle = $title
    FocusedText = $focusedText
}

$result | ConvertTo-Json -Compress
