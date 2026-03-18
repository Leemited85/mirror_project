import type { MouseEvent as ReactMouseEvent } from 'react';
import type { GarmentAsset, ModelAsset, PoseLandmarks, PosePoint, TryOnJob } from '../types/fitting';

type MirrorViewProps = {
  model: ModelAsset | null;
  garment: GarmentAsset | null;
  job: TryOnJob | null;
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
  manualMode,
  manualLandmarks,
  selectedLandmarkKey,
  onLandmarkChange,
  onLandmarkSelect
}: MirrorViewProps) {
  const stageImageUrl = job?.result_image_url ?? model?.original_image_url ?? null;
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
          <img src={stageImageUrl} alt="Try-on workspace" className="fit-model-image" />
        ) : (
          <div className="empty-state">
            <p>Upload a model first, then select a processed garment to preview the try-on result.</p>
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
                <span className="landmark-label">{key.replace(/_/g, ' ')}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="fit-summary">
        <strong>{model ? `Model: ${model.name}` : 'Model not analyzed'}</strong>
        <span>{garment ? `Garment: ${garment.name}` : 'Select a processed garment'}</span>
        <span>
          {job
            ? `${job.pose_engine} + ${job.vton_engine} | ${job.status}`
            : manualMode
              ? 'Edit landmarks and apply them to the next preview'
              : 'Preview will run after model analysis and garment selection'}
        </span>
      </div>
    </section>
  );
}
