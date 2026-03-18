import { useEffect, useState, type ChangeEvent } from 'react';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { MirrorView } from './components/MirrorView';
import { StatusPanel } from './components/StatusPanel';
import { requestModelAnalysis, requestTryOn } from './services/fittingApi';
import type { AppStatus, FittingResponse, Garment, PoseLandmarks, PosePoint } from './types/fitting';
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
  const [manualMode, setManualMode] = useState(false);
  const [modelLandmarks, setModelLandmarks] = useState<PoseLandmarks | null>(null);
  const [manualLandmarks, setManualLandmarks] = useState<PoseLandmarks | null>(null);
  const [selectedLandmarkKey, setSelectedLandmarkKey] = useState<keyof PoseLandmarks | null>(null);
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
    if (!photoUrl || !selectedGarment || !modelLandmarks || manualMode) {
      if (!photoUrl) {
        setFitting(null);
        setResultImageUrl(null);
      }
      return;
    }

    void runTryOn();
  }, [photoUrl, selectedGarment, modelLandmarks, manualMode]);

  const runTryOn = async (overrideLandmarks?: PoseLandmarks) => {
    if (!photoUrl || !selectedGarment) {
      return;
    }

    setStatus({
      phase: 'fitting',
      message: overrideLandmarks
        ? `Applying manual fit points for ${selectedGarment.name}...`
        : `Tracking pose and running try-on for ${selectedGarment.name}...`,
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
        garment_height: selectedGarment.dimensions.height,
        manual_landmarks: overrideLandmarks
      });

      setFitting(response.fitting);
      setManualLandmarks(response.fitting.landmarks);
      setResultImageUrl(response.result_image_base64 ? `data:image/png;base64,${response.result_image_base64}` : null);

      const warningText = response.warnings.length ? ` Warnings: ${response.warnings.join(' ')}` : '';
      setStatus({
        phase: response.status === 'ok' ? 'ready' : 'error',
        message: `${response.pose_engine} + ${response.vton_engine} completed.${warningText}`,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
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
    setManualMode(false);
    setModelLandmarks(null);
    setManualLandmarks(null);
    setSelectedLandmarkKey('neck');
    setStatus({
      phase: 'processing',
      message: `${file.name} loaded. Analyzing model fitting points...`,
      lastUpdatedAt: new Date().toISOString()
    });

    void analyzeModel(nextPhotoUrl);
  };

  const analyzeModel = async (modelUrl: string) => {
    try {
      const modelDataUrl = await imageSourceToPngDataUrl(modelUrl);
      const response = await requestModelAnalysis({
        model_image_base64: extractBase64(modelDataUrl),
        frame_width: FIT_STAGE_WIDTH,
        frame_height: FIT_STAGE_HEIGHT
      });

      setModelLandmarks(response.landmarks);
      setManualLandmarks(response.landmarks);
      setStatus({
        phase: 'ready',
        message: `Model fitting points analyzed with ${response.pose_engine}. Select a garment to continue.`,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Model analysis failed.';
      setStatus({
        phase: 'error',
        message,
        lastUpdatedAt: new Date().toISOString()
      });
    }
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
        message: `${file.name} processed and registered in the garment list. Select it to match with the analyzed model.`,
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

  const handleManualToggle = () => {
    const nextManualMode = !manualMode;
    setManualMode(nextManualMode);

    if (nextManualMode) {
      setResultImageUrl(null);
      setManualLandmarks(fitting?.landmarks ?? manualLandmarks ?? modelLandmarks ?? createDefaultLandmarks());
      setSelectedLandmarkKey('neck');
      setStatus({
        phase: 'processing',
        message: 'Manual fit point editing enabled. Drag neck, shoulders, and hips, then apply.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    setStatus({
      phase: photoUrl ? 'processing' : 'idle',
      message: 'Manual fit point editing disabled.',
      lastUpdatedAt: new Date().toISOString()
    });
    setSelectedLandmarkKey(null);
  };

  const handleApplyManualPoints = () => {
    if (!manualLandmarks) {
      setStatus({
        phase: 'error',
        message: 'No manual fit points are available yet.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    void runTryOn(manualLandmarks);
  };

  const handleLandmarkChange = (key: keyof PoseLandmarks, point: PosePoint) => {
    setManualLandmarks((current) => ({
      ...(current ?? createDefaultLandmarks()),
      [key]: point
    }));
    setSelectedLandmarkKey(key);
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Pose + VTON Pipeline</p>
          <h1>Virtual Fitting Mirror</h1>
          <p className="intro">1. Upload a model. 2. Analyze fitting points. 3. Select or register a garment. 4. Preview the matched fitting. 5. Save the final composited image.</p>
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
          <div className="panel manual-controls">
            <strong>Fit Points</strong>
            <p>After model analysis, use manual editing when the detected fitting points do not match the person correctly.</p>
            <div className="manual-action-row">
              <button type="button" className="secondary-action-button" onClick={handleManualToggle} disabled={!photoUrl}>
                {manualMode ? 'Exit Manual Edit' : 'Edit Fit Points'}
              </button>
              <button
                type="button"
                className="secondary-action-button"
                onClick={handleApplyManualPoints}
                disabled={!photoUrl || !manualMode || !manualLandmarks}
              >
                Apply Points
              </button>
            </div>
          </div>
          <MirrorView
            photoUrl={photoUrl}
            garment={selectedGarment}
            fitting={fitting}
            resultImageUrl={resultImageUrl}
            manualMode={manualMode}
            manualLandmarks={manualLandmarks}
            selectedLandmarkKey={selectedLandmarkKey}
            onLandmarkChange={handleLandmarkChange}
            onLandmarkSelect={setSelectedLandmarkKey}
          />
          <CaptureButton onCapture={handleCapture} disabled={!resultImageUrl || status.phase === 'fitting'} />
        </div>
        <StatusPanel status={status} />
      </div>
    </main>
  );
}

function createDefaultLandmarks(): PoseLandmarks {
  return {
    neck: { x: Math.round(FIT_STAGE_WIDTH * 0.5), y: Math.round(FIT_STAGE_HEIGHT * 0.18) },
    left_shoulder: { x: Math.round(FIT_STAGE_WIDTH * 0.34), y: Math.round(FIT_STAGE_HEIGHT * 0.24) },
    right_shoulder: { x: Math.round(FIT_STAGE_WIDTH * 0.66), y: Math.round(FIT_STAGE_HEIGHT * 0.24) },
    left_hip: { x: Math.round(FIT_STAGE_WIDTH * 0.4), y: Math.round(FIT_STAGE_HEIGHT * 0.62) },
    right_hip: { x: Math.round(FIT_STAGE_WIDTH * 0.6), y: Math.round(FIT_STAGE_HEIGHT * 0.62) }
  };
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
