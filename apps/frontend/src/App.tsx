import { useEffect, useState, type ChangeEvent } from 'react';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { MirrorView } from './components/MirrorView';
import { StatusPanel } from './components/StatusPanel';
import { requestMockFitting } from './services/fittingApi';
import type { AppStatus, FittingResponse, Garment } from './types/fitting';
import { processGarmentImage } from './utils/garmentProcessing';

type SampleGarment = Garment & {
  brand: string;
  color: string;
  silhouette: string;
  notes: string;
  source: 'bundled' | 'uploaded';
  dimensions: {
    width: number;
    height: number;
  };
};

const DEFAULT_GARMENTS: SampleGarment[] = [
  {
    id: 'hoodie-brown',
    name: 'Oversized Hoodie',
    brand: 'Sample Product',
    color: 'Brown',
    silhouette: 'Relaxed fit hoodie',
    notes: 'Processed sample garment ready for body-tracked fitting.',
    thumbnailUrl: '/clothes/hoodie-brown.avif',
    overlayUrl: '/clothes/hoodie-brown.avif',
    source: 'bundled',
    dimensions: { width: 790, height: 1014 }
  }
];

const FIT_STAGE_WIDTH = 760;
const FIT_STAGE_HEIGHT = 920;

function App() {
  const [garments, setGarments] = useState<SampleGarment[]>(DEFAULT_GARMENTS);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string>(DEFAULT_GARMENTS[0].id);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>('No photo selected');
  const [fitting, setFitting] = useState<FittingResponse | null>(null);
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: 'Upload a model photo and select a processed garment to run fitting.'
  });

  useEffect(() => {
    return () => {
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }
    };
  }, [photoUrl]);

  const selectedGarment = garments.find((garment) => garment.id === selectedGarmentId) ?? garments[0];

  useEffect(() => {
    if (!photoUrl || !selectedGarment) {
      setFitting(null);
      return;
    }

    let cancelled = false;

    const runFitting = async () => {
      setStatus({
        phase: 'fitting',
        message: `Tracking body landmarks and fitting ${selectedGarment.name}...`,
        lastUpdatedAt: new Date().toISOString()
      });

      try {
        const result = await requestMockFitting({
          clothing_id: selectedGarment.id,
          frame_width: FIT_STAGE_WIDTH,
          frame_height: FIT_STAGE_HEIGHT,
          garment_width: selectedGarment.dimensions.width,
          garment_height: selectedGarment.dimensions.height
        });

        if (cancelled) {
          return;
        }

        setFitting(result);
        setStatus({
          phase: 'ready',
          message: `${selectedGarment.name} fitted on the detected body frame.`,
          lastUpdatedAt: new Date().toISOString()
        });
      } catch (caught) {
        if (cancelled) {
          return;
        }

        const message = caught instanceof Error ? caught.message : 'Fitting request failed.';
        setFitting(null);
        setStatus({
          phase: 'error',
          message,
          lastUpdatedAt: new Date().toISOString()
        });
      }
    };

    void runFitting();

    return () => {
      cancelled = true;
    };
  }, [photoUrl, selectedGarment]);

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
    setFitting(null);
    setStatus({
      phase: 'processing',
      message: `${file.name} loaded. Preparing body-tracked fitting.`,
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
      message: `Processing ${file.name} and preparing garment data...`,
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
        silhouette: processed.height > processed.width ? 'Portrait product shot' : 'Standard product shot',
        notes: 'Background removed and converted into fitting-ready garment data.',
        thumbnailUrl: processed.dataUrl,
        overlayUrl: processed.dataUrl,
        source: 'uploaded',
        dimensions: {
          width: processed.width,
          height: processed.height
        }
      };

      setGarments((current) => [nextGarment, ...current]);
      setSelectedGarmentId(nextGarment.id);
      setStatus({
        phase: 'ready',
        message: `${file.name} processed and registered in the garment list.`,
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
    setFitting(null);
    setStatus({
      phase: photoUrl ? 'processing' : 'idle',
      message: `${garment.name} selected.`,
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleCapture = () => {
    if (!photoUrl || !fitting) {
      setStatus({
        phase: 'error',
        message: 'Run fitting before saving the composited result.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    const modelImage = new Image();
    const garmentImage = new Image();

    modelImage.src = photoUrl;
    garmentImage.src = selectedGarment.overlayUrl;

    modelImage.onload = () => {
      garmentImage.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = FIT_STAGE_WIDTH;
        canvas.height = FIT_STAGE_HEIGHT;

        const context = canvas.getContext('2d');
        if (!context) {
          setStatus({
            phase: 'error',
            message: 'Save failed: no drawing context.',
            lastUpdatedAt: new Date().toISOString()
          });
          return;
        }

        drawCoverImage(context, modelImage, 0, 0, canvas.width, canvas.height);
        context.drawImage(
          garmentImage,
          fitting.overlay.x,
          fitting.overlay.y,
          fitting.overlay.width,
          fitting.overlay.height
        );

        const link = document.createElement('a');
        link.download = `mirror-fit-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        setStatus({
          phase: 'ready',
          message: 'Composited fitting image saved locally.',
          lastUpdatedAt: new Date().toISOString()
        });
      };
    };
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Body-Tracked Fitting</p>
          <h1>Virtual Fitting Mirror</h1>
          <p className="intro">Garments are processed once into fitting-ready assets, then the app asks the fitting engine for body landmarks and an overlay transform for each model photo.</p>
        </div>
        <div className="header-actions">
          <label className="secondary-upload-button">
            <span>Add Garment</span>
            <input type="file" accept="image/*" onChange={handleGarmentUpload} />
          </label>
          <label className="upload-button">
            <span>Upload Model</span>
            <input type="file" accept="image/*" onChange={handlePhotoChange} />
          </label>
        </div>
      </header>
      <div className="layout">
        <ClothesPicker
          garments={garments}
          selectedGarmentId={selectedGarmentId}
          onSelect={handleSelectGarment}
          isLoading={status.phase === 'processing' || status.phase === 'fitting'}
        />
        <div className="center-column">
          <section className="panel garment-summary">
            <span className="photo-label">Selected garment</span>
            <strong>{selectedGarment.name}</strong>
            <span className="garment-meta">{selectedGarment.brand} | {selectedGarment.color}</span>
            <span className="garment-badge">{selectedGarment.source === 'uploaded' ? 'Processed asset' : 'Bundled sample'}</span>
            <p>{selectedGarment.notes}</p>
          </section>
          <div className="panel photo-meta">
            <span className="photo-label">Model photo</span>
            <strong>{photoName}</strong>
          </div>
          <MirrorView photoUrl={photoUrl} garment={selectedGarment} fitting={fitting} />
          <CaptureButton onCapture={handleCapture} disabled={!photoUrl || !fitting || status.phase === 'fitting'} />
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

export default App;
