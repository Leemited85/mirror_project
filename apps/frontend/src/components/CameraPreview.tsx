import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import type { GarmentAsset, OverlayBox, PoseLandmarks } from '../types/fitting';
import { computeOverlayFromLandmarks, smoothOverlay } from '../utils/fittingGeometry';
import { drawGarmentRig } from '../utils/garmentRigRenderer';

type CameraPreviewProps = {
  garment: GarmentAsset | null;
  enableLiveOverlay?: boolean;
  showTrackingGuide?: boolean;
  onStatusChange?: (message: string, isConnected: boolean) => void;
  onTrackingChange?: (message: string, isTracking: boolean) => void;
};

type TrackingPointKey = keyof PoseLandmarks | 'head';

type TrackingPoint = {
  key: TrackingPointKey;
  x: number;
  y: number;
};

type TrackingRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CameraSnapshot = {
  imageDataUrl: string;
  frameWidth: number;
  frameHeight: number;
  landmarks: PoseLandmarks;
};

export type CameraPreviewHandle = {
  reconnect: () => Promise<void>;
  captureSnapshot: () => CameraSnapshot | null;
};

const OPENCV_SCRIPT_ID = 'opencv-js-runtime';
const OPENCV_SCRIPT_URL = 'https://docs.opencv.org/4.x/opencv.js';
const TRACKING_AREA_THRESHOLD = 2500;
const DEFAULT_MESSAGE = '카메라 연결 상태를 확인하고 있습니다.';

