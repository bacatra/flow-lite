Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class KeyboardUtil {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    
    private const byte VK_CONTROL = 0x11;
    private const byte VK_V = 0x56;
    private const uint KEYEVENTF_KEYUP = 0x0002;

    public static void SimulateCtrlV() {
        // Press Ctrl + V
        keybd_event(VK_CONTROL, 0, 0, 0);
        keybd_event(VK_V, 0, 0, 0);
        Thread.Sleep(20);
        // Release V and Ctrl
        keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
    }
}
"@ -ErrorAction SilentlyContinue

[KeyboardUtil]::SimulateCtrlV()
