import { useEffect, useRef, useState } from 'react';

type CameraPreviewProps = {
  onStatusChange?: (message: string, isConnected: boolean) => void;
};

export function CameraPreview({ onStatusChange }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState('카메라 연결을 확인하고 있습니다.');

  useEffect(() => {
    void connectCamera();

    return () => {
      stopCamera();
    };
  }, []);

  async function connectCamera() {
    setIsLoading(true);
    setMessage('카메라 연결을 확인하고 있습니다.');

    if (!navigator.mediaDevices?.getUserMedia) {
      const nextMessage = '이 브라우저는 카메라 접근을 지원하지 않습니다.';
      setIsConnected(false);
      setIsLoading(false);
      setMessage(nextMessage);
      onStatusChange?.(nextMessage, false);
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user'
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const nextMessage = '카메라가 연결되었습니다.';
      setIsConnected(true);
      setIsLoading(false);
      setMessage(nextMessage);
      onStatusChange?.(nextMessage, true);
    } catch (caught) {
      const nextMessage = buildCameraErrorMessage(caught);
      setIsConnected(false);
      setIsLoading(false);
      setMessage(nextMessage);
      onStatusChange?.(nextMessage, false);
    }
  }

  function stopCamera() {
    if (!streamRef.current) {
      return;
    }

    for (const track of streamRef.current.getTracks()) {
      track.stop();
    }
    streamRef.current = null;
  }

  return (
    <section className="panel">
      <div className="photo-meta">
        <span className="photo-label">실시간 카메라</span>
        <strong>{isConnected ? '카메라 미리보기 연결됨' : '카메라 연결 필요'}</strong>
        <p>{message}</p>
      </div>

      <div className="camera-stage">
        {isConnected ? (
          <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
        ) : (
          <div className="empty-state">
            <div>
              <strong>{isLoading ? '카메라 연결 중입니다.' : '카메라 화면을 표시할 수 없습니다.'}</strong>
              <p>브라우저 권한과 장치 연결 상태를 확인한 뒤 다시 시도하세요.</p>
            </div>
          </div>
        )}
      </div>

      <div className="camera-summary">
        <span>상태: {isConnected ? '연결됨' : isLoading ? '확인 중' : '연결 실패'}</span>
        <button type="button" className="secondary-action-button" onClick={() => void connectCamera()}>
          카메라 다시 연결
        </button>
      </div>
    </section>
  );
}

function buildCameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return '카메라 권한이 거부되었습니다. 브라우저 권한을 허용해주세요.';
    }
    if (error.name === 'NotFoundError') {
      return '사용 가능한 카메라 장치를 찾지 못했습니다.';
    }
    if (error.name === 'NotReadableError') {
      return '카메라가 다른 프로그램에서 사용 중입니다.';
    }
    return `카메라 연결 중 오류가 발생했습니다: ${error.message}`;
  }

  return '카메라 연결 중 알 수 없는 오류가 발생했습니다.';
}
