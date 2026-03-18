import { useEffect, useState, type ChangeEvent } from 'react';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { MirrorView } from './components/MirrorView';
import { StatusPanel } from './components/StatusPanel';
import type { AppStatus, Garment } from './types/fitting';
import { processGarmentImage } from './utils/garmentProcessing';

type SampleGarment = Garment & {
  brand: string;
  color: string;
  silhouette: string;
  notes: string;
  source: 'bundled' | 'uploaded';
};

const DEFAULT_GARMENTS: SampleGarment[] = [
  {
    id: 'hoodie-brown',
    name: 'Oversized Hoodie',
    brand: 'Sample Product',
    color: 'Brown',
    silhouette: 'Relaxed fit hoodie',
    notes: 'Real product-shot reference loaded from the provided AVIF asset.',
    thumbnailUrl: '/clothes/hoodie-brown.avif',
    overlayUrl: '/clothes/hoodie-brown.avif',
    source: 'bundled'
  }
];

function App() {
  const [garments, setGarments] = useState<SampleGarment[]>(DEFAULT_GARMENTS);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string>(DEFAULT_GARMENTS[0].id);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>('No photo selected');
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: 'Upload a portrait photo or add a garment image to start building the sample board.'
  });

  useEffect(() => {
    return () => {
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }
    };
  }, [photoUrl]);

  const selectedGarment = garments.find((garment) => garment.id === selectedGarmentId) ?? garments[0];

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

  const handleGarmentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setStatus({
      phase: 'processing',
      message: `Processing ${file.name} and removing its background...`,
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const processed = await processGarmentImage(file);
      const baseName = stripExtension(file.name);
      const nextGarment: SampleGarment = {
        id: `uploaded-${Date.now()}`,
        name: toDisplayName(baseName),
        brand: 'Uploaded Garment',
        color: 'Auto',
        silhouette: processed.height > processed.width ? 'Portrait product shot' : 'Wide product shot',
        notes: 'Background removed in-browser from the uploaded garment photo.',
        thumbnailUrl: processed.dataUrl,
        overlayUrl: processed.dataUrl,
        source: 'uploaded'
      };

      setGarments((current) => [nextGarment, ...current]);
      setSelectedGarmentId(nextGarment.id);
      setStatus({
        phase: 'ready',
        message: `${file.name} processed and added to the garment list.`,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Garment processing failed.';
      setStatus({
        phase: 'error',
        message,
        lastUpdatedAt: new Date().toISOString()
      });
    }
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
          <p className="intro">Upload a garment photo, remove the background in-browser, and reuse the processed cutout directly inside the sample board.</p>
        </div>
        <div className="header-actions">
          <label className="secondary-upload-button">
            <span>Add Garment</span>
            <input type="file" accept="image/*" onChange={handleGarmentUpload} />
          </label>
          <label className="upload-button">
            <span>Upload Photo</span>
            <input type="file" accept="image/*" onChange={handlePhotoChange} />
          </label>
        </div>
      </header>
      <div className="layout">
        <ClothesPicker
          garments={garments}
          selectedGarmentId={selectedGarmentId}
          onSelect={handleSelectGarment}
          isLoading={status.phase === 'processing'}
        />
        <div className="center-column">
          <section className="panel garment-summary">
            <span className="photo-label">Selected garment</span>
            <strong>{selectedGarment.name}</strong>
            <span className="garment-meta">{selectedGarment.brand} | {selectedGarment.color}</span>
            <span className="garment-badge">{selectedGarment.source === 'uploaded' ? 'Background removed' : 'Bundled sample'}</span>
            <p>{selectedGarment.notes}</p>
          </section>
          <div className="panel photo-meta">
            <span className="photo-label">Selected photo</span>
            <strong>{photoName}</strong>
          </div>
          <MirrorView photoUrl={photoUrl} garment={selectedGarment} />
          <CaptureButton onCapture={handleCapture} disabled={!photoUrl || status.phase === 'processing'} />
        </div>
        <StatusPanel status={status} />
      </div>
    </main>
  );
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, '');
}

function toDisplayName(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
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
