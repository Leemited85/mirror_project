import { useEffect, useState, type ChangeEvent } from 'react';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { MirrorView } from './components/MirrorView';
import { StatusPanel } from './components/StatusPanel';
import { requestTryOn } from './services/fittingApi';
import type { AppStatus, FittingResponse, Garment } from './types/fitting';
import { imageSourceToPngDataUrl, extractBase64 } from './utils/imageData';
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
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
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
      setResultImageUrl(null);
      return;
    }

    let cancelled = false;

    const runTryOn = async () => {
      setStatus({
        phase: 'fitting',
        message: `Tracking pose and running try-on for ${selectedGarment.name}...`,
        lastUpdatedAt: new Date().toISOString()
      });

      try {
        const modelDataUrl = await imageSourceToPngDataUrl(photoUrl);
        const garmentDataUrl = await imageSourceToPngDataUrl(selectedGarment.overlayUrl);

        const response = await requestTryOn({
          clothing_id: selectedGarment.id,
          model_image_base64: extractBase64(modelDataUrl),
          garment_image_base64: extractBase64(garmentDataUrl),
          frame_width: FIT_STAGE_WIDTH,
          frame_height: FIT_STAGE_HEIGHT,
          garment_width: selectedGarment.dimensions.width,
          garment_height: selectedGarment.dimensions.height
        });

        if (cancelled) {
          return;
        }

        setFitting(response.fitting);
        setResultImageUrl(response.result_image_base64 ? `data:image/png;base64,${response.result_image_base64}` : null);

        const warningText = response.warnings.length ? ` Warnings: ${response.warnings.join(' ')}` : '';
        setStatus({
          phase: response.status === 'ok' ? 'ready' : 'error',
          message: `${response.pose_engine} + ${response.vton_engine} completed.${warningText}`,
          lastUpdatedAt: new Date().toISOString()
        });
      } catch (caught) {
        if (cancelled) {
          return;
        }

        const message = caught instanceof Error ? caught.message : 'Try-on request failed.';
        setFitting(null);
        setResultImageUrl(null);
        setStatus({
          phase: 'error',
          message,
          lastUpdatedAt: new Date().toISOString()
        });
      }
    };

    void runTryOn();

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
    setResultImageUrl(null);
    setStatus({
      phase: 'processing',
      message: `${file.name} loaded. Preparing pose-guided try-on.`,
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
    setResultImageUrl(null);
    setStatus({
      phase: photoUrl ? 'processing' : 'idle',
      message: `${garment.name} selected.`,
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleCapture = () => {
    if (!resultImageUrl) {
      setStatus({
        phase: 'error',
        message: 'No composited result is available to save yet.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    const link = document.createElement('a');
    link.download = `mirror-fit-${Date.now()}.png`;
    link.href = resultImageUrl;
    link.click();

    setStatus({
      phase: 'ready',
      message: 'Composited fitting image saved locally.',
      lastUpdatedAt: new Date().toISOString()
    });
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Pose + VTON Pipeline</p>
          <h1>Virtual Fitting Mirror</h1>
          <p className="intro">Garments are processed into assets, then the backend runs pose estimation and VTON composition so the UI only needs to list garments and display try-on results.</p>
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
          <MirrorView
            photoUrl={photoUrl}
            garment={selectedGarment}
            fitting={fitting}
            resultImageUrl={resultImageUrl}
          />
          <CaptureButton onCapture={handleCapture} disabled={!resultImageUrl || status.phase === 'fitting'} />
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

export default App;
