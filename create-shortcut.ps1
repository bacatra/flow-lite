$w = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }

$exePath = Join-Path $baseDir "dist\win-unpacked\Flow Lite.exe"
if (-not (Test-Path $exePath)) {
    $exePath = Join-Path $baseDir "dist\Flow Lite 1.0.0.exe"
}

$s = $w.CreateShortcut("$desktop\Flow Lite.lnk")
$s.TargetPath = $exePath
$s.WorkingDirectory = Split-Path -Parent $exePath
$s.IconLocation = "$exePath,0"
$s.Description = "Flow Lite - Voice Typing"
$s.Save()
Write-Host "Atalho criado com sucesso na Area de Trabalho!"
