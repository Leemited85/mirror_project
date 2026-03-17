import { useEffect, useState, type ChangeEvent } from 'react';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { MirrorView } from './components/MirrorView';
import { StatusPanel } from './components/StatusPanel';
import type { AppStatus, Garment } from './types/fitting';

type OverlayPlacement = {
  top: number;
  left: number;
  width: number;
  opacity?: number;
};

type SampleGarment = Garment & {
  placement: OverlayPlacement;
};

const GARMENTS: SampleGarment[] = [
  {
    id: 'tshirt',
    name: 'Classic Tee',
    thumbnailUrl: '/clothes/tshirt.svg',
    overlayUrl: '/clothes/tshirt.svg',
    placement: { top: 24, left: 26, width: 48, opacity: 0.9 }
  },
  {
    id: 'jacket',
    name: 'Soft Jacket',
    thumbnailUrl: '/clothes/jacket.svg',
    overlayUrl: '/clothes/jacket.svg',
    placement: { top: 20, left: 22, width: 56, opacity: 0.92 }
  },
  {
    id: 'hoodie',
    name: 'Urban Hoodie',
    thumbnailUrl: '/clothes/hoodie.svg',
    overlayUrl: '/clothes/hoodie.svg',
    placement: { top: 18, left: 21, width: 58, opacity: 0.9 }
  }
];

function App() {
  const [selectedGarmentId, setSelectedGarmentId] = useState<string>(GARMENTS[0].id);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>('No photo selected');
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: 'Upload a portrait photo and choose a garment.'
  });

  useEffect(() => {
    return () => {
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }
    };
  }, [photoUrl]);

  const selectedGarment = GARMENTS.find((garment) => garment.id === selectedGarmentId) ?? GARMENTS[0];

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
    }

    const nextPhotoUrl = URL.createObjectURL(file);
    setPhotoUrl(nextPhotoUrl);
    setPhotoName(file.name);
    setStatus({
      phase: 'ready',
      message: `${file.name} loaded. You can preview and save the sample view.`,
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleSelectGarment = (garment: Garment) => {
    setSelectedGarmentId(garment.id);
    setStatus({
      phase: photoUrl ? 'ready' : 'idle',
      message: `${garment.name} selected.`,
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleCapture = () => {
    if (!photoUrl) {
      setStatus({
        phase: 'error',
        message: 'Upload a photo before saving the sample view.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    const baseImage = new Image();
    const overlayImage = new Image();

    baseImage.src = photoUrl;
    overlayImage.src = selectedGarment.overlayUrl;

    baseImage.onload = () => {
      overlayImage.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = baseImage.naturalWidth;
        canvas.height = baseImage.naturalHeight;

        const context = canvas.getContext('2d');
        if (!context) {
          setStatus({
            phase: 'error',
            message: 'Save failed: no drawing context.',
            lastUpdatedAt: new Date().toISOString()
          });
          return;
        }

        context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

        const placement = selectedGarment.placement;
        const overlayWidth = (canvas.width * placement.width) / 100;
        const overlayX = (canvas.width * placement.left) / 100;
        const overlayY = (canvas.height * placement.top) / 100;
        const overlayHeight = (overlayWidth / overlayImage.naturalWidth) * overlayImage.naturalHeight;

        context.globalAlpha = placement.opacity ?? 0.9;
        context.drawImage(overlayImage, overlayX, overlayY, overlayWidth, overlayHeight);
        context.globalAlpha = 1;

        const link = document.createElement('a');
        link.download = `mirror-sample-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        setStatus({
          phase: 'ready',
          message: 'Sample view saved locally.',
          lastUpdatedAt: new Date().toISOString()
        });
      };

      overlayImage.onerror = () => {
        setStatus({
          phase: 'error',
          message: 'Failed to load garment overlay.',
          lastUpdatedAt: new Date().toISOString()
        });
      };
    };

    baseImage.onerror = () => {
      setStatus({
        phase: 'error',
        message: 'Failed to load the selected photo.',
        lastUpdatedAt: new Date().toISOString()
      });
    };
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Web Sample View</p>
          <h1>Virtual Fitting Mirror</h1>
          <p className="intro">Preview a fitting sample in the browser with an uploaded photo and static garment SVG data.</p>
        </div>
        <label className="upload-button">
          <span>Upload Photo</span>
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        </label>
      </header>
      <div className="layout">
        <ClothesPicker
          garments={GARMENTS}
          selectedGarmentId={selectedGarmentId}
          onSelect={handleSelectGarment}
          isLoading={false}
        />
        <div className="center-column">
          <div className="panel photo-meta">
            <span className="photo-label">Selected photo</span>
            <strong>{photoName}</strong>
          </div>
          <MirrorView photoUrl={photoUrl} garment={selectedGarment} />
          <CaptureButton onCapture={handleCapture} disabled={!photoUrl} />
        </div>
        <StatusPanel status={status} />
      </div>
    </main>
  );
}

export default App;
