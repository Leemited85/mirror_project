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
  resultImageUrl: string | null;
};

export function MirrorView({ photoUrl, garment, fitting, resultImageUrl }: MirrorViewProps) {
  return (
    <section className="mirror panel">
      <div className="fit-stage">
        {resultImageUrl ? (
          <img src={resultImageUrl} alt="Try-on result" className="fit-model-image" />
        ) : photoUrl ? (
          <img src={photoUrl} alt="Uploaded model" className="fit-model-image" />
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
