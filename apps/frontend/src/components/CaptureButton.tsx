type CaptureButtonProps = {
  onCapture: () => void;
  disabled?: boolean;
  label?: string;
};

export function CaptureButton({ onCapture, disabled, label = 'Save Fit' }: CaptureButtonProps) {
  return (
    <button className="capture-button" onClick={onCapture} disabled={disabled}>
      {label}
    </button>
  );
}
