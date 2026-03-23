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

type ExperienceMode = 'live-overlay' | 'hq-render' | 'generated-low-fps';

const LOW_FPS_REFRESH_MS = 4000;

function App() {
  const cameraPreviewRef = useRef<CameraPreviewHandle | null>(null);
  const renderSequenceRef = useRef(0);
  const [garments, setGarments] = useState<GarmentAsset[]>([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [lastTryOnJob, setLastTryOnJob] = useState<TryOnJob | null>(null);
  const [lastCapture, setLastCapture] = useState<CaptureResponse | null>(null);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('live-overlay');
  const [autoGenerationEnabled, setAutoGenerationEnabled] = useState(false);
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: '카메라 연결 상태를 확인하고 있습니다.'
  });

  const selectedGarment = garments.find((garment) => garment.id === selectedGarmentId) ?? null;
  const isProcessingGarment = status.phase === 'processing';
  const isRendering = status.phase === 'fitting';
  const isCapturing = status.phase === 'capturing';
  const isBusy = isProcessingGarment || isCapturing;

  useEffect(() => {
    void refreshGarments();
    void refreshProviderStatus();
  }, []);

  useEffect(() => {
    setAutoGenerationEnabled(experienceMode === 'generated-low-fps');
  }, [experienceMode]);

  useEffect(() => {
    if (experienceMode !== 'generated-low-fps' || !autoGenerationEnabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (selectedGarment && cameraConnected && trackingEnabled && !isRendering && !isProcessingGarment && !isCapturing) {
        void runHighQualityRender('background');
      }
    }, LOW_FPS_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    autoGenerationEnabled,
    cameraConnected,
    experienceMode,
    isCapturing,
    isProcessingGarment,
    isRendering,
    selectedGarment,
    trackingEnabled
  ]);

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

  async function handleManualRender() {
    await runHighQualityRender('foreground');
  }

  async function runHighQualityRender(priority: 'foreground' | 'background') {
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

    renderSequenceRef.current += 1;
    const renderId = renderSequenceRef.current;

    setStatus({
      phase: 'fitting',
      message:
        priority === 'foreground'
          ? '고품질 AI 가상 피팅 결과를 생성하고 있습니다.'
          : `저FPS 생성형 렌더를 갱신하고 있습니다. (${LOW_FPS_REFRESH_MS / 1000}초 주기)`,
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

      if (renderId === renderSequenceRef.current) {
        setLastTryOnJob(job);
      }
      setLastCapture(null);
      setStatus({
        phase: job.status === 'succeeded' ? 'ready' : 'error',
        message:
          job.status === 'succeeded'
            ? priority === 'foreground'
              ? `${selectedGarment.name} 고품질 결과를 생성했습니다.`
              : `${selectedGarment.name} 저FPS 생성형 결과를 갱신했습니다.`
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
        message: '저장할 결과 이미지가 없습니다. 먼저 고품질 렌더를 실행해 주세요.',
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

  function handleModeChange(mode: ExperienceMode) {
    setExperienceMode(mode);
    setStatus({
      phase: cameraConnected ? 'camera-ready' : 'idle',
      message: buildModeMessage(mode),
      lastUpdatedAt: new Date().toISOString()
    });
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Virtual Fitting Mirror</p>
          <h1>실시간 오버레이와 생성형 가상 피팅을 함께 쓰는 미러</h1>
          <p className="intro">
            1차는 영상 위 실시간 의류 오버레이, 2차는 선택 순간의 고품질 AI 렌더, 3차는 저FPS 생성형 갱신으로 확장한 흐름입니다.
          </p>
        </div>
        <div className="header-actions">
          <label className="secondary-upload-button">
            <span>의류 업로드</span>
            <input type="file" accept="image/*" onChange={handleGarmentUpload} disabled={isBusy} />
          </label>
        </div>
      </header>

      <section className="panel mode-panel">
        <div className="mode-header">
          <div>
            <span className="photo-label">Experience Mode</span>
            <strong>원하는 처리 방식을 선택하세요</strong>
          </div>
        </div>
        <div className="mode-grid">
          <button
            type="button"
            className={`mode-card ${experienceMode === 'live-overlay' ? 'selected' : ''}`}
            onClick={() => handleModeChange('live-overlay')}
          >
            <span className="mode-title">1차 실시간 오버레이</span>
            <span className="mode-copy">카메라 위에 의류를 즉시 워핑해 얹습니다. FPS와 안정성을 우선합니다.</span>
          </button>
          <button
            type="button"
            className={`mode-card ${experienceMode === 'hq-render' ? 'selected' : ''}`}
            onClick={() => handleModeChange('hq-render')}
          >
            <span className="mode-title">2차 고품질 단건 렌더</span>
            <span className="mode-copy">원하는 순간만 AI 렌더를 호출해 더 자연스러운 결과 이미지를 생성합니다.</span>
          </button>
          <button
            type="button"
            className={`mode-card ${experienceMode === 'generated-low-fps' ? 'selected' : ''}`}
            onClick={() => handleModeChange('generated-low-fps')}
          >
            <span className="mode-title">3차 저FPS 생성형</span>
            <span className="mode-copy">실시간 오버레이를 유지하면서 일정 주기로 생성형 결과를 갱신합니다.</span>
          </button>
        </div>
      </section>

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
            enableLiveOverlay={experienceMode !== 'hq-render'}
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
            <span className="photo-label">현재 파이프라인</span>
            <strong>{modeTitle(experienceMode)}</strong>
            <span className="garment-meta">카메라: {cameraConnected ? '연결됨' : '미연결'}</span>
            <span className="garment-meta">신체 추적: {trackingEnabled ? '동작 중' : '준비 중'}</span>
            <span className="garment-meta">
              실시간 오버레이: {experienceMode === 'hq-render' ? '비활성' : selectedGarment ? '활성' : '의류 선택 필요'}
            </span>
            <span className="garment-meta">
              {providerStatus
                ? `AI 렌더 엔진: ${translateProvider(providerStatus.vton_provider)} / 포즈 엔진: ${translateProvider(providerStatus.pose_provider)}`
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

          <section className="panel control-panel">
            <div className="control-row">
              <button
                type="button"
                className="upload-button"
                onClick={() => void handleManualRender()}
                disabled={isBusy || !selectedGarment || !cameraConnected}
              >
                {experienceMode === 'generated-low-fps' ? '지금 생성형 결과 갱신' : '고품질 AI 렌더 실행'}
              </button>
              {experienceMode === 'generated-low-fps' ? (
                <button
                  type="button"
                  className="secondary-action-button"
                  onClick={() => setAutoGenerationEnabled((current) => !current)}
                  disabled={!selectedGarment || !cameraConnected}
                >
                  {autoGenerationEnabled ? '저FPS 자동 갱신 중지' : '저FPS 자동 갱신 시작'}
                </button>
              ) : null}
            </div>
            <p className="control-copy">{buildControlCopy(experienceMode, autoGenerationEnabled)}</p>
          </section>

          <section className="panel result-panel">
            <div className="result-header">
              <div>
                <span className="photo-label">생성형 결과</span>
                <strong>{lastTryOnJob?.result_image_url ? '최근 AI 렌더 결과' : '아직 생성된 결과가 없습니다'}</strong>
              </div>
              <CaptureButton onCapture={() => void handleSaveResult()} disabled={isBusy || !lastTryOnJob?.result_image_url} label="결과 저장" />
            </div>

            <div className="result-stage">
              {lastTryOnJob?.result_image_url ? (
                <img className="result-image" src={lastTryOnJob.result_image_url} alt="Virtual fitting result" />
              ) : (
                <div className="empty-state">
                  <div>
                    <strong>고품질 AI 렌더를 실행하면 결과가 여기에 표시됩니다.</strong>
                    <p>실시간 오버레이는 위 카메라 화면에서 바로 확인할 수 있습니다.</p>
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

function modeTitle(mode: ExperienceMode) {
  const labels: Record<ExperienceMode, string> = {
    'live-overlay': '1차 실시간 신체 트래킹 기반 의류 오버레이',
    'hq-render': '2차 선택 시점 고품질 AI 생성 렌더',
    'generated-low-fps': '3차 저FPS 생성형 갱신 파이프라인'
  };

  return labels[mode];
}

function buildModeMessage(mode: ExperienceMode) {
  const messages: Record<ExperienceMode, string> = {
    'live-overlay': '실시간 의류 오버레이 모드로 전환했습니다.',
    'hq-render': '고품질 단건 렌더 모드로 전환했습니다.',
    'generated-low-fps': '저FPS 생성형 갱신 모드로 전환했습니다.'
  };

  return messages[mode];
}

function buildControlCopy(mode: ExperienceMode, autoEnabled: boolean) {
  if (mode === 'live-overlay') {
    return '카메라 화면에서 선택 의류가 실시간으로 따라붙습니다. 별도 AI 렌더는 필요할 때만 실행하면 됩니다.';
  }

  if (mode === 'hq-render') {
    return '원하는 포즈가 잡혔을 때 고품질 AI 렌더를 실행해 더 자연스러운 결과 이미지를 생성합니다.';
  }

  return autoEnabled
    ? `실시간 오버레이를 유지하면서 ${LOW_FPS_REFRESH_MS / 1000}초마다 생성형 결과를 갱신하고 있습니다.`
    : '저FPS 자동 갱신을 켜면 일정 주기로 AI 렌더를 새로 생성합니다.';
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