export const CameraPreview = forwardRef<CameraPreviewHandle, CameraPreviewProps>(function CameraPreview(
  { garment, enableLiveOverlay = true, showTrackingGuide = true, onStatusChange, onTrackingChange },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previousFrameRef = useRef<any>(null);
  const lastTrackedRectRef = useRef<TrackingRect | null>(null);
  const smoothedOverlayRef = useRef<OverlayBox | null>(null);
  const garmentImageRef = useRef<HTMLImageElement | null>(null);
  const lastCameraStatusRef = useRef<string | null>(null);
  const lastTrackingStatusRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [trackingReady, setTrackingReady] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  useImperativeHandle(
    ref,
    () => ({
      reconnect: connectCamera,
      captureSnapshot: () => {
        if (!videoRef.current) {
          return null;
        }

        const video = videoRef.current;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
          return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext('2d');
        if (!context) {
          return null;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const rect = lastTrackedRectRef.current ?? buildFallbackRect(canvas.width, canvas.height);

        return {
          imageDataUrl: canvas.toDataURL('image/png'),
          frameWidth: canvas.width,
          frameHeight: canvas.height,
          landmarks: buildLandmarksFromRect(rect)
        };
      }
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        await connectCamera();
        if (cancelled) {
          return;
        }

        await ensureOpenCvLoaded();
        if (cancelled) {
          return;
        }

        startTrackingLoop();
      } catch {
        // Surface errors through the status panel only.
      }
    }

    void setup();

    return () => {
      cancelled = true;
      stopTrackingLoop();
      stopCamera();
      releasePreviousFrame();
    };
  }, []);

  useEffect(() => {
    smoothedOverlayRef.current = null;
  }, [garment?.id]);

  useEffect(() => {
    if (!garment?.processed_image_url) {
      garmentImageRef.current = null;
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!cancelled) {
        garmentImageRef.current = image;
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        garmentImageRef.current = null;
      }
    };
    image.src = garment.processed_image_url;

    return () => {
      cancelled = true;
    };
  }, [garment?.processed_image_url]);

  async function connectCamera() {
    setIsLoading(true);
    setMessage(DEFAULT_MESSAGE);

    if (!navigator.mediaDevices?.getUserMedia) {
      const nextMessage = '이 브라우저는 카메라 접근을 지원하지 않습니다.';
      setIsConnected(false);
      setIsLoading(false);
      setMessage(nextMessage);
      emitCameraStatus(nextMessage, false);
      throw new Error(nextMessage);
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
      emitCameraStatus(nextMessage, true);
    } catch (caught) {
      const nextMessage = buildCameraErrorMessage(caught);
      setIsConnected(false);
      setIsLoading(false);
      setMessage(nextMessage);
      emitCameraStatus(nextMessage, false);
      throw caught;
    }
  }

  async function ensureOpenCvLoaded() {
    if (window.cv?.Mat) {
      const nextMessage = 'OpenCV가 준비되었습니다. 사용자 추적을 시작합니다.';
      setTrackingReady(true);
      emitTrackingStatus(nextMessage, true);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(OPENCV_SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('OpenCV 스크립트를 불러오지 못했습니다.')), {
          once: true
        });
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

    const startedAt = Date.now();
    while (!window.cv?.Mat) {
      if (Date.now() - startedAt > 15000) {
        const nextMessage = 'OpenCV 초기화 시간이 초과되었습니다.';
        setTrackingReady(false);
        emitTrackingStatus(nextMessage, false);
        throw new Error(nextMessage);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const nextMessage = 'OpenCV가 준비되었습니다. 사용자 추적을 시작합니다.';
    setTrackingReady(true);
    emitTrackingStatus(nextMessage, true);
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
      const initialRect = buildFallbackRect(video.videoWidth, video.videoHeight);
      lastTrackedRectRef.current = initialRect;
      drawOverlayForRect(overlayContext, initialRect, true, video.videoHeight);
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
    cv.threshold(diff, threshold, 18, 255, cv.THRESH_BINARY);
    cv.dilate(threshold, threshold, kernel);
    cv.findContours(threshold, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let biggestRect: TrackingRect | null = null;
    let biggestArea = 0;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const area = cv.contourArea(contour);
      if (area > TRACKING_AREA_THRESHOLD && area > biggestArea) {
        biggestRect = cv.boundingRect(contour);
        biggestArea = area;
      }
      contour.delete();
    }

    const resolvedRect = biggestRect ?? lastTrackedRectRef.current ?? buildFallbackRect(video.videoWidth, video.videoHeight);
    lastTrackedRectRef.current = resolvedRect;
    drawOverlayForRect(overlayContext, resolvedRect, !biggestRect, video.videoHeight);
    emitTrackingStatus(
      biggestRect ? 'OpenCV 기반으로 사용자를 추적 중입니다.' : '움직임이 적어 기본 추정 가이드를 유지하고 있습니다.',
      true
    );

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

  function drawOverlayForRect(
    context: CanvasRenderingContext2D,
    rect: TrackingRect,
    isFallback: boolean,
    frameHeight: number
  ) {
    const landmarks = buildLandmarksFromRect(rect);

    if (enableLiveOverlay && garment && garmentImageRef.current) {
      const nextOverlay = computeOverlayFromLandmarks(landmarks, frameHeight, garment.width, garment.height);
      const smoothed = smoothOverlay(smoothedOverlayRef.current, nextOverlay);
      smoothedOverlayRef.current = smoothed;
      if (garment.rig) {
        drawGarmentRig(context, garment, garmentImageRef.current, landmarks, frameHeight);
      } else {
        drawGarmentOverlay(context, garmentImageRef.current, smoothed);
      }
    }

    if (showTrackingGuide) {
      drawTrackedBody(context, rect, isFallback);
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

  function releasePreviousFrame() {
    if (previousFrameRef.current) {
      previousFrameRef.current.delete();
      previousFrameRef.current = null;
    }
  }

  function emitCameraStatus(nextMessage: string, isNextConnected: boolean) {
    if (lastCameraStatusRef.current === nextMessage) {
      return;
    }

    lastCameraStatusRef.current = nextMessage;
    onStatusChange?.(nextMessage, isNextConnected);
  }

  function emitTrackingStatus(nextMessage: string, isNextTracking: boolean) {
    if (lastTrackingStatusRef.current === nextMessage) {
      return;
    }

    lastTrackingStatusRef.current = nextMessage;
    onTrackingChange?.(nextMessage, isNextTracking);
  }

  return (
    <section className="panel">
      <div className="photo-meta">
        <span className="photo-label">실시간 카메라</span>
        <strong>{isConnected ? '카메라 미리보기가 연결됨' : '카메라 연결 필요'}</strong>
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
              <p>브라우저 권한과 장치 연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
            </div>
          </div>
        )}
      </div>

      <div className="camera-summary">
        <span>카메라: {isConnected ? '연결됨' : isLoading ? '확인 중' : '연결 실패'}</span>
        <span>추적: {trackingReady ? '가이드 표시 중' : '준비 중'}</span>
        <button type="button" className="secondary-action-button" onClick={() => void connectCamera()}>
          카메라 다시 연결
        </button>
      </div>
    </section>
  );
});

function buildFallbackRect(width: number, height: number): TrackingRect {
  return {
    x: Math.round(width * 0.24),
    y: Math.round(height * 0.12),
    width: Math.round(width * 0.52),
    height: Math.round(height * 0.72)
  };
}

function buildLandmarksFromRect(rect: TrackingRect): PoseLandmarks {
  const points = buildPointsFromRect(rect);
  return {
    neck: toPosePoint(points.neck),
    left_shoulder: toPosePoint(points.left_shoulder),
    right_shoulder: toPosePoint(points.right_shoulder),
    left_elbow: toPosePoint(points.left_elbow),
    right_elbow: toPosePoint(points.right_elbow),
    left_wrist: toPosePoint(points.left_wrist),
    right_wrist: toPosePoint(points.right_wrist),
    left_hip: toPosePoint(points.left_hip),
    right_hip: toPosePoint(points.right_hip)
  };
}

function buildPointsFromRect(rect: TrackingRect): Record<TrackingPointKey, TrackingPoint> {
  return {
    head: { key: 'head', x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.12 },
    neck: { key: 'neck', x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.22 },
    left_shoulder: { key: 'left_shoulder', x: rect.x + rect.width * 0.28, y: rect.y + rect.height * 0.28 },
    right_shoulder: { key: 'right_shoulder', x: rect.x + rect.width * 0.72, y: rect.y + rect.height * 0.28 },
    left_elbow: { key: 'left_elbow', x: rect.x + rect.width * 0.18, y: rect.y + rect.height * 0.5 },
    right_elbow: { key: 'right_elbow', x: rect.x + rect.width * 0.82, y: rect.y + rect.height * 0.5 },
    left_wrist: { key: 'left_wrist', x: rect.x + rect.width * 0.15, y: rect.y + rect.height * 0.88 },
    right_wrist: { key: 'right_wrist', x: rect.x + rect.width * 0.85, y: rect.y + rect.height * 0.88 },
    left_hip: { key: 'left_hip', x: rect.x + rect.width * 0.38, y: rect.y + rect.height * 0.72 },
    right_hip: { key: 'right_hip', x: rect.x + rect.width * 0.62, y: rect.y + rect.height * 0.72 }
  };
}

function toPosePoint(point: TrackingPoint) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y)
  };
}

