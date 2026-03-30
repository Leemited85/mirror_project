$python = "python.exe"
$backendRoot = "D:\porject\mirror_projects\apps\backend"

$env:POSE_PROVIDER = if ($env:POSE_PROVIDER) { $env:POSE_PROVIDER } else { "mock" }
$env:VTON_PROVIDER = if ($env:VTON_PROVIDER) { $env:VTON_PROVIDER } else { "idm-vton" }
$env:IDM_VTON_ENDPOINT_URL = if ($env:IDM_VTON_ENDPOINT_URL) { $env:IDM_VTON_ENDPOINT_URL } else { "" }
$env:IDM_VTON_BASE_URL = if ($env:IDM_VTON_BASE_URL) { $env:IDM_VTON_BASE_URL } elseif (-not $env:IDM_VTON_ENDPOINT_URL) { "http://127.0.0.1:7860" } else { "" }
$env:IDM_VTON_API_NAME = if ($env:IDM_VTON_API_NAME) { $env:IDM_VTON_API_NAME } else { "/tryon" }
$env:IDM_VTON_TIMEOUT_SECONDS = if ($env:IDM_VTON_TIMEOUT_SECONDS) { $env:IDM_VTON_TIMEOUT_SECONDS } else { "1800" }

Set-Location $backendRoot
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
