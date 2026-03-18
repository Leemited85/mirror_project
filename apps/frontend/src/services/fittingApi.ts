import type { TryOnRequest, TryOnResponse } from '../types/fitting';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export async function requestTryOn(payload: TryOnRequest): Promise<TryOnResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/try-on/mock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Failed to fetch';
    throw new Error(`${message}. Check that the backend server is running on ${API_BASE_URL} and that CORS is enabled.`);
  }

  if (!response.ok) {
    throw new Error(`Try-on API returned ${response.status}`);
  }

  return (await response.json()) as TryOnResponse;
}
