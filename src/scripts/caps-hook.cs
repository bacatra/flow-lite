using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

class Program
{
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int VK_CAPITAL = 0x14;
    private const int VK_SHIFT = 0x10;
    private const int VK_LSHIFT = 0xA0;
    private const int VK_RSHIFT = 0xA1;

    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;
    private static bool _capsIsDown = false;
    private static long _lastTypingTicks = 0;

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int x;
        public int y;
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    static void Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        // Monitor parent process by PID
        int parentPid = 0;
        if (args.Length > 0 && int.TryParse(args[0], out parentPid))
        {
            Thread monitorThread = new Thread(() =>
            {
                try
                {
                    Process parent = Process.GetProcessById(parentPid);
                    parent.WaitForExit();
                }
                catch { }
                Environment.Exit(0);
            });
            monitorThread.IsBackground = true;
            monitorThread.Start();
        }

        _hookID = SetHook(_proc);
        if (_hookID == IntPtr.Zero)
        {
            Console.Error.WriteLine("Failed to install keyboard hook");
            return;
        }

        Console.WriteLine("HOOK_READY");
        Console.Out.Flush();

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) { }

        UnhookWindowsHookEx(_hookID);
    }

    private static IntPtr SetHook(LowLevelKeyboardProc proc)
    {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule)
        {
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            int vkCode = Marshal.ReadInt32(lParam);
            int flags = Marshal.ReadInt32(lParam, 8);
            bool isInjected = (flags & 0x10) != 0; // Ignore synthetic keystrokes

            if (!isInjected)
            {
                if (vkCode == VK_CAPITAL)
                {
                    bool shiftDown = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0 ||
                                     (GetAsyncKeyState(VK_LSHIFT) & 0x8000) != 0 ||
                                     (GetAsyncKeyState(VK_RSHIFT) & 0x8000) != 0;

                    if (!shiftDown)
                    {
                        if (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)
                        {
                            if (!_capsIsDown)
                            {
                                _capsIsDown = true;
                                Console.WriteLine("CAPS_DOWN");
                                Console.Out.Flush();
                            }
                            return (IntPtr)1; // Suppress CapsLock toggle
                        }
                        else if (wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP)
                        {
                            if (_capsIsDown)
                            {
                                _capsIsDown = false;
                                Console.WriteLine("CAPS_UP");
                                Console.Out.Flush();
                            }
                            return (IntPtr)1; // Suppress CapsLock toggle
                        }
                    }
                }
                else
                {
                    // Detect typing activity for Flow Lite Dynamic Island hint
                    if (!_capsIsDown && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
                    {
                        if ((vkCode >= 0x41 && vkCode <= 0x5A) ||
                            (vkCode >= 0x30 && vkCode <= 0x39) ||
                            vkCode == 0x20 ||
                            vkCode == 0x08 ||
                            vkCode == 0x0D ||
                            (vkCode >= 0xBA && vkCode <= 0xDE))
                        {
                            long now = DateTime.UtcNow.Ticks;
                            if (now - _lastTypingTicks > TimeSpan.FromSeconds(3).Ticks)
                            {
                                _lastTypingTicks = now;
                                Console.WriteLine("TYPING_DETECTED");
                                Console.Out.Flush();
                            }
                        }
                    }
                }
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }
}
