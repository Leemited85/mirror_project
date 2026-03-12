import type { FittingRequest, FittingResponse } from '../types/fitting';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export async function requestMockFitting(payload: FittingRequest): Promise<FittingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/fitting/mock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Mock fitting API returned ${response.status}`);
  }

  return (await response.json()) as FittingResponse;
}
