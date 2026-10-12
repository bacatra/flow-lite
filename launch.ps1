$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }

$exePath = Join-Path $baseDir "dist\win-unpacked\Flow Lite.exe"
if (-not (Test-Path $exePath)) {
    $exePath = Join-Path $baseDir "dist\Flow Lite 1.0.0.exe"
}

$wmi = [WmiClass]"Win32_Process"
$res = $wmi.Create("`"$exePath`"")
Write-Host "Launch return code: $($res.ReturnValue), ProcessId: $($res.ProcessId)"
