# Virtual Fitting Mirror MVP

## Backend (FastAPI)

### Features
- `GET /health`
- `GET /api/clothes`
- `POST /api/fitting/mock`
- `POST /api/capture`
- Static asset serving from `assets/clothes` via `/static/clothes/*`

### Run locally
1. Create and activate a Python virtual environment.
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn pydantic
   ```
3. From repository root, run:
   ```bash
   uvicorn app.main:app --reload --app-dir apps/backend
   ```
4. Open:
   - API docs: `http://127.0.0.1:8000/docs`
   - Health endpoint: `http://127.0.0.1:8000/health`

### Optional environment variables
- `APP_NAME` (default: `Virtual Fitting Mirror Backend`)
- `APP_VERSION` (default: `0.1.0`)
- `CLOTHES_DIR` (default: `assets/clothes`)
- `CAPTURES_DIR` (default: `apps/backend/data/captures`)
- `STATIC_CLOTHES_URL_PREFIX` (default: `/static/clothes`)

### Mock fitting engine
The API uses `MockFittingEngine` behind a `FittingEngine` interface in `app/services/fitting/`.
Replace this class with a real model-backed implementation later without changing endpoint contracts.
