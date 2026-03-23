import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CameraPreview, type CameraPreviewHandle } from './components/CameraPreview';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { StatusPanel } from './components/StatusPanel';
import {
  analyzeModel,
  captureResult,
  createTryOnJob,
  getProviderStatus,
  listGarments,
  processGarment
} from './services/fittingApi';
import type { AppStatus, CaptureResponse, GarmentAsset, ProviderStatus, TryOnJob } from './types/fitting';
import { extractBase64, imageSourceToPngDataUrl } from './utils/imageData';

function App() {
  const cameraPreviewRef = useRef<CameraPreviewHandle | null>(null);
  const [garments, setGarments] = useState<GarmentAsset[]>([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [lastTryOnJob, setLastTryOnJob] = useState<TryOnJob | null>(null);
  const [lastCapture, setLastCapture] = useState<CaptureResponse | null>(null);
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: '카메라 연결 상태를 확인하고 있습니다.'
  });

  const selectedGarment = garments.find((garment) => garment.id === selectedGarmentId) ?? null;
  const isBusy = status.phase === 'processing' || status.phase === 'fitting' || status.phase === 'capturing';

  useEffect(() => {
    void refreshGarments();
    void refreshProviderStatus();
  }, []);

  async function refreshGarments() {
    try {
      const response = await listGarments();
      setGarments(response.items);
      if (!selectedGarmentId && response.items.length > 0) {
        setSelectedGarmentId(response.items[0].id);
      }
    } catch {
      setStatus({
        phase: 'error',
        message: '의류 라이브러리를 불러오지 못했습니다. 백엔드 연결 상태를 확인해 주세요.',
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

  async function handleGarmentUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setStatus({
      phase: 'processing',
      message: `${file.name} 의류 이미지를 처리하고 있습니다.`,
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const objectUrl = URL.createObjectURL(file);
      try {
        const dataUrl = await imageSourceToPngDataUrl(objectUrl);
        const asset = await processGarment({
          name: stripExtension(file.name),
          category: 'top',
          garment_image_base64: extractBase64(dataUrl)
        });

        setGarments((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
        setSelectedGarmentId(asset.id);
        setStatus({
          phase: 'ready',
          message: `${asset.name} 의류를 라이브러리에 추가했습니다.`,
          lastUpdatedAt: new Date().toISOString()
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '의류 처리에 실패했습니다.';
      setStatus({
        phase: 'error',
        message,
        lastUpdatedAt: new Date().toISOString()
      });
    }
  }

  async function handleRunTryOn() {
    if (!selectedGarment) {
      setStatus({
        phase: 'error',
        message: '먼저 의류를 선택해 주세요.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    const snapshot = cameraPreviewRef.current?.captureSnapshot();
    if (!snapshot) {
      setStatus({
        phase: 'error',
        message: '카메라 프레임을 가져오지 못했습니다. 카메라가 준비되었는지 확인해 주세요.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    setStatus({
      phase: 'fitting',
      message: '현재 프레임을 분석하고 가상 피팅 결과를 생성하고 있습니다.',
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
            ? `${selectedGarment.name} 가상 피팅 결과를 생성했습니다.`
            : job.warnings[0] ?? '가상 피팅 결과 생성에 실패했습니다.',
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '가상 피팅 처리 중 오류가 발생했습니다.';
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
        message: '저장할 결과 이미지가 없습니다. 먼저 가상 피팅을 실행해 주세요.',
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    setStatus({
      phase: 'capturing',
      message: '가상 피팅 결과 이미지를 저장하고 있습니다.',
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const response = await fetch(lastTryOnJob.result_image_url);
      if (!response.ok) {
        throw new Error(`결과 이미지를 불러오지 못했습니다 (${response.status}).`);
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
        message: `결과 이미지를 저장했습니다. 경로: ${capture.saved_path}`,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '결과 이미지 저장에 실패했습니다.';
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
      message: `${garment.name} 의류를 선택했습니다.`,
      lastUpdatedAt: new Date().toISOString()
    });
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Virtual Fitting Mirror</p>
          <h1>카메라 프레임 기반 가상 피팅 미리보기</h1>
          <p className="intro">
            실시간 카메라 화면에서 현재 프레임을 분석하고, 선택한 의류를 합성한 결과를 바로 확인할 수 있습니다.
          </p>
        </div>
        <div className="header-actions">
          <label className="secondary-upload-button">
            <span>의류 업로드</span>
            <input type="file" accept="image/*" onChange={handleGarmentUpload} disabled={isBusy} />
          </label>
          <button type="button" className="upload-button" onClick={() => void handleRunTryOn()} disabled={isBusy || !selectedGarment}>
            가상 피팅 실행
          </button>
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
          <CameraPreview
            ref={cameraPreviewRef}
            garment={selectedGarment}
            enableLiveOverlay
            showTrackingGuide
            onStatusChange={(message, isConnected) => {
              setCameraConnected(isConnected);
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
            <span className="photo-label">현재 상태</span>
            <strong>{cameraConnected ? '카메라 연결 완료' : '카메라 연결 필요'}</strong>
            <span className="garment-meta">카메라: {cameraConnected ? '연결됨' : '미연결'}</span>
            <span className="garment-meta">추적 가이드: {trackingEnabled ? '동작 중' : '준비 중'}</span>
            <span className="garment-meta">
              {providerStatus
                ? `가상 피팅 엔진: ${translateProvider(providerStatus.vton_provider)} / 포즈 엔진: ${translateProvider(providerStatus.pose_provider)}`
                : '백엔드 엔진 정보를 확인하지 못했습니다.'}
            </span>
            {selectedGarment ? (
              <span className="garment-meta">
                선택 의류: {selectedGarment.name} ({translateCategory(selectedGarment.category)})
              </span>
            ) : (
              <span className="garment-meta">선택한 의류가 없습니다.</span>
            )}
            {lastTryOnJob?.warnings.length ? <p>알림: {lastTryOnJob.warnings.join(' / ')}</p> : null}
          </section>

          <section className="panel result-panel">
            <div className="result-header">
              <div>
                <span className="photo-label">피팅 결과</span>
                <strong>{lastTryOnJob?.result_image_url ? '생성된 결과 이미지' : '아직 결과가 없습니다'}</strong>
              </div>
              <CaptureButton onCapture={() => void handleSaveResult()} disabled={isBusy || !lastTryOnJob?.result_image_url} label="결과 저장" />
            </div>

            <div className="result-stage">
              {lastTryOnJob?.result_image_url ? (
                <img className="result-image" src={lastTryOnJob.result_image_url} alt="Virtual fitting result" />
              ) : (
                <div className="empty-state">
                  <div>
                    <strong>가상 피팅을 실행하면 결과가 여기에 표시됩니다.</strong>
                    <p>카메라 연결 후 의류를 고르고 실행 버튼을 눌러 주세요.</p>
                  </div>
                </div>
              )}
            </div>

            {lastCapture ? (
              <div className="fit-summary">
                <span>최근 저장 ID: {lastCapture.capture_id}</span>
                <span>저장 경로: {lastCapture.saved_path}</span>
              </div>
            ) : null}
          </section>
        </div>

        <StatusPanel status={status} />
      </div>
    </main>
  );
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, '');
}

function translateCategory(category: GarmentAsset['category']) {
  const labels: Record<GarmentAsset['category'], string> = {
    top: '상의',
    bottom: '하의',
    dress: '원피스'
  };

  return labels[category];
}

function translateProvider(provider: string) {
  const labels: Record<string, string> = {
    mock: 'Mock',
    'mock-compositor-v1': 'Mock compositor',
    mediapipe: 'MediaPipe',
    catvton: 'CatVTON',
    comfyui: 'ComfyUI'
  };

  return labels[provider] ?? provider;
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
