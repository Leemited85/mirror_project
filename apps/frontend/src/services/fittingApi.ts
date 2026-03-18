import type { GarmentAsset, ModelAsset, PoseLandmarks, TryOnJob } from '../types/fitting';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Failed to fetch';
    throw new Error(`${message}. Check that the backend server is running on ${API_BASE_URL} and that CORS is enabled.`);
  }

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return (await response.json()) as T;
}

export function analyzeModel(payload: { name?: string; model_image_base64: string; frame_width: number; frame_height: number }) {
  return apiRequest<ModelAsset>('/api/models/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function processGarment(payload: { name?: string; category?: 'top' | 'bottom' | 'dress'; garment_image_base64: string }) {
  return apiRequest<GarmentAsset>('/api/garments/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function listGarments() {
  return apiRequest<{ items: GarmentAsset[] }>('/api/garments');
}

export function createTryOnJob(payload: { model_id: string; garment_id: string; manual_landmarks?: PoseLandmarks }) {
  return apiRequest<TryOnJob>('/api/try-on/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
