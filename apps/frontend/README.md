# Frontend (React + TypeScript)

Simple MVP UI for the virtual fitting mirror.

## Features
- Webcam preview
- Clothes picker sidebar
- Overlay rendering layer
- Capture button
- Status panel
- API integration with backend mock fitting endpoint

## Run
```bash
cd apps/frontend
npm install
npm run dev
```

Node.js 18 or newer is required. Vite 5 does not support Node 16.

The app calls `POST /api/fitting/mock` on `http://localhost:8000` by default.
Override with:

```bash
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```
