import { useEffect, useRef, useState } from 'react';

type CameraPreviewProps = {
  onStatusChange?: (message: string, isConnected: boolean) => void;
  onTrackingChange?: (message: string, isTracking: boolean) => void;
};

type TrackingPoint = {
  key: string;
  x: number;
  y: number;
};

const OPENCV_SCRIPT_ID = 'opencv-js-runtime';
const OPENCV_SCRIPT_URL = 'https://docs.opencv.org/4.x/opencv.js';

export function CameraPreview({ onStatusChange, onTrackingChange }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previousFrameRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [trackingReady, setTrackingReady] = useState(false);
  const [message, setMessage] = useState('카메라 연결을 확인하고 있습니다.');

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      await connectCamera();
      if (cancelled) {
        return;
      }
      await ensureOpenCvLoaded();
      if (cancelled) {
        return;
      }
      startTrackingLoop();
    }

    void setup();

    return () => {
      cancelled = true;
      stopTrackingLoop();
      stopCamera();
      releasePreviousFrame();
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

  async function ensureOpenCvLoaded() {
    if (window.cv?.Mat) {
      const nextMessage = 'OpenCV가 준비되었습니다. 실시간 추적을 시작합니다.';
      setTrackingReady(true);
      onTrackingChange?.(nextMessage, true);
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const existing = document.getElementById(OPENCV_SCRIPT_ID) as HTMLScriptElement | null;
        if (existing) {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('OpenCV 스크립트를 불러오지 못했습니다.')), { once: true });
          return;
      }

      const script = document.createElement('script');
      script.id = OPENCV_SCRIPT_ID;
      script.async = true;
      script.src = OPENCV_SCRIPT_URL;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('OpenCV 스크립트를 불러오지 못했습니다.'));
        document.head.appendChild(script);
      });

      const waitUntilReady = async () => {
        const startedAt = Date.now();
        while (!window.cv?.Mat) {
          if (Date.now() - startedAt > 15000) {
            throw new Error('OpenCV 초기화 시간이 초과되었습니다.');
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      };

      await waitUntilReady();
      const nextMessage = 'OpenCV가 준비되었습니다. 실시간 추적을 시작합니다.';
      setTrackingReady(true);
      onTrackingChange?.(nextMessage, true);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'OpenCV 로드에 실패했습니다.';
      setTrackingReady(false);
      onTrackingChange?.(nextMessage, false);
      throw error;
    }
  }

  function startTrackingLoop() {
    stopTrackingLoop();

    const render = () => {
      animationFrameRef.current = window.requestAnimationFrame(render);
      trackBody();
    };

    animationFrameRef.current = window.requestAnimationFrame(render);
  }

  function stopTrackingLoop() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }

  function trackBody() {
    if (!trackingReady || !videoRef.current || !overlayCanvasRef.current || !bufferCanvasRef.current || !window.cv?.Mat) {
      return;
    }

    const video = videoRef.current;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const overlayCanvas = overlayCanvasRef.current;
    const bufferCanvas = bufferCanvasRef.current;
    const overlayContext = overlayCanvas.getContext('2d');
    const bufferContext = bufferCanvas.getContext('2d');
    if (!overlayContext || !bufferContext) {
      return;
    }

    if (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight) {
      overlayCanvas.width = video.videoWidth;
      overlayCanvas.height = video.videoHeight;
    }
    if (bufferCanvas.width !== video.videoWidth || bufferCanvas.height !== video.videoHeight) {
      bufferCanvas.width = video.videoWidth;
      bufferCanvas.height = video.videoHeight;
    }

    bufferContext.drawImage(video, 0, 0, bufferCanvas.width, bufferCanvas.height);
    const frame = bufferContext.getImageData(0, 0, bufferCanvas.width, bufferCanvas.height);
    const cv = window.cv;
    const source = cv.matFromImageData(frame);
    const gray = new cv.Mat();
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(7, 7), 0, 0, cv.BORDER_DEFAULT);

    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!previousFrameRef.current) {
      previousFrameRef.current = gray.clone();
      source.delete();
      gray.delete();
      return;
    }

    const diff = new cv.Mat();
    const threshold = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);

    cv.absdiff(gray, previousFrameRef.current, diff);
    cv.threshold(diff, threshold, 25, 255, cv.THRESH_BINARY);
    cv.dilate(threshold, threshold, kernel);
    cv.findContours(threshold, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let biggestRect: { x: number; y: number; width: number; height: number } | null = null;
    let biggestArea = 0;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const area = cv.contourArea(contour);
      if (area > 9000 && area > biggestArea) {
        const rect = cv.boundingRect(contour);
        biggestRect = rect;
        biggestArea = area;
      }
      contour.delete();
    }

    if (biggestRect) {
      drawTrackedBody(overlayContext, biggestRect);
      onTrackingChange?.('OpenCV 기반 신체 포인트를 추적 중입니다.', true);
    }

    previousFrameRef.current.delete();
    previousFrameRef.current = gray.clone();

    source.delete();
    gray.delete();
    diff.delete();
    threshold.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();
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

  function releasePreviousFrame() {
    if (previousFrameRef.current) {
      previousFrameRef.current.delete();
      previousFrameRef.current = null;
    }
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
          <>
            <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
            <canvas ref={overlayCanvasRef} className="tracking-overlay" />
            <canvas ref={bufferCanvasRef} className="tracking-buffer" />
          </>
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
        <span>카메라: {isConnected ? '연결됨' : isLoading ? '확인 중' : '연결 실패'}</span>
        <span>트래킹: {trackingReady ? '활성화됨' : '준비 중'}</span>
        <button type="button" className="secondary-action-button" onClick={() => void connectCamera()}>
          카메라 다시 연결
        </button>
      </div>
    </section>
  );
}

function drawTrackedBody(context: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }) {
  const points: TrackingPoint[] = [
    { key: 'head', x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.12 },
    { key: 'neck', x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.22 },
    { key: 'left_shoulder', x: rect.x + rect.width * 0.28, y: rect.y + rect.height * 0.28 },
    { key: 'right_shoulder', x: rect.x + rect.width * 0.72, y: rect.y + rect.height * 0.28 },
    { key: 'left_hip', x: rect.x + rect.width * 0.38, y: rect.y + rect.height * 0.72 },
    { key: 'right_hip', x: rect.x + rect.width * 0.62, y: rect.y + rect.height * 0.72 }
  ];

  context.strokeStyle = 'rgba(56, 189, 248, 0.95)';
  context.lineWidth = 3;
  context.fillStyle = 'rgba(249, 115, 22, 0.95)';
  context.font = '12px Segoe UI';

  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  drawLine(context, points[1], points[2]);
  drawLine(context, points[1], points[3]);
  drawLine(context, points[2], points[4]);
  drawLine(context, points[3], points[5]);
  drawLine(context, points[4], points[5]);

  for (const point of points) {
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.fill();
    context.fillText(point.key, point.x + 10, point.y - 8);
  }
}

function drawLine(context: CanvasRenderingContext2D, from: TrackingPoint, to: TrackingPoint) {
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
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
