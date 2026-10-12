$w = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$s = $w.CreateShortcut("$desktop\Flow Lite.lnk")
$s.TargetPath = "C:\Users\Caio\Desktop\REA\flow-lite\dist\win-unpacked\Flow Lite.exe"
$s.WorkingDirectory = "C:\Users\Caio\Desktop\REA\flow-lite\dist\win-unpacked"
$s.IconLocation = "C:\Users\Caio\Desktop\REA\flow-lite\dist\win-unpacked\Flow Lite.exe,0"
$s.Description = "Flow Lite - Voice Typing"
$s.Save()
Write-Host "Atalho criado com sucesso na Area de Trabalho!"
