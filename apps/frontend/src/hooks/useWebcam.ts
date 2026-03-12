import { useCallback, useEffect, useRef, useState } from 'react';

export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user'
        },
        audio: false
      });

      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Video element is not mounted.');
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsReady(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to access webcam.';
      setError(message);
      setIsReady(false);
    }
  }, []);

  useEffect(() => {
    void start();

    return () => {
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [start]);

  return { videoRef, isReady, error, start };
}
