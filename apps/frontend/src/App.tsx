import { useMemo, useState } from 'react';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { MirrorView } from './components/MirrorView';
import { StatusPanel } from './components/StatusPanel';
import { useFitting } from './hooks/useFitting';
import { useWebcam } from './hooks/useWebcam';
import type { Garment } from './types/fitting';

const GARMENTS: Garment[] = [
  {
    id: 'tshirt',
    name: 'Classic Tee',
    thumbnailUrl: '/clothes/tshirt.svg',
    overlayUrl: '/clothes/tshirt.svg'
  },
  {
    id: 'jacket',
    name: 'Soft Jacket',
    thumbnailUrl: '/clothes/jacket.svg',
    overlayUrl: '/clothes/jacket.svg'
  },
  {
    id: 'hoodie',
    name: 'Urban Hoodie',
    thumbnailUrl: '/clothes/hoodie.svg',
    overlayUrl: '/clothes/hoodie.svg'
  }
];

function App() {
  const { videoRef, isReady, error: webcamError } = useWebcam();
  const { overlayUrl, status, setStatus, applyGarment } = useFitting();
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);

  const isLoading = status.phase === 'fitting';

  const activeStatus = useMemo(() => {
    if (webcamError) {
      return { phase: 'error', message: webcamError, lastUpdatedAt: new Date().toISOString() } as const;
    }
    if (status.phase === 'idle' && isReady) {
      return { phase: 'camera-ready', message: 'Camera ready. Pick clothes to fit.', lastUpdatedAt: new Date().toISOString() } as const;
    }
    return status;
  }, [isReady, status, webcamError]);

  const handleSelectGarment = async (garment: Garment) => {
    setSelectedGarmentId(garment.id);
    await applyGarment(garment);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) {
      setStatus({ phase: 'error', message: 'Cannot capture before camera is ready.' });
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (!canvas.width || !canvas.height) {
      setStatus({ phase: 'error', message: 'Cannot capture an empty frame.' });
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      setStatus({ phase: 'error', message: 'Capture failed: no drawing context.' });
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (overlayUrl) {
      const overlay = new Image();
      overlay.src = overlayUrl;
      overlay.onload = () => {
        context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
        downloadCapture(canvas);
      };
      overlay.onerror = () => {
        setStatus({ phase: 'error', message: 'Capture failed while loading overlay.', lastUpdatedAt: new Date().toISOString() });
      };
      return;
    }

    downloadCapture(canvas);
  };

  const downloadCapture = (canvas: HTMLCanvasElement) => {
    const link = document.createElement('a');
    link.download = `mirror-capture-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setStatus({ phase: 'ready', message: 'Capture saved locally.', lastUpdatedAt: new Date().toISOString() });
  };

  return (
    <main className="app">
      <header>
        <h1>Virtual Fitting Mirror</h1>
      </header>
      <div className="layout">
        <ClothesPicker
          garments={GARMENTS}
          selectedGarmentId={selectedGarmentId}
          onSelect={(garment) => {
            void handleSelectGarment(garment);
          }}
          isLoading={isLoading}
        />
        <div className="center-column">
          <MirrorView videoRef={videoRef} overlayUrl={overlayUrl} />
          <CaptureButton onCapture={handleCapture} disabled={!isReady || !!webcamError} />
        </div>
        <StatusPanel status={activeStatus} />
      </div>
    </main>
  );
}

export default App;
