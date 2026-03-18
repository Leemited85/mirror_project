type CaptureButtonProps = {
  onCapture: () => void;
  disabled?: boolean;
  label?: string;
};

export function CaptureButton({ onCapture, disabled, label = '결과 이미지 저장' }: CaptureButtonProps) {
  return (
    <button type="button" className="capture-button" onClick={onCapture} disabled={disabled}>
      {label}
    </button>
  );
}
