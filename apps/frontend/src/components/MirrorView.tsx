import type { FittingResponse, Garment } from '../types/fitting';

type MirrorGarment = Garment & {
  brand: string;
  color: string;
  silhouette: string;
};

type MirrorViewProps = {
  photoUrl: string | null;
  garment: MirrorGarment;
  fitting: FittingResponse | null;
};

export function MirrorView({ photoUrl, garment, fitting }: MirrorViewProps) {
  return (
    <section className="mirror panel">
      <div className="fit-stage">
        {photoUrl ? (
          <>
            <img src={photoUrl} alt="Uploaded model" className="fit-model-image" />
            {fitting ? (
              <>
                <img
                  src={garment.overlayUrl}
                  alt={garment.name}
                  className="fit-overlay-image"
                  style={{
                    left: `${fitting.overlay.x}px`,
                    top: `${fitting.overlay.y}px`,
                    width: `${fitting.overlay.width}px`,
                    height: `${fitting.overlay.height}px`,
                    transform: `rotate(${fitting.overlay.rotation_deg}deg)`
                  }}
                />
                <div className="fit-landmarks">
                  {Object.entries(fitting.landmarks).map(([key, point]) => (
                    <span key={key} className="landmark-dot" style={{ left: `${point.x}px`, top: `${point.y}px` }} />
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div className="empty-state">
            <p>Upload a model photo to run body-tracked garment fitting.</p>
          </div>
        )}
      </div>
      <div className="fit-summary">
        <strong>{garment.name}</strong>
        <span>{garment.brand} | {garment.color} | {garment.silhouette}</span>
        <span>{fitting ? `${fitting.engine} confidence ${Math.round(fitting.confidence * 100)}%` : 'Waiting for fitting input'}</span>
      </div>
    </section>
  );
}
