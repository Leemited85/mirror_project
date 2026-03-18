import { useEffect, useState, type ChangeEvent } from 'react';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { MirrorView } from './components/MirrorView';
import { StatusPanel } from './components/StatusPanel';
import { analyzeModel, createTryOnJob, listGarments, processGarment } from './services/fittingApi';
import type { AppStatus, GarmentAsset, ModelAsset, PoseLandmarks, PosePoint, TryOnJob } from './types/fitting';
import { imageSourceToPngDataUrl, extractBase64 } from './utils/imageData';

const FIT_STAGE_WIDTH = 760;
const FIT_STAGE_HEIGHT = 920;

function App() {
  const [modelAsset, setModelAsset] = useState<ModelAsset | null>(null);
  const [garments, setGarments] = useState<GarmentAsset[]>([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
  const [tryOnJob, setTryOnJob] = useState<TryOnJob | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualLandmarks, setManualLandmarks] = useState<PoseLandmarks | null>(null);
  const [selectedLandmarkKey, setSelectedLandmarkKey] = useState<keyof PoseLandmarks | null>(null);
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: 'Upload a model image to start the VTON workflow.'
  });

  const selectedGarment = garments.find((garment) => garment.id === selectedGarmentId) ?? null;

  useEffect(() => {
    void refreshGarments();
  }, []);

  useEffect(() => {
    if (!modelAsset || !selectedGarment || manualMode) {
      return;
    }

    void runPreview();
  }, [modelAsset, selectedGarment, manualMode]);

  const refreshGarments = async () => {
    try {
      const response = await listGarments();
      setGarments(response.items);
      if (!selectedGarmentId && response.items.length > 0) {
        setSelectedGarmentId(response.items[0].id);
      }
    } catch {
      // Defer user-facing errors until an explicit action needs the backend.
    }
  };

  const handleModelUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setStatus({
      phase: 'processing',
      message: `${file.name} uploaded. Running model analysis...`,
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const dataUrl = await imageSourceToPngDataUrl(URL.createObjectURL(file));
      const asset = await analyzeModel({
        name: stripExtension(file.name),
        model_image_base64: extractBase64(dataUrl),
        frame_width: FIT_STAGE_WIDTH,
        frame_height: FIT_STAGE_HEIGHT
      });

      setModelAsset(asset);
      setManualLandmarks(asset.landmarks);
      setSelectedLandmarkKey('neck');
      setTryOnJob(null);
      setManualMode(false);
      setStatus({
        phase: 'ready',
        message: `Model analyzed with ${asset.pose_engine}. Choose a garment to preview the try-on.`,
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
      message: `${file.name} uploaded. Processing garment asset...`,
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const dataUrl = await imageSourceToPngDataUrl(URL.createObjectURL(file));
      const asset = await processGarment({
        name: stripExtension(file.name),
        category: 'top',
        garment_image_base64: extractBase64(dataUrl)
      });

      setGarments((current) => [asset, ...current]);
      setSelectedGarmentId(asset.id);
      setStatus({
        phase: 'ready',
        message: `${asset.name} processed and added to the garment library.`,
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

  const runPreview = async (overrideLandmarks?: PoseLandmarks) => {
    if (!modelAsset || !selectedGarment) {
      return;
    }

    setStatus({
      phase: 'fitting',
      message: overrideLandmarks
        ? `Applying manual landmarks to ${selectedGarment.name}...`
        : `Running try-on preview with ${selectedGarment.name}...`,
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const job = await createTryOnJob({
        model_id: modelAsset.id,
        garment_id: selectedGarment.id,
        manual_landmarks: overrideLandmarks
      });
      setTryOnJob(job);
      setStatus({
        phase: job.status === 'succeeded' ? 'ready' : 'error',
        message: `${job.pose_engine} + ${job.vton_engine} ${job.status}. ${job.warnings.join(' ')}`.trim(),
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Try-on preview failed.';
      setStatus({
        phase: 'error',
        message,
        lastUpdatedAt: new Date().toISOString()
      });
    }
  };

  const handleGarmentSelect = (garment: GarmentAsset) => {
    setSelectedGarmentId(garment.id);
    setTryOnJob(null);
    setStatus({
      phase: modelAsset ? 'processing' : 'idle',
      message: `${garment.name} selected.`,
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleManualToggle = () => {
    const next = !manualMode;
    setManualMode(next);
    setTryOnJob(null);
    setManualLandmarks(modelAsset?.landmarks ?? null);
    setSelectedLandmarkKey('neck');
    setStatus({
      phase: next ? 'processing' : 'ready',
      message: next
        ? 'Manual landmark editing enabled. Select a point and click the image to reposition it.'
        : 'Manual landmark editing disabled.',
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleApplyManualPoints = () => {
    if (!manualLandmarks) {
      return;
    }
    void runPreview(manualLandmarks);
  };

  const handleLandmarkChange = (key: keyof PoseLandmarks, point: PosePoint) => {
    setManualLandmarks((current) => ({
      ...(current ?? createDefaultLandmarks()),
      [key]: point
    }));
    setSelectedLandmarkKey(key);
  };

  const handleCapture = () => {
    if (!tryOnJob?.result_image_url) {
      setStatus({
        phase: 'error',
        message: 'No final composited image is available yet.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    const link = document.createElement('a');
    link.download = `${tryOnJob.id}.png`;
    link.href = tryOnJob.result_image_url;
    link.click();
    setStatus({
      phase: 'ready',
      message: 'Final composited image saved locally.',
      lastUpdatedAt: new Date().toISOString()
    });
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">VTON Workspace</p>
          <h1>Virtual Fitting Mirror</h1>
          <p className="intro">1. Analyze a model. 2. Build a reusable garment library. 3. Run a try-on job. 4. Preview the result. 5. Save the final image.</p>
        </div>
        <div className="header-actions">
          <label className="upload-button">
            <span>Upload Model</span>
            <input type="file" accept="image/*" onChange={handleModelUpload} />
          </label>
          <label className="secondary-upload-button">
            <span>Add Garment</span>
            <input type="file" accept="image/*" onChange={handleGarmentUpload} />
          </label>
        </div>
      </header>

      <div className="layout">
        <ClothesPicker
          garments={garments}
          selectedGarmentId={selectedGarmentId}
          onSelect={handleGarmentSelect}
          isLoading={status.phase === 'processing' || status.phase === 'fitting'}
        />

        <div className="center-column">
          <section className="panel garment-summary">
            <span className="photo-label">Step 1</span>
            <strong>{modelAsset ? modelAsset.name : 'Model analysis pending'}</strong>
            <span className="garment-meta">
              {modelAsset
                ? `${modelAsset.pose_engine} | confidence ${Math.round(modelAsset.confidence * 100)}%`
                : 'Upload a model image to extract fitting landmarks'}
            </span>
          </section>

          <section className="panel garment-summary">
            <span className="photo-label">Step 2</span>
            <strong>{selectedGarment ? selectedGarment.name : 'Garment selection pending'}</strong>
            <span className="garment-meta">
              {selectedGarment
                ? `${selectedGarment.category} | ${selectedGarment.width} x ${selectedGarment.height}`
                : 'Upload or choose a processed garment asset'}
            </span>
          </section>

          <section className="panel manual-controls">
            <strong>Step 3: Preview Controls</strong>
            <p>Use manual fit points only when the analyzed model landmarks do not align with the body correctly.</p>
            <div className="manual-action-row">
              <button type="button" className="secondary-action-button" onClick={handleManualToggle} disabled={!modelAsset}>
                {manualMode ? 'Exit Manual Edit' : 'Edit Fit Points'}
              </button>
              <button
                type="button"
                className="secondary-action-button"
                onClick={handleApplyManualPoints}
                disabled={!manualMode || !manualLandmarks || !selectedGarment || !modelAsset}
              >
                Apply Points
              </button>
            </div>
          </section>

          <MirrorView
            model={modelAsset}
            garment={selectedGarment}
            job={tryOnJob}
            manualMode={manualMode}
            manualLandmarks={manualLandmarks}
            selectedLandmarkKey={selectedLandmarkKey}
            onLandmarkChange={handleLandmarkChange}
            onLandmarkSelect={setSelectedLandmarkKey}
          />

          <CaptureButton onCapture={handleCapture} disabled={!tryOnJob?.result_image_url} label="Save Final Image" />
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

export default App;