function drawGarmentOverlay(context: CanvasRenderingContext2D, image: HTMLImageElement, overlay: OverlayBox) {
  context.save();
  context.translate(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2);
  context.rotate((overlay.rotation_deg * Math.PI) / 180);
  context.globalAlpha = 0.92;
  context.drawImage(image, -overlay.width / 2, -overlay.height / 2, overlay.width, overlay.height);
  context.restore();
}

function drawTrackedBody(context: CanvasRenderingContext2D, rect: TrackingRect, isFallback: boolean) {
  const points = buildPointsFromRect(rect);
  const orderedPoints: TrackingPoint[] = [
    points.head,
    points.neck,
    points.left_shoulder,
    points.right_shoulder,
    points.left_elbow,
    points.right_elbow,
    points.left_wrist,
    points.right_wrist,
    points.left_hip,
    points.right_hip
  ];

  context.strokeStyle = isFallback ? 'rgba(245, 158, 11, 0.95)' : 'rgba(56, 189, 248, 0.95)';
  context.fillStyle = 'rgba(249, 115, 22, 0.95)';
  context.lineWidth = 3;
  context.font = '12px Segoe UI';

  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.fillStyle = 'rgba(34, 29, 24, 0.82)';
  context.fillRect(rect.x, Math.max(0, rect.y - 24), 170, 20);
  context.fillStyle = '#ffffff';
  context.fillText(isFallback ? 'tracking: fallback guide' : 'tracking: active contour', rect.x + 8, Math.max(14, rect.y - 10));

  context.strokeStyle = isFallback ? 'rgba(245, 158, 11, 0.95)' : 'rgba(56, 189, 248, 0.95)';
  drawLine(context, points.neck, points.left_shoulder);
  drawLine(context, points.neck, points.right_shoulder);
  drawLine(context, points.left_shoulder, points.left_elbow);
  drawLine(context, points.left_elbow, points.left_wrist);
  drawLine(context, points.right_shoulder, points.right_elbow);
  drawLine(context, points.right_elbow, points.right_wrist);
  drawLine(context, points.left_shoulder, points.left_hip);
  drawLine(context, points.right_shoulder, points.right_hip);
  drawLine(context, points.left_hip, points.right_hip);

  for (const point of orderedPoints) {
    context.fillStyle = 'rgba(249, 115, 22, 0.95)';
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
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
      return '카메라 권한이 거부되었습니다. 브라우저 권한을 허용해 주세요.';
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
