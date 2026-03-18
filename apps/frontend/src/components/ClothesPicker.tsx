import type { Garment } from '../types/fitting';

type ListGarment = Garment & {
  brand: string;
  color: string;
  silhouette: string;
  source: 'bundled' | 'uploaded';
};

type ClothesPickerProps = {
  garments: ListGarment[];
  selectedGarmentId: string | null;
  onSelect: (garment: Garment) => void;
  isLoading: boolean;
};

export function ClothesPicker({ garments, selectedGarmentId, onSelect, isLoading }: ClothesPickerProps) {
  return (
    <aside className="panel sidebar">
      <h2>Garments</h2>
      <p className="hint">Registered garments are processed in the background and listed here for fitting.</p>
      <div className="garment-list">
        {garments.map((garment) => {
          const selected = garment.id === selectedGarmentId;
          return (
            <button
              key={garment.id}
              className={`garment-item garment-list-item ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(garment)}
              disabled={isLoading}
            >
              <span className="garment-list-title">{garment.name}</span>
              <span className="garment-list-meta">{garment.brand} | {garment.color}</span>
              <span className="garment-list-meta">{garment.silhouette}</span>
              <span className="garment-list-badge">{garment.source === 'uploaded' ? 'Processed' : 'Sample'}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
