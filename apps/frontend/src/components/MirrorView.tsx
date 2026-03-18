import type { PointerEvent as ReactPointerEvent } from 'react';
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
  onLandmarkChange: (key: keyof PoseLandmarks, point: PosePoint) => void;
};

export function MirrorView({
  photoUrl,
  garment,
  fitting,
  resultImageUrl,
  manualMode,
  manualLandmarks,
  onLandmarkChange
}: MirrorViewProps) {
  const displayLandmarks = manualMode ? manualLandmarks : fitting?.landmarks ?? null;
  const stageImageUrl = manualMode || !resultImageUrl ? photoUrl : resultImageUrl;

  const handleDragStart = (key: keyof PoseLandmarks) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) {
      return;
    }

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

  return (
    <section className="mirror panel">
      <div className="fit-stage">
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
          <div className="fit-landmarks">
            {(
              Object.entries(displayLandmarks) as Array<[keyof PoseLandmarks, PosePoint]>
            ).map(([key, point]) => (
              <button
                key={key}
                type="button"
                className={`landmark-dot ${manualMode ? 'editable' : ''}`}
                style={{ left: `${point.x}px`, top: `${point.y}px` }}
                onPointerDown={manualMode ? handleDragStart(key) : undefined}
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
            ? 'Manual landmark editing enabled'
            : fitting
              ? `${fitting.engine} confidence ${Math.round(fitting.confidence * 100)}%`
              : 'Waiting for fitting input'}
        </span>
      </div>
    </section>
  );
}
