$comfyRoot = 'D:\ComfyUI_windows_portable'
$pythonExe = Join-Path $comfyRoot 'python_embeded\python.exe'
$workingDir = Join-Path $comfyRoot 'ComfyUI'

if (-not (Test-Path $pythonExe)) {
  Write-Error "ComfyUI python runtime was not found at $pythonExe"
  exit 1
}

if (-not (Test-Path $workingDir)) {
  Write-Error "ComfyUI working directory was not found at $workingDir"
  exit 1
}

Set-Location $workingDir
& $pythonExe main.py --cpu --windows-standalone-build --listen 127.0.0.1 --port 8188
