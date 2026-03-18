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
      <h2>의류 라이브러리</h2>
      <p className="hint">처리된 의류 자산을 저장해두고, 원하는 모델 이미지에 다시 적용할 수 있습니다.</p>
      <div className="garment-list">
        {garments.map((garment) => {
          const selected = garment.id === selectedGarmentId;
          return (
            <button
              key={garment.id}
              type="button"
              className={`garment-item garment-list-item ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(garment)}
              disabled={isLoading}
            >
              <span className="garment-list-title">{garment.name}</span>
              <span className="garment-list-meta">{translateCategory(garment.category)}</span>
              <span className="garment-list-meta">
                {garment.width} x {garment.height}
              </span>
              <span className="garment-list-badge">처리 완료</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function translateCategory(category: GarmentAsset['category']) {
  const labels: Record<GarmentAsset['category'], string> = {
    top: '상의',
    bottom: '하의',
    dress: '원피스'
  };

  return labels[category];
}
