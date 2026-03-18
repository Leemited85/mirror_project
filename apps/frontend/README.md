# Frontend (React + TypeScript)

Simple MVP UI for the virtual fitting mirror.

## Features
- Garment registration with in-browser background removal
- Garment list for fitting-ready assets
- Model photo upload
- Backend try-on API integration
- Result image save
- Status panel

## Run
```bash
cd apps/frontend
npm install
npm run dev
```

Node.js 18 or newer is required. Vite 5 does not support Node 16.

The app calls `POST /api/try-on/mock` on `http://localhost:8000` by default.
Override with:

```bash
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```
