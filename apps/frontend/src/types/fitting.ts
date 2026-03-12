export type Garment = {
  id: string;
  name: string;
  thumbnailUrl: string;
  overlayUrl: string;
};

export type FittingRequest = {
  garmentId: string;
};

export type FittingResponse = {
  status: 'ok' | 'error';
  overlayUrl: string;
  message: string;
  processingMs?: number;
};

export type AppStatus = {
  phase: 'idle' | 'camera-ready' | 'fitting' | 'ready' | 'error';
  message: string;
  lastUpdatedAt?: string;
};
