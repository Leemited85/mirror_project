# Local development

## Backend

1. Create a Python virtual environment.
2. Install dependencies:

   ```bash
   pip install -r apps/backend/requirements.txt
   ```

3. Start the API server:

   ```bash
   uvicorn apps.backend.main:app --reload
   ```

4. Open the API docs at <http://127.0.0.1:8000/docs>.

## Placeholder garment assets

Put garment images in `assets/clothes` using the file name format:

- `shirt_blue.png`
- `jacket_black.png`

The backend uses the file name stem as the garment ID.
