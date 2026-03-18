import type { Garment } from '../types/fitting';

type ClothesPickerProps = {
  garments: Garment[];
  selectedGarmentId: string | null;
  onSelect: (garment: Garment) => void;
  isLoading: boolean;
};

export function ClothesPicker({ garments, selectedGarmentId, onSelect, isLoading }: ClothesPickerProps) {
  return (
    <aside className="panel sidebar">
      <h2>Clothes</h2>
      <p className="hint">Select a processed garment image or add a new garment from the header.</p>
      <div className="garment-list">
        {garments.map((garment) => {
          const selected = garment.id === selectedGarmentId;
          return (
            <button
              key={garment.id}
              className={`garment-item ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(garment)}
              disabled={isLoading}
            >
              <img src={garment.thumbnailUrl} alt={garment.name} />
              <span>{garment.name}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
