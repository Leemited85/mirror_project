import { useCallback, useState } from 'react';
import { requestMockFitting } from '../services/fittingApi';
import type { AppStatus, Garment } from '../types/fitting';

export function useFitting() {
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: 'Waiting for camera'
  });

  const applyGarment = useCallback(async (garment: Garment) => {
    setStatus({ phase: 'fitting', message: `Fitting ${garment.name}...` });
    try {
      const result = await requestMockFitting({ garmentId: garment.id });
      if (result.status !== 'ok') {
        throw new Error(result.message);
      }

      setOverlayUrl(result.overlayUrl);
      setStatus({
        phase: 'ready',
        message: result.message,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to apply garment.';
      setStatus({ phase: 'error', message, lastUpdatedAt: new Date().toISOString() });
    }
  }, []);

  return { overlayUrl, status, setStatus, applyGarment };
}
