import { RefObject } from 'react';

type MirrorViewProps = {
  videoRef: RefObject<HTMLVideoElement>;
  overlayUrl: string | null;
};

export function MirrorView({ videoRef, overlayUrl }: MirrorViewProps) {
  return (
    <section className="mirror panel">
      <div className="mirror-canvas">
        <video ref={videoRef} muted playsInline className="webcam" />
        {overlayUrl ? <img src={overlayUrl} alt="Garment overlay" className="overlay" /> : null}
      </div>
    </section>
  );
}
