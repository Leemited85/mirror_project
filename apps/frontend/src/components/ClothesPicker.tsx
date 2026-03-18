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
      <p className="hint">처리된 의류 자산이 저장되며, 여러 모델 분석 결과에 재사용할 수 있습니다.</p>
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
              <span className="garment-list-badge">처리 완료</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
