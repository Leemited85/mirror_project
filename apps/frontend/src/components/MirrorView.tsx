import type { GarmentAsset, ModelAsset, TryOnJob } from '../types/fitting';

type MirrorViewProps = {
  model: ModelAsset | null;
  garment: GarmentAsset | null;
  job: TryOnJob | null;
  modelPreviewUrl: string | null;
};

export function MirrorView({ model, garment, job, modelPreviewUrl }: MirrorViewProps) {
  const previewImageUrl = job?.result_image_url ?? model?.original_image_url ?? modelPreviewUrl;

  return (
    <section className="panel">
      <div className="photo-meta">
        <span className="photo-label">합성 미리보기</span>
        <strong>{job?.result_image_url ? '최종 합성 결과' : '모델 원본 미리보기'}</strong>
        <p>
          {job?.result_image_url
            ? '선택된 의류를 반영한 최종 이미지를 표시합니다.'
            : '모델과 의류가 준비되면 백엔드에서 합성 이미지를 생성합니다.'}
        </p>
      </div>

      <div className="fit-stage">
        {previewImageUrl ? (
          <img
            src={previewImageUrl}
            alt={job?.result_image_url ? '합성 결과 이미지' : '모델 원본 이미지'}
            className="fit-model-image"
          />
        ) : (
          <div className="empty-state">
            <div>
              <strong>모델 사진을 먼저 업로드하세요.</strong>
              <p>의류를 선택하면 AI 합성 결과가 이 영역에 표시됩니다.</p>
            </div>
          </div>
        )}
      </div>

      <div className="fit-summary">
        <span>모델: {model?.name ?? '미선택'}</span>
        <span>의류: {garment?.name ?? '미선택'}</span>
        <span>상태: {translatePreviewStatus(job)}</span>
      </div>
    </section>
  );
}

function translatePreviewStatus(job: TryOnJob | null) {
  if (!job) {
    return '합성 전';
  }

  const labels: Record<TryOnJob['status'], string> = {
    queued: '대기 중',
    running: '처리 중',
    succeeded: '합성 완료',
    failed: '합성 실패'
  };

  return labels[job.status];
}
