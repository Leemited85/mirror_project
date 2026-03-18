import type { GarmentAsset, ModelAsset, PoseLandmarks, ProviderStatus, TryOnJob } from '../types/fitting';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const API_ORIGIN = new URL(API_BASE_URL).origin;

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

  return normalizeAssetUrls((await response.json()) as T);
}

function resolveAssetUrl(value: string | null | undefined) {
  if (!value) {
    return value ?? null;
  }

  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${API_ORIGIN}${value}`;
  }

  return value;
}

function normalizeAssetUrls<T>(payload: T): T {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeAssetUrls(item)) as T;
  }

  const next = { ...(payload as Record<string, unknown>) };
  for (const key of Object.keys(next)) {
    const value = next[key];
    if (typeof value === 'string' && key.endsWith('_url')) {
      next[key] = resolveAssetUrl(value);
      continue;
    }

    if (value && typeof value === 'object') {
      next[key] = normalizeAssetUrls(value);
    }
  }

  return next as T;
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

export function getProviderStatus() {
  return apiRequest<ProviderStatus>('/api/system/providers');
}
