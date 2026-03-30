import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CameraPreview, type CameraPreviewHandle } from './components/CameraPreview';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { OpenNICameraPanel } from './components/OpenNICameraPanel';
import { StatusPanel } from './components/StatusPanel';
import {
  analyzeModel,
  captureResult,
  createTryOnJob,
  getProviderStatus,
  getOpenNiCameraPreview,
  getOpenNiCameraStatus,
  listGarments,
  processGarment,
  reconnectOpenNiCamera
} from './services/fittingApi';
import type {
  AppStatus,
  CaptureResponse,
  GarmentAsset,
  OpenNICameraPreview,
  OpenNICameraStatus,
  ProviderStatus,
  TryOnJob
} from './types/fitting';
import { extractBase64, imageSourceToPngDataUrl } from './utils/imageData';

function App() {
  const cameraPreviewRef = useRef<CameraPreviewHandle | null>(null);
  const [garments, setGarments] = useState<GarmentAsset[]>([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [cameraLabel, setCameraLabel] = useState<string | null>(null);
  const [orbbecMatched, setOrbbecMatched] = useState(false);
  const [openniStatus, setOpenniStatus] = useState<OpenNICameraStatus | null>(null);
  const [openniPreview, setOpenniPreview] = useState<OpenNICameraPreview | null>(null);
  const [lastTryOnJob, setLastTryOnJob] = useState<TryOnJob | null>(null);
  const [lastCapture, setLastCapture] = useState<CaptureResponse | null>(null);
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: 'Checking system readiness.'
  });

  const selectedGarment = garments.find((garment) => garment.id === selectedGarmentId) ?? null;
  const isProcessingGarment = status.phase === 'processing';
  const isRendering = status.phase === 'fitting';
  const isSaving = status.phase === 'capturing';
  const isBusy = isProcessingGarment || isRendering || isSaving;

  useEffect(() => {
    void refreshGarments();
    void refreshProviderStatus();
    void refreshOpenNiStatus();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshOpenNiStatus();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!openniStatus?.connected) {
      setOpenniPreview(null);
      return;
    }

    void refreshOpenNiPreview();
    const intervalId = window.setInterval(() => {
      void refreshOpenNiPreview();
    }, 1500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [openniStatus?.connected]);

  async function refreshGarments() {
    try {
      const response = await listGarments();
      setGarments(response.items);
      if (!selectedGarmentId && response.items.length > 0) {
        setSelectedGarmentId(response.items[0].id);
      }
      if (response.items.length === 0) {
        setStatus({
          phase: 'idle',
          message: 'Upload a 2D garment photo to begin the fitting flow.',
          lastUpdatedAt: new Date().toISOString()
        });
      }
    } catch {
      setStatus({
        phase: 'error',
        message: 'Failed to load garment library. Check that the backend is running.',
        lastUpdatedAt: new Date().toISOString()
      });
    }
  }

  async function refreshProviderStatus() {
    try {
      const response = await getProviderStatus();
      setProviderStatus(response);
    } catch {
      setProviderStatus(null);
    }
  }

  async function refreshOpenNiStatus() {
    try {
      const response = await getOpenNiCameraStatus();
      setOpenniStatus(response);
    } catch {
      setOpenniStatus(null);
    }
  }

  async function refreshOpenNiPreview() {
    try {
      const response = await getOpenNiCameraPreview();
      setOpenniPreview(response);
    } catch {
      setOpenniPreview(null);
    }
  }

  async function handleReconnectOpenNiCamera() {
    setStatus({
      phase: 'idle',
      message: 'Reconnecting OpenNI camera.',
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const response = await reconnectOpenNiCamera();
      setOpenniStatus(response);
      if (response.connected) {
        await refreshOpenNiPreview();
      } else {
        setOpenniPreview(null);
      }
      setStatus({
        phase: response.connected ? 'ready' : 'error',
        message: response.message,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'OpenNI reconnect failed.';
      setStatus({
        phase: 'error',
        message,
        lastUpdatedAt: new Date().toISOString()
      });
    }
  }

  async function handleGarmentUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setStatus({
      phase: 'processing',
      message: `Processing garment photo: ${file.name}`,
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const objectUrl = URL.createObjectURL(file);
      try {
        const dataUrl = await imageSourceToPngDataUrl(objectUrl);
        const asset = await processGarment({
          name: stripExtension(file.name),
          category: inferCategory(file.name),
          garment_image_base64: extractBase64(dataUrl)
        });

        setGarments((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
        setSelectedGarmentId(asset.id);
        setStatus({
          phase: 'ready',
          message: `${asset.name} is ready as a 2D try-on garment.`,
          lastUpdatedAt: new Date().toISOString()
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Garment processing failed.';
      setStatus({
        phase: 'error',
        message,
        lastUpdatedAt: new Date().toISOString()
      });
    }
  }

  async function handleCaptureAndSynthesize() {
    if (!selectedGarment) {
      setStatus({
        phase: 'error',
        message: 'Select a garment before running synthesis.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    const snapshot = cameraPreviewRef.current?.captureSnapshot();
    if (!snapshot) {
      setStatus({
        phase: 'error',
        message: 'Could not capture the current frame. Confirm the camera preview is active.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    setStatus({
      phase: 'fitting',
      message: `Capturing current frame and running AI try-on for ${selectedGarment.name}.`,
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const model = await analyzeModel({
        name: `camera-frame-${Date.now()}`,
        model_image_base64: extractBase64(snapshot.imageDataUrl),
        frame_width: snapshot.frameWidth,
        frame_height: snapshot.frameHeight
      });

      const job = await createTryOnJob({
        model_id: model.id,
        garment_id: selectedGarment.id,
        manual_landmarks: snapshot.landmarks
      });

      setLastTryOnJob(job);
      setLastCapture(null);
      setStatus({
        phase: job.status === 'succeeded' ? 'ready' : 'error',
        message:
          job.status === 'succeeded'
            ? `AI try-on finished for ${selectedGarment.name}.`
            : job.warnings[0] ?? 'AI try-on failed.',
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'AI try-on failed.';
      setStatus({
        phase: 'error',
        message,
        lastUpdatedAt: new Date().toISOString()
      });
    }
  }

  async function handleSaveResult() {
    if (!lastTryOnJob?.result_image_url) {
      setStatus({
        phase: 'error',
        message: 'No synthesized image is available to save.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    setStatus({
      phase: 'capturing',
      message: 'Saving synthesized result image.',
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const response = await fetch(lastTryOnJob.result_image_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch result image (${response.status}).`);
      }

      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      const capture = await captureResult({
        image_base64: extractBase64(dataUrl),
        file_extension: 'png'
      });

      setLastCapture(capture);
      setStatus({
        phase: 'ready',
        message: `Saved result image to ${capture.saved_path}`,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Saving result failed.';
      setStatus({
        phase: 'error',
        message,
        lastUpdatedAt: new Date().toISOString()
      });
    }
  }

  function handleGarmentSelect(garment: GarmentAsset) {
    setSelectedGarmentId(garment.id);
    setStatus({
      phase: cameraConnected ? 'camera-ready' : 'idle',
      message: `Selected garment: ${garment.name}`,
      lastUpdatedAt: new Date().toISOString()
    });
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Virtual Fitting Mirror MVP</p>
          <h1>2D garment photo try-on with live camera capture</h1>
          <p className="intro">
            Upload or choose a front-facing garment photo, confirm the active camera, then capture the current frame to
            run AI synthesis through the configured backend.
          </p>
        </div>
        <div className="header-actions">
          <label className="secondary-upload-button">
            <span>Upload 2D garment photo</span>
            <input type="file" accept="image/*" onChange={handleGarmentUpload} disabled={isBusy} />
          </label>
        </div>
      </header>

      <div className="layout">
        <ClothesPicker
          garments={garments}
          selectedGarmentId={selectedGarmentId}
          onSelect={handleGarmentSelect}
          isLoading={isBusy}
        />

        <div className="center-column">
          <OpenNICameraPanel
            status={openniStatus}
            preview={openniPreview}
            onReconnect={() => void handleReconnectOpenNiCamera()}
            isBusy={isBusy}
          />

          <CameraPreview
            ref={cameraPreviewRef}
            garment={selectedGarment}
            enableLiveOverlay
            showTrackingGuide
            onStatusChange={(message, isConnected, deviceLabel, isOrbbec) => {
              setCameraConnected(isConnected);
              setCameraLabel(deviceLabel ?? null);
              setOrbbecMatched(Boolean(isOrbbec));
              setStatus((current) => {
                if (current.phase === 'processing' || current.phase === 'fitting' || current.phase === 'capturing') {
                  return current;
                }

                return {
                  phase: isConnected ? 'camera-ready' : 'idle',
                  message,
                  lastUpdatedAt: new Date().toISOString()
                };
              });
            }}
            onTrackingChange={(message, isTracking) => {
              setTrackingEnabled(isTracking);
              setStatus((current) => {
                if (current.phase === 'processing' || current.phase === 'fitting' || current.phase === 'capturing') {
                  return current;
                }

                return {
                  phase: isTracking ? 'ready' : current.phase,
                  message,
                  lastUpdatedAt: new Date().toISOString()
                };
              });
            }}
          />

          <section className="panel garment-summary">
            <span className="photo-label">Session</span>
            <strong>Camera capture to AI synthesis</strong>
            <span className="garment-meta">Camera: {cameraConnected ? cameraLabel ?? 'Connected' : 'Disconnected'}</span>
            <span className="garment-meta">Orbbec check: {orbbecMatched ? 'Matched camera label' : 'No Orbbec/Astro match detected'}</span>
            <span className="garment-meta">OpenNI backend: {openniStatus?.message ?? 'Checking OpenNI camera status'}</span>
            <span className="garment-meta">Pose tracking: {trackingEnabled ? 'Tracking active' : 'Waiting for stable pose'}</span>
            <span className="garment-meta">Garment: {selectedGarment ? selectedGarment.name : 'No garment selected'}</span>
            <span className="garment-meta">
              Providers: pose {formatProviderName(providerStatus?.pose_provider)} / VTON {formatProviderName(providerStatus?.vton_provider)}
            </span>
            <span className="garment-meta">VTON status: {buildVtonStatusMessage(providerStatus)}</span>
            {lastTryOnJob?.warnings.length ? <p>Warnings: {lastTryOnJob.warnings.join(' / ')}</p> : null}
          </section>

          <section className="panel control-panel">
            <div className="control-row">
              <CaptureButton
                onCapture={() => void handleCaptureAndSynthesize()}
                disabled={isBusy || !selectedGarment || !cameraConnected}
              />
              <button
                type="button"
                className="secondary-action-button"
                onClick={() => void handleSaveResult()}
                disabled={isBusy || !lastTryOnJob?.result_image_url}
              >
                Save synthesized image
              </button>
            </div>
            <p className="control-copy">
              The capture button grabs the current camera frame, sends it with the selected 2D garment to the backend,
              and stores the latest result below.
            </p>
          </section>

          <section className="panel result-panel">
            <div className="result-header">
              <div>
                <span className="photo-label">Synthesized result</span>
                <strong>{lastTryOnJob?.result_image_url ? 'Latest AI try-on image' : 'No synthesized image yet'}</strong>
              </div>
            </div>

            <div className="result-stage">
              {lastTryOnJob?.result_image_url ? (
                <img className="result-image" src={lastTryOnJob.result_image_url} alt="Virtual fitting result" />
              ) : (
                <div className="empty-state">
                  <div>
                    <strong>Run capture and synthesis to generate the first result.</strong>
                    <p>The live overlay helps framing, and the generated image appears here after the backend finishes.</p>
                  </div>
                </div>
              )}
            </div>

            {lastCapture ? (
              <div className="fit-summary">
                <span>Capture ID: {lastCapture.capture_id}</span>
                <span>Saved path: {lastCapture.saved_path}</span>
              </div>
            ) : null}
          </section>
        </div>

        <StatusPanel
          status={status}
          providerStatus={providerStatus}
          cameraLabel={cameraLabel}
          isOrbbecMatched={orbbecMatched}
          selectedGarment={selectedGarment}
        />
      </div>
    </main>
  );
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, '');
}

function inferCategory(filename: string): GarmentAsset['category'] {
  const value = filename.toLowerCase();
  if (/(dress|gown)/.test(value)) {
    return 'dress';
  }
  if (/(pants|jeans|shorts|skirt|trouser)/.test(value)) {
    return 'bottom';
  }
  return 'top';
}

function formatProviderName(provider: string | undefined) {
  const labels: Record<string, string> = {
    mock: 'Mock',
    'mock-compositor-v1': 'Mock compositor',
    mediapipe: 'MediaPipe',
    'mediapipe-pose': 'MediaPipe Pose',
    catvton: 'CatVTON',
    'idm-vton': 'IDM-VTON',
    comfyui: 'ComfyUI'
  };

  if (!provider) {
    return 'Unknown';
  }
  return labels[provider] ?? provider;
}

function buildVtonStatusMessage(providerStatus: ProviderStatus | null) {
  if (!providerStatus) {
    return 'Provider status unavailable';
  }

  if (providerStatus.vton_provider === 'comfyui') {
    return providerStatus.comfyui_message ?? 'ComfyUI provider selected';
  }

  if (providerStatus.vton_provider === 'idm-vton') {
    if (providerStatus.idm_vton_message) {
      return providerStatus.idm_vton_auth_configured
        ? `${providerStatus.idm_vton_message} Auth configured.`
        : providerStatus.idm_vton_message;
    }
    return 'IDM-VTON provider selected. Set IDM_VTON_ENDPOINT_URL or IDM_VTON_BASE_URL.';
  }

  return `${formatProviderName(providerStatus.vton_provider)} provider active`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Blob conversion failed.'));
    };
    reader.onerror = () => reject(new Error('Blob conversion failed.'));
    reader.readAsDataURL(blob);
  });
}

export default App;
