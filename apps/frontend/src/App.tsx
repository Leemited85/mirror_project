import { useEffect, useState, type ChangeEvent } from 'react';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { MirrorView } from './components/MirrorView';
import { StatusPanel } from './components/StatusPanel';
import type { AppStatus, Garment } from './types/fitting';

type SampleGarment = Garment & {
  brand: string;
  color: string;
  silhouette: string;
  notes: string;
};

const GARMENTS: SampleGarment[] = [
  {
    id: 'hoodie-brown',
    name: 'Oversized Hoodie',
    brand: 'Sample Product',
    color: 'Brown',
    silhouette: 'Relaxed fit hoodie',
    notes: 'Real product-shot reference loaded from the provided AVIF asset.',
    thumbnailUrl: '/clothes/hoodie-brown.avif',
    overlayUrl: '/clothes/hoodie-brown.avif'
  }
];

function App() {
  const [selectedGarmentId, setSelectedGarmentId] = useState<string>(GARMENTS[0].id);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>('No photo selected');
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: 'Upload a portrait photo to compare it with the real garment product shot.'
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
      message: `${file.name} loaded. You can now compare it against the garment product image.`,
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
        message: 'Upload a photo before saving the sample board.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    const modelImage = new Image();
    const garmentImage = new Image();

    modelImage.src = photoUrl;
    garmentImage.src = selectedGarment.thumbnailUrl;

    modelImage.onload = () => {
      garmentImage.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1600;
        canvas.height = 1000;

        const context = canvas.getContext('2d');
        if (!context) {
          setStatus({
            phase: 'error',
            message: 'Save failed: no drawing context.',
            lastUpdatedAt: new Date().toISOString()
          });
          return;
        }

        context.fillStyle = '#f3efe8';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = '#ffffff';
        roundRect(context, 70, 120, 690, 760, 30);
        context.fill();

        context.fillStyle = '#fffdf9';
        roundRect(context, 840, 120, 690, 760, 30);
        context.fill();

        drawCoverImage(context, modelImage, 95, 145, 640, 710);
        drawContainImage(context, garmentImage, 875, 145, 620, 710);

        context.fillStyle = '#8c6b4f';
        context.font = '600 28px Segoe UI';
        context.fillText('Uploaded Photo', 95, 90);
        context.fillText('Garment Product Shot', 875, 90);

        context.fillStyle = '#1d2a39';
        context.font = '700 34px Segoe UI';
        context.fillText(selectedGarment.name, 875, 905);

        context.fillStyle = '#5d6b7a';
        context.font = '500 24px Segoe UI';
        context.fillText(`${selectedGarment.brand} | ${selectedGarment.color} | ${selectedGarment.silhouette}`, 875, 945);

        const link = document.createElement('a');
        link.download = `mirror-sample-board-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        setStatus({
          phase: 'ready',
          message: 'Sample board saved locally.',
          lastUpdatedAt: new Date().toISOString()
        });
      };

      garmentImage.onerror = () => {
        setStatus({
          phase: 'error',
          message: 'Failed to load the garment image.',
          lastUpdatedAt: new Date().toISOString()
        });
      };
    };

    modelImage.onerror = () => {
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
          <p className="eyebrow">Product Shot Sample</p>
          <h1>Virtual Fitting Mirror</h1>
          <p className="intro">Use a real garment product image for a cleaner web sample, then compare it side-by-side with the uploaded person photo.</p>
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
          <section className="panel garment-summary">
            <span className="photo-label">Selected garment</span>
            <strong>{selectedGarment.name}</strong>
            <span className="garment-meta">{selectedGarment.brand} | {selectedGarment.color}</span>
            <p>{selectedGarment.notes}</p>
          </section>
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

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;

  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawContainImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;

  let drawWidth = width;
  let drawHeight = height;

  if (sourceRatio > targetRatio) {
    drawHeight = width / sourceRatio;
  } else {
    drawWidth = height * sourceRatio;
  }

  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

export default App;
