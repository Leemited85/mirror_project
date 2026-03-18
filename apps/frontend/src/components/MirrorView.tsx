import type { MouseEvent as ReactMouseEvent } from 'react';
import type { GarmentAsset, ModelAsset, PoseLandmarks, PosePoint, TryOnJob } from '../types/fitting';

type MirrorViewProps = {
  model: ModelAsset | null;
  garment: GarmentAsset | null;
  job: TryOnJob | null;
  modelPreviewUrl: string | null;
  manualMode: boolean;
  manualLandmarks: PoseLandmarks | null;
  selectedLandmarkKey: keyof PoseLandmarks | null;
  onLandmarkChange: (key: keyof PoseLandmarks, point: PosePoint) => void;
  onLandmarkSelect: (key: keyof PoseLandmarks) => void;
};

export function MirrorView({
  model,
  garment,
  job,
  modelPreviewUrl,
  manualMode,
  manualLandmarks,
  selectedLandmarkKey,
  onLandmarkChange,
  onLandmarkSelect
}: MirrorViewProps) {
  const stageImageUrl = manualMode
    ? modelPreviewUrl ?? model?.original_image_url ?? null
    : job?.result_image_url ?? modelPreviewUrl ?? model?.original_image_url ?? null;
  const displayLandmarks = manualMode ? manualLandmarks : job?.fitting?.landmarks ?? model?.landmarks ?? null;

  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!manualMode || !selectedLandmarkKey) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    onLandmarkChange(selectedLandmarkKey, {
      x: Math.round(Math.max(0, Math.min(rect.width, event.clientX - rect.left))),
      y: Math.round(Math.max(0, Math.min(rect.height, event.clientY - rect.top)))
    });
  };

  return (
    <section className="mirror panel">
      <div className={`fit-stage ${manualMode ? 'manual-editing' : ''}`} onClick={handleStageClick}>
        {stageImageUrl ? (
          <img src={stageImageUrl} alt="가상 피팅 작업 화면" className="fit-model-image" />
        ) : (
          <div className="empty-state">
            <p>먼저 모델 이미지를 업로드한 뒤 처리된 의류를 선택하면 피팅 결과를 미리볼 수 있습니다.</p>
          </div>
        )}

        {displayLandmarks ? (
          <div className={`fit-landmarks ${manualMode ? 'editable-layer' : ''}`}>
            {(Object.entries(displayLandmarks) as Array<[keyof PoseLandmarks, PosePoint]>).map(([key, point]) => (
              <button
                key={key}
                type="button"
                className={`landmark-dot ${manualMode ? 'editable' : ''} ${selectedLandmarkKey === key ? 'selected' : ''}`}
                style={{ left: `${point.x}px`, top: `${point.y}px` }}
                onPointerDown={
                  manualMode
                    ? (event) => {
                        event.preventDefault();
                        onLandmarkSelect(key);
                      }
                    : undefined
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onLandmarkSelect(key);
                }}
              >
                <span className="landmark-label">{translateLandmarkLabel(key)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="fit-summary">
        <strong>{model ? `모델: ${model.name}` : '모델 분석 대기 중'}</strong>
        <span>{garment ? `의류: ${garment.name}` : '처리된 의류를 선택해 주세요'}</span>
        <span>
          {job
            ? `${job.pose_engine} + ${job.vton_engine} | ${job.status}`
            : manualMode
              ? '피팅 포인트를 수정한 뒤 다음 미리보기에 적용하세요'
              : '모델 분석과 의류 선택이 완료되면 미리보기가 실행됩니다'}
        </span>
      </div>
    </section>
  );
}

function translateLandmarkLabel(key: keyof PoseLandmarks) {
  const labels: Record<keyof PoseLandmarks, string> = {
    neck: '목',
    left_shoulder: '왼쪽 어깨',
    right_shoulder: '오른쪽 어깨',
    left_hip: '왼쪽 골반',
    right_hip: '오른쪽 골반'
  };

  return labels[key];
}
