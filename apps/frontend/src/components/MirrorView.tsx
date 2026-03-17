import type { Garment } from '../types/fitting';

type OverlayPlacement = {
  top: number;
  left: number;
  width: number;
  opacity?: number;
};

type MirrorGarment = Garment & {
  placement: OverlayPlacement;
};

type MirrorViewProps = {
  photoUrl: string | null;
  garment: MirrorGarment;
};

export function MirrorView({ photoUrl, garment }: MirrorViewProps) {
  const placementStyle = {
    top: `${garment.placement.top}%`,
    left: `${garment.placement.left}%`,
    width: `${garment.placement.width}%`,
    opacity: garment.placement.opacity ?? 0.9
  };

  return (
    <section className="mirror panel">
      <div className="mirror-canvas">
        {photoUrl ? (
          <>
            <img src={photoUrl} alt="Uploaded model" className="photo-preview" />
            <img src={garment.overlayUrl} alt={`${garment.name} overlay`} className="overlay fitted-overlay" style={placementStyle} />
          </>
        ) : (
          <div className="empty-state">
            <p>Upload a photo to preview the garment overlay sample here.</p>
          </div>
        )}
      </div>
    </section>
  );
}
