import { useEffect, useState, type ChangeEvent } from 'react';
import { CameraPreview } from './components/CameraPreview';
import { CaptureButton } from './components/CaptureButton';
import { ClothesPicker } from './components/ClothesPicker';
import { MirrorView } from './components/MirrorView';
import { StatusPanel } from './components/StatusPanel';
import { analyzeModel, createTryOnJob, getProviderStatus, listGarments, processGarment } from './services/fittingApi';
import type { AppStatus, GarmentAsset, ModelAsset, ProviderStatus, TryOnJob } from './types/fitting';
import { extractBase64, imageSourceToPngDataUrl } from './utils/imageData';

const FIT_STAGE_WIDTH = 760;
const FIT_STAGE_HEIGHT = 920;

function App() {
  const [modelAsset, setModelAsset] = useState<ModelAsset | null>(null);
  const [modelPreviewUrl, setModelPreviewUrl] = useState<string | null>(null);
  const [garments, setGarments] = useState<GarmentAsset[]>([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
  const [tryOnJob, setTryOnJob] = useState<TryOnJob | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: '카메라 연결을 확인하고 있습니다.'
  });

  const selectedGarment = garments.find((garment) => garment.id === selectedGarmentId) ?? null;

  useEffect(() => {
    void refreshGarments();
    void refreshProviderStatus();
  }, []);

  useEffect(() => {
    return () => {
      if (modelPreviewUrl) {
        URL.revokeObjectURL(modelPreviewUrl);
      }
    };
  }, [modelPreviewUrl]);

  useEffect(() => {
    if (!modelAsset || !selectedGarment) {
      return;
    }

    void runTryOn();
  }, [modelAsset, selectedGarment]);

  async function refreshGarments() {
    try {
      const response = await listGarments();
      setGarments(response.items);
      if (!selectedGarmentId && response.items.length > 0) {
        setSelectedGarmentId(response.items[0].id);
      }
    } catch {
      // 백엔드 연결 전에는 업로드 플로우로 이어간다.
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

  async function handleModelUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (modelPreviewUrl) {
      URL.revokeObjectURL(modelPreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setModelPreviewUrl(previewUrl);
    setTryOnJob(null);
    setStatus({
      phase: 'processing',
      message: `${file.name} 모델 사진을 분석하고 있습니다.`,
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const dataUrl = await imageSourceToPngDataUrl(previewUrl);
      const asset = await analyzeModel({
        name: stripExtension(file.name),
        model_image_base64: extractBase64(dataUrl),
        frame_width: FIT_STAGE_WIDTH,
        frame_height: FIT_STAGE_HEIGHT
      });

      setModelAsset(asset);
      setStatus({
        phase: 'ready',
        message: '모델 분석이 완료되었습니다. 의류를 선택하면 바로 합성을 시작합니다.',
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '모델 분석에 실패했습니다.';
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
        setTryOnJob(null);
        setStatus({
          phase: 'ready',
          message: `${asset.name} 의류가 등록되었습니다. 모델과 자동 합성을 진행합니다.`,
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

  async function runTryOn() {
    if (!modelAsset || !selectedGarment) {
      return;
    }

    setStatus({
      phase: 'fitting',
      message: `${selectedGarment.name} 의류를 모델 사진에 합성하고 있습니다.`,
      lastUpdatedAt: new Date().toISOString()
    });

    try {
      const job = await createTryOnJob({
        model_id: modelAsset.id,
        garment_id: selectedGarment.id
      });
      setTryOnJob(job);
      setStatus({
        phase: job.status === 'succeeded' ? 'ready' : 'error',
        message: buildJobMessage(job),
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '합성 이미지 생성에 실패했습니다.';
      setStatus({
        phase: 'error',
        message,
        lastUpdatedAt: new Date().toISOString()
      });
    }
  }

  function handleGarmentSelect(garment: GarmentAsset) {
    setSelectedGarmentId(garment.id);
    setTryOnJob(null);
    setStatus({
      phase: modelAsset ? 'processing' : 'idle',
      message: `${garment.name} 의류를 선택했습니다.`,
      lastUpdatedAt: new Date().toISOString()
    });
  }

  function handleCapture() {
    if (!tryOnJob?.result_image_url) {
      setStatus({
        phase: 'error',
        message: '저장할 합성 결과 이미지가 아직 없습니다.',
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
      message: '합성 결과 이미지를 저장했습니다.',
      lastUpdatedAt: new Date().toISOString()
    });
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI 가상 피팅</p>
          <h1>모델 이미지 합성 스튜디오</h1>
          <p className="intro">
            먼저 웹 카메라 연결 상태를 확인하고, 필요하면 모델 사진과 의류 이미지를 업로드해 합성 결과를 생성합니다.
          </p>
        </div>
        <div className="header-actions">
          <label className="upload-button">
            <span>모델 업로드</span>
            <input type="file" accept="image/*" onChange={handleModelUpload} />
          </label>
          <label className="secondary-upload-button">
            <span>의류 업로드</span>
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
          <CameraPreview
            onStatusChange={(message, isConnected) => {
              setCameraConnected(isConnected);
              setStatus((current) => {
                if (current.phase === 'processing' || current.phase === 'fitting') {
                  return current;
                }

                return {
                  phase: isConnected ? 'camera-ready' : 'idle',
                  message,
                  lastUpdatedAt: new Date().toISOString()
                };
              });
            }}
          />

          <section className="panel garment-summary">
            <span className="photo-label">현재 엔진</span>
            <strong>{providerStatus ? translateProvider(providerStatus.vton_provider) : '백엔드 연결 확인 중'}</strong>
            <span className="garment-meta">
              {providerStatus
                ? `포즈: ${translateProvider(providerStatus.pose_provider)} | 합성: ${translateProvider(providerStatus.vton_provider)}`
                : '백엔드에서 provider 설정을 불러오면 현재 합성 엔진이 표시됩니다.'}
            </span>
            <span className="garment-meta">카메라: {cameraConnected ? '연결됨' : '미연결'}</span>
            {providerStatus?.vton_provider === 'comfyui' ? (
              <span className="garment-meta">
                {providerStatus.comfyui_base_url
                  ? `ComfyUI 주소: ${providerStatus.comfyui_base_url}`
                  : 'ComfyUI 주소가 아직 설정되지 않았습니다.'}
              </span>
            ) : null}
          </section>

          <section className="panel garment-summary">
            <span className="photo-label">모델</span>
            <strong>{modelAsset ? modelAsset.name : '모델 사진 대기 중'}</strong>
            <span className="garment-meta">
              {modelAsset
                ? `${modelAsset.frame_width} x ${modelAsset.frame_height} | 신뢰도 ${Math.round(modelAsset.confidence * 100)}%`
                : '모델 사진을 올리면 분석 후 합성 준비를 시작합니다.'}
            </span>
          </section>

          <section className="panel garment-summary">
            <span className="photo-label">의류</span>
            <strong>{selectedGarment ? selectedGarment.name : '의류 선택 대기 중'}</strong>
            <span className="garment-meta">
              {selectedGarment
                ? `${translateCategory(selectedGarment.category)} | ${selectedGarment.width} x ${selectedGarment.height}`
                : '등록된 의류를 고르거나 새 의류를 업로드하세요.'}
            </span>
          </section>

          <MirrorView
            model={modelAsset}
            garment={selectedGarment}
            job={tryOnJob}
            modelPreviewUrl={modelPreviewUrl}
          />

          <CaptureButton onCapture={handleCapture} disabled={!tryOnJob?.result_image_url} />
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
    mock: '기본 Mock',
    mediapipe: 'MediaPipe',
    catvton: 'CatVTON',
    comfyui: 'ComfyUI'
  };

  return labels[provider] ?? provider;
}

function translateJobStatus(status: TryOnJob['status']) {
  const labels: Record<TryOnJob['status'], string> = {
    queued: '대기 중',
    running: '처리 중',
    succeeded: '완료',
    failed: '실패'
  };

  return labels[status];
}

function buildJobMessage(job: TryOnJob) {
  const warningText = job.warnings.length ? ` 경고: ${job.warnings.join(' ')}` : '';
  const providerText = job.provider_job_id ? ` ComfyUI 작업 ID: ${job.provider_job_id}` : '';
  return `합성 작업 ${translateJobStatus(job.status)}. 엔진: ${job.vton_engine}.${providerText}${warningText}`.trim();
}

export default App;
