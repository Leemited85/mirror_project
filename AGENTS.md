# AGENTS.md

## Project purpose
This repository is an MVP for a virtual fitting mirror.
The system uses a camera feed and overlays virtual garments on the user in real time.

## Engineering rules
- Keep the architecture simple and modular.
- Prefer maintainability over cleverness.
- Do not introduce unnecessary dependencies.
- Backend: Python + FastAPI
- Frontend: React + TypeScript
- Use placeholders where real AI models are not yet integrated.
- Write code so real pose detection / segmentation / VTON can replace mock logic later.

## Folder intent
- apps/frontend: mirror UI
- apps/backend: API and fitting engine
- assets/clothes: garment image assets
- docs: technical notes
- scripts: utility scripts

## Coding style
- Keep functions small and readable.
- Add types where practical.
- Add comments only when they improve long-term clarity.
- Do not leave dead code.
- Do not silently ignore errors.

## MVP priority
1. local runnability
2. clear API boundaries
3. stable camera preview
4. garment overlay placeholder
5. capture and save
6. documentation

## Avoid
- premature microservices
- full authentication
- database complexity unless needed
- real deep learning integration in the first scaffold
