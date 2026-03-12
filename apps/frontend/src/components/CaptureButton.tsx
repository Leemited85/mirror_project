type CaptureButtonProps = {
  onCapture: () => void;
  disabled?: boolean;
};

export function CaptureButton({ onCapture, disabled }: CaptureButtonProps) {
  return (
    <button className="capture-button" onClick={onCapture} disabled={disabled}>
      Capture
    </button>
  );
}
