import { useEffect, useState, type ChangeEvent } from 'react';
import { CameraPreview } from './components/CameraPreview';
import { ClothesPicker } from './components/ClothesPicker';
import { StatusPanel } from './components/StatusPanel';
import { getProviderStatus, listGarments, processGarment } from './services/fittingApi';
import type { AppStatus, GarmentAsset, ProviderStatus } from './types/fitting';
import { extractBase64, imageSourceToPngDataUrl } from './utils/imageData';

function App() {
  const [garments, setGarments] = useState<GarmentAsset[]>([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
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

  async function refreshGarments() {
    try {
      const response = await listGarments();
      setGarments(response.items);
      if (!selectedGarmentId && response.items.length > 0) {
        setSelectedGarmentId(response.items[0].id);
      }
    } catch {
      // 백엔드 연결 전에는 빈 라이브러리 상태로 유지한다.
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
          message: `${asset.name} 의류가 라이브러리에 등록되었습니다.`,
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
          <p className="eyebrow">AI 가상 피팅</p>
          <h1>카메라 연결 미리보기</h1>
          <p className="intro">
            웹 카메라 연결 상태를 먼저 확인하고, 의류 라이브러리만 유지한 상태로 다음 단계를 준비합니다.
          </p>
        </div>
        <div className="header-actions">
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
          isLoading={status.phase === 'processing'}
        />

        <div className="center-column">
          <CameraPreview
            onStatusChange={(message, isConnected) => {
              setCameraConnected(isConnected);
              setStatus((current) => {
                if (current.phase === 'processing') {
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
                : '백엔드에서 provider 설정을 불러오면 현재 엔진 정보가 표시됩니다.'}
            </span>
            <span className="garment-meta">카메라: {cameraConnected ? '연결됨' : '미연결'}</span>
            {selectedGarment ? (
              <span className="garment-meta">
                선택된 의류: {selectedGarment.name} ({translateCategory(selectedGarment.category)})
              </span>
            ) : (
              <span className="garment-meta">선택된 의류가 없습니다.</span>
            )}
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
    mock: '기본 Mock',
    mediapipe: 'MediaPipe',
    catvton: 'CatVTON',
    comfyui: 'ComfyUI'
  };

  return labels[provider] ?? provider;
}

export default App;
