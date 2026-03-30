$python = "C:\Users\Pc\miniconda3\envs\idm\python.exe"
$workspace = "D:\porject\mirror_projects"

if (-not (Test-Path $python)) {
  throw "IDM-VTON python was not found at $python"
}

$env:IDM_VTON_REPO_ROOT = if ($env:IDM_VTON_REPO_ROOT) { $env:IDM_VTON_REPO_ROOT } else { "D:\IDM-VTON" }
$env:IDM_VTON_HOST = if ($env:IDM_VTON_HOST) { $env:IDM_VTON_HOST } else { "127.0.0.1" }
$env:IDM_VTON_PORT = if ($env:IDM_VTON_PORT) { $env:IDM_VTON_PORT } else { "7860" }
$env:IDM_VTON_ENABLE_CPU_OFFLOAD = if ($env:IDM_VTON_ENABLE_CPU_OFFLOAD) { $env:IDM_VTON_ENABLE_CPU_OFFLOAD } else { "true" }
$env:IDM_VTON_TARGET_WIDTH = if ($env:IDM_VTON_TARGET_WIDTH) { $env:IDM_VTON_TARGET_WIDTH } else { "576" }
$env:IDM_VTON_TARGET_HEIGHT = if ($env:IDM_VTON_TARGET_HEIGHT) { $env:IDM_VTON_TARGET_HEIGHT } else { "768" }

Set-Location $workspace
& $python "D:\porject\mirror_projects\scripts\idm_vton_local_server.py"
