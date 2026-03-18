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
      <p className="hint">Processed garments are stored here and can be reused across different model analyses.</p>
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
              <span className="garment-list-meta">{garment.category}</span>
              <span className="garment-list-meta">{garment.width} x {garment.height}</span>
              <span className="garment-list-badge">Processed</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
