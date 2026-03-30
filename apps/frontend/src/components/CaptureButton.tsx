type CaptureButtonProps = {
  onCapture: () => void;
  disabled?: boolean;
  label?: string;
};

export function CaptureButton({
  onCapture,
  disabled = false,
  label = 'Capture current frame and synthesize'
}: CaptureButtonProps) {
  return (
    <button type="button" className="capture-button" onClick={onCapture} disabled={disabled}>
      {label}
    </button>
  );
}
