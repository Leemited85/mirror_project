import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { FittingResponse, Garment, PoseLandmarks, PosePoint } from '../types/fitting';

type MirrorGarment = Garment & {
  brand: string;
  color: string;
  silhouette: string;
};

type MirrorViewProps = {
  photoUrl: string | null;
  garment: MirrorGarment;
  fitting: FittingResponse | null;
  resultImageUrl: string | null;
  manualMode: boolean;
  manualLandmarks: PoseLandmarks | null;
  selectedLandmarkKey: keyof PoseLandmarks | null;
  onLandmarkChange: (key: keyof PoseLandmarks, point: PosePoint) => void;
  onLandmarkSelect: (key: keyof PoseLandmarks) => void;
};

export function MirrorView({
  photoUrl,
  garment,
  fitting,
  resultImageUrl,
  manualMode,
  manualLandmarks,
  selectedLandmarkKey,
  onLandmarkChange,
  onLandmarkSelect
}: MirrorViewProps) {
  const displayLandmarks = manualMode ? manualLandmarks : fitting?.landmarks ?? null;
  const stageImageUrl = manualMode || !resultImageUrl ? photoUrl : resultImageUrl;

  const handleDragStart = (key: keyof PoseLandmarks) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) {
      return;
    }

    onLandmarkSelect(key);

    const rect = container.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);

    const move = (clientX: number, clientY: number) => {
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      onLandmarkChange(key, { x: Math.round(x), y: Math.round(y) });
    };

    move(event.clientX, event.clientY);

    const onPointerMove = (nextEvent: PointerEvent) => {
      move(nextEvent.clientX, nextEvent.clientY);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!manualMode || !selectedLandmarkKey) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    onLandmarkChange(selectedLandmarkKey, { x: Math.round(x), y: Math.round(y) });
  };

  return (
    <section className="mirror panel">
      <div className={`fit-stage ${manualMode ? 'manual-editing' : ''}`} onClick={handleStageClick}>
        {stageImageUrl ? (
          <img
            src={stageImageUrl}
            alt={manualMode || !resultImageUrl ? 'Uploaded model' : 'Try-on result'}
            className="fit-model-image"
          />
        ) : (
          <div className="empty-state">
            <p>Upload a model photo to run body-tracked garment fitting.</p>
          </div>
        )}

        {displayLandmarks ? (
          <div className={`fit-landmarks ${manualMode ? 'editable-layer' : ''}`}>
            {(
              Object.entries(displayLandmarks) as Array<[keyof PoseLandmarks, PosePoint]>
            ).map(([key, point]) => (
              <button
                key={key}
                type="button"
                className={`landmark-dot ${manualMode ? 'editable' : ''} ${selectedLandmarkKey === key ? 'selected' : ''}`}
                style={{ left: `${point.x}px`, top: `${point.y}px` }}
                onPointerDown={manualMode ? handleDragStart(key) : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  onLandmarkSelect(key);
                }}
                aria-label={key}
              >
                <span className="landmark-label">{key.replace(/_/g, ' ')}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="fit-summary">
        <strong>{garment.name}</strong>
        <span>{garment.brand} | {garment.color} | {garment.silhouette}</span>
        <span>
          {manualMode
            ? selectedLandmarkKey
              ? `Editing ${selectedLandmarkKey.replace(/_/g, ' ')}`
              : 'Select a point, then drag it or click the image to move it'
            : fitting
              ? `${fitting.engine} confidence ${Math.round(fitting.confidence * 100)}%`
              : 'Waiting for fitting input'}
        </span>
      </div>
    </section>
  );
}
