import type { Garment } from '../types/fitting';

type MirrorGarment = Garment & {
  brand: string;
  color: string;
  silhouette: string;
};

type MirrorViewProps = {
  photoUrl: string | null;
  garment: MirrorGarment;
};

export function MirrorView({ photoUrl, garment }: MirrorViewProps) {
  return (
    <section className="mirror panel">
      <div className="sample-board">
        <article className="sample-card">
          <div className="sample-card-header">
            <span>Model Photo</span>
          </div>
          <div className="sample-card-body model-stage">
            {photoUrl ? (
              <img src={photoUrl} alt="Uploaded model" className="stage-image model-image" />
            ) : (
              <div className="empty-state">
                <p>Upload a portrait photo to compare it with the selected garment.</p>
              </div>
            )}
          </div>
        </article>

        <article className="sample-card">
          <div className="sample-card-header">
            <span>Garment Reference</span>
          </div>
          <div className="sample-card-body garment-stage">
            <img src={garment.thumbnailUrl} alt={garment.name} className="stage-image garment-image" />
          </div>
          <div className="sample-card-footer">
            <strong>{garment.name}</strong>
            <span>{garment.brand}</span>
            <span>{garment.color} | {garment.silhouette}</span>
          </div>
        </article>
      </div>
    </section>
  );
}
