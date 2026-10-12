$wmi = [WmiClass]"Win32_Process"
$res = $wmi.Create("`"C:\Users\Caio\Desktop\REA\flow-lite\dist\win-unpacked\Flow Lite.exe`"")
Write-Host "Launch return code: $($res.ReturnValue), ProcessId: $($res.ProcessId)"
