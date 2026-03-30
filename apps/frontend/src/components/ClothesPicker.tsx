import type { GarmentAsset } from '../types/fitting';

type ClothesPickerProps = {
  garments: GarmentAsset[];
  selectedGarmentId: string | null;
  onSelect: (garment: GarmentAsset) => void;
  isLoading: boolean;
};

export function ClothesPicker({ garments, selectedGarmentId, onSelect, isLoading }: ClothesPickerProps) {
  return (
    <aside className="panel sidebar">
      <h2>Garment Library</h2>
      <p className="hint">Use a processed 2D garment photo or upload a new item before running AI try-on.</p>
      {garments.length === 0 ? (
        <div className="empty-garment-state">
          <strong>No garment photos yet</strong>
          <p>Upload a front-facing garment photo in JPG, PNG, WEBP, or AVIF format.</p>
        </div>
      ) : (
        <div className="garment-list">
          {garments.map((garment) => {
            const selected = garment.id === selectedGarmentId;
            return (
              <button
                key={garment.id}
                type="button"
                className={`garment-item ${selected ? 'selected' : ''}`}
                onClick={() => onSelect(garment)}
                disabled={isLoading}
              >
                <div className="garment-card">
                  <div className="garment-thumbnail-shell">
                    <img
                      className="garment-thumbnail"
                      src={garment.processed_image_url || garment.original_image_url}
                      alt={garment.name}
                    />
                  </div>
                  <div className="garment-card-copy">
                    <span className="garment-list-title">{garment.name}</span>
                    <span className="garment-list-meta">{translateCategory(garment.category)}</span>
                    <span className="garment-list-meta">
                      {garment.width} x {garment.height}
                    </span>
                    <span className="garment-list-badge">2D photo ready</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function translateCategory(category: GarmentAsset['category']) {
  const labels: Record<GarmentAsset['category'], string> = {
    top: 'Top',
    bottom: 'Bottom',
    dress: 'Dress'
  };

  return labels[category];
}
