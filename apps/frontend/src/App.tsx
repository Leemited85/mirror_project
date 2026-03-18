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
  const [modelPreviewUrl, setModelPreviewUrl] = useState<string | null>(null);
  const [garments, setGarments] = useState<GarmentAsset[]>([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null);
  const [tryOnJob, setTryOnJob] = useState<TryOnJob | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualLandmarks, setManualLandmarks] = useState<PoseLandmarks | null>(null);
  const [selectedLandmarkKey, setSelectedLandmarkKey] = useState<keyof PoseLandmarks | null>(null);
  const [status, setStatus] = useState<AppStatus>({
    phase: 'idle',
    message: '모델 이미지를 업로드하면 VTON 작업을 시작할 수 있습니다.'
  });

  const selectedGarment = garments.find((garment) => garment.id === selectedGarmentId) ?? null;

  useEffect(() => {
    void refreshGarments();
  }, []);

  useEffect(() => {
    return () => {
      if (modelPreviewUrl) {
        URL.revokeObjectURL(modelPreviewUrl);
      }
    };
  }, [modelPreviewUrl]);

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
      // 사용자가 명시적으로 액션을 취할 때 상태 메시지로 안내한다.
    }
  };

  const handleModelUpload = async (event: ChangeEvent<HTMLInputElement>) => {
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

    setStatus({
      phase: 'processing',
      message: `${file.name} 업로드 완료. 모델 피팅 정보를 분석하고 있습니다...`,
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
      setManualLandmarks(asset.landmarks);
      setSelectedLandmarkKey('neck');
      setTryOnJob(null);
      setManualMode(false);
      setStatus({
        phase: 'ready',
        message: `모델 분석이 완료되었습니다. 의류를 선택하면 가상 피팅 미리보기를 시작합니다.`,
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
  };

  const handleGarmentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setStatus({
      phase: 'processing',
      message: `${file.name} 업로드 완료. 의류 자산을 처리하고 있습니다...`,
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
        message: `${asset.name} 의류가 처리되어 라이브러리에 추가되었습니다.`,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '의류 처리에 실패했습니다.';
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
        ? `${selectedGarment.name} 의류에 수동 피팅 포인트를 적용하고 있습니다...`
        : `${selectedGarment.name} 의류로 가상 피팅 미리보기를 생성하고 있습니다...`,
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
        message: buildJobMessage(job),
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '가상 피팅 미리보기에 실패했습니다.';
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
      message: `${garment.name} 의류를 선택했습니다.`,
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
        ? '수동 피팅 포인트 편집을 켰습니다. 포인트를 선택한 뒤 이미지에서 원하는 위치를 클릭하세요.'
        : '수동 피팅 포인트 편집을 종료했습니다.',
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
        message: '아직 저장할 최종 합성 이미지가 없습니다.',
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
      message: '최종 합성 이미지를 저장했습니다.',
      lastUpdatedAt: new Date().toISOString()
    });
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">가상 피팅 워크스페이스</p>
          <h1>버추얼 피팅 미러</h1>
          <p className="intro">1. 모델 분석 2. 의류 자산 등록 3. 가상 피팅 작업 실행 4. 결과 미리보기 5. 최종 이미지 저장</p>
        </div>
        <div className="header-actions">
          <label className="upload-button">
            <span>모델 업로드</span>
            <input type="file" accept="image/*" onChange={handleModelUpload} />
          </label>
          <label className="secondary-upload-button">
            <span>의류 추가</span>
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
            <span className="photo-label">1단계</span>
            <strong>{modelAsset ? modelAsset.name : '모델 분석 대기 중'}</strong>
            <span className="garment-meta">
              {modelAsset
                ? `${modelAsset.pose_engine} | 신뢰도 ${Math.round(modelAsset.confidence * 100)}%`
                : '모델 이미지를 업로드하면 피팅 포인트를 추출합니다'}
            </span>
          </section>

          <section className="panel garment-summary">
            <span className="photo-label">2단계</span>
            <strong>{selectedGarment ? selectedGarment.name : '의류 선택 대기 중'}</strong>
            <span className="garment-meta">
              {selectedGarment
                ? `${translateCategory(selectedGarment.category)} | ${selectedGarment.width} x ${selectedGarment.height}`
                : '업로드하거나 처리된 의류 자산을 선택해 주세요'}
            </span>
          </section>

          <section className="panel manual-controls">
            <strong>3단계: 미리보기 제어</strong>
            <p>모델 분석 결과의 피팅 포인트가 실제 신체와 맞지 않을 때만 수동 편집을 사용하세요.</p>
            <div className="manual-action-row">
              <button type="button" className="secondary-action-button" onClick={handleManualToggle} disabled={!modelAsset}>
                {manualMode ? '수동 편집 종료' : '핏 포인트 편집'}
              </button>
              <button
                type="button"
                className="secondary-action-button"
                onClick={handleApplyManualPoints}
                disabled={!manualMode || !manualLandmarks || !selectedGarment || !modelAsset}
              >
                포인트 적용
              </button>
            </div>
          </section>

          <MirrorView
            model={modelAsset}
            garment={selectedGarment}
            job={tryOnJob}
            modelPreviewUrl={modelPreviewUrl}
            manualMode={manualMode}
            manualLandmarks={manualLandmarks}
            selectedLandmarkKey={selectedLandmarkKey}
            onLandmarkChange={handleLandmarkChange}
            onLandmarkSelect={setSelectedLandmarkKey}
          />

          <CaptureButton onCapture={handleCapture} disabled={!tryOnJob?.result_image_url} label="최종 이미지 저장" />
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

function translateCategory(category: GarmentAsset['category']) {
  const labels: Record<GarmentAsset['category'], string> = {
    top: '상의',
    bottom: '하의',
    dress: '원피스'
  };

  return labels[category];
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
  return `${job.pose_engine} + ${job.vton_engine} ${translateJobStatus(job.status)}.${warningText}`.trim();
}

export default App;
