$env:POSE_PROVIDER='mock'
$env:VTON_PROVIDER='idm-vton'
$env:IDM_VTON_BASE_URL='http://127.0.0.1:7860'
$env:IDM_VTON_API_NAME='/tryon'
Set-Location 'D:\porject\mirror_projects\apps\backend'
python -m uvicorn app.main:app --reload
