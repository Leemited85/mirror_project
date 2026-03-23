import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import type { GarmentAsset, OverlayBox, PoseLandmarks, PosePoint } from '../types/fitting';
import { computeOverlayFromLandmarks, smoothOverlay } from '../utils/fittingGeometry';
import { drawGarmentRig } from '../utils/garmentRigRenderer';

type CameraPreviewProps = {
  garment: GarmentAsset | null;
  enableLiveOverlay?: boolean;
  showTrackingGuide?: boolean;
  onStatusChange?: (message: string, isConnected: boolean) => void;
  onTrackingChange?: (message: string, isTracking: boolean) => void;
};

type CameraSnapshot = {
  imageDataUrl: string;
  frameWidth: number;
  frameHeight: number;
  landmarks: PoseLandmarks;
};

export type CameraPreviewHandle = {
  reconnect: () => Promise<void>;
  captureSnapshot: () => CameraSnapshot | null;
};

type PoseLikeResult = {
  poseLandmarks?: Array<{ x: number; y: number; visibility?: number }>;
};

type PoseLikeInstance = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (callback: (results: PoseLikeResult) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
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

const MEDIAPIPE_POSE_SCRIPT_ID = 'mediapipe-pose-runtime';
const MEDIAPIPE_POSE_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js';
const DEFAULT_MESSAGE = '카메라 연결 상태를 확인하고 있습니다.';
const MIN_VISIBILITY = 0.45;
const LANDMARK_SMOOTHING_ALPHA = 0.28;
const FALLBACK_LOSS_FRAMES = 18;

export const CameraPreview = forwardRef<CameraPreviewHandle, CameraPreviewProps>(function CameraPreview(
  { garment, enableLiveOverlay = true, showTrackingGuide = true, onStatusChange, onTrackingChange },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const poseRef = useRef<PoseLikeInstance | null>(null);
  const poseBusyRef = useRef(false);
  const garmentImageRef = useRef<HTMLImageElement | null>(null);
  const smoothedOverlayRef = useRef<OverlayBox | null>(null);
  const lastTrackedRectRef = useRef<TrackingRect | null>(null);
  const currentLandmarksRef = useRef<PoseLandmarks | null>(null);
  const missedFramesRef = useRef(0);
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
        const video = videoRef.current;
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
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
        const landmarks =
          currentLandmarksRef.current ?? buildLandmarksFromRect(lastTrackedRectRef.current ?? buildFallbackRect(canvas.width, canvas.height));

        return {
          imageDataUrl: canvas.toDataURL('image/png'),
          frameWidth: canvas.width,
          frameHeight: canvas.height,
          landmarks
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

        await ensurePoseLoaded();
        if (cancelled) {
          return;
        }

        startTrackingLoop();
      } catch {
        // Errors are surfaced through status callbacks and panel text.
      }
    }

    void setup();

    return () => {
      cancelled = true;
      stopTrackingLoop();
      stopCamera();
      poseRef.current = null;
      currentLandmarksRef.current = null;
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
        video: { facingMode: 'user' },
        audio: false
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
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

  async function ensurePoseLoaded() {
    if (poseRef.current) {
      setTrackingReady(true);
      emitTrackingStatus('MediaPipe Pose가 준비되었습니다. 실시간 추적을 시작합니다.', true);
      return;
    }

    await loadScript(MEDIAPIPE_POSE_SCRIPT_ID, MEDIAPIPE_POSE_SCRIPT_URL, 'MediaPipe Pose 스크립트를 불러오지 못했습니다.');

    if (!window.Pose) {
      const nextMessage = 'MediaPipe Pose 전역 객체를 찾지 못했습니다.';
      emitTrackingStatus(nextMessage, false);
      throw new Error(nextMessage);
    }

    const pose = new window.Pose({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    }) as PoseLikeInstance;

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
    });
    pose.onResults(handlePoseResults);

    poseRef.current = pose;
    setTrackingReady(true);
    emitTrackingStatus('MediaPipe Pose가 준비되었습니다. 실시간 추적을 시작합니다.', true);
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
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!video || !overlayCanvas) {
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const overlayContext = overlayCanvas.getContext('2d');
    if (!overlayContext) {
      return;
    }

    if (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight) {
      overlayCanvas.width = video.videoWidth;
      overlayCanvas.height = video.videoHeight;
    }

    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const landmarks =
      currentLandmarksRef.current ?? buildLandmarksFromRect(lastTrackedRectRef.current ?? buildFallbackRect(video.videoWidth, video.videoHeight));
    const rect = landmarksToRect(landmarks, video.videoWidth, video.videoHeight);
    lastTrackedRectRef.current = rect;
    drawOverlayForLandmarks(overlayContext, landmarks, rect, currentLandmarksRef.current === null, video.videoHeight);

    if (trackingReady && poseRef.current && !poseBusyRef.current) {
      poseBusyRef.current = true;
      void poseRef.current
        .send({ image: video })
        .catch(() => {
          missedFramesRef.current += 1;
        })
        .finally(() => {
          poseBusyRef.current = false;
        });
    }
  }

  function handlePoseResults(results: PoseLikeResult) {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const mapped = mapPoseResultsToLandmarks(results.poseLandmarks, video.videoWidth, video.videoHeight);
    if (!mapped) {
      missedFramesRef.current += 1;
      if (missedFramesRef.current > FALLBACK_LOSS_FRAMES) {
        currentLandmarksRef.current = null;
      }
      emitTrackingStatus('신체를 다시 찾는 중입니다. 카메라 중앙으로 들어와 주세요.', false);
      return;
    }

    missedFramesRef.current = 0;
    currentLandmarksRef.current = smoothLandmarks(currentLandmarksRef.current, mapped, LANDMARK_SMOOTHING_ALPHA);
    emitTrackingStatus('MediaPipe Pose로 신체를 추적 중입니다.', true);
  }

  function drawOverlayForLandmarks(
    context: CanvasRenderingContext2D,
    landmarks: PoseLandmarks,
    rect: TrackingRect,
    isFallback: boolean,
    frameHeight: number
  ) {
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
      drawTrackedBody(context, landmarks, rect, isFallback);
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
        <span>추적: {trackingReady ? 'MediaPipe Pose 동작 중' : '준비 중'}</span>
        <button type="button" className="secondary-action-button" onClick={() => void connectCamera()}>
          카메라 다시 연결
        </button>
      </div>
    </section>
  );
});

function drawGarmentOverlay(context: CanvasRenderingContext2D, image: HTMLImageElement, overlay: OverlayBox) {
  context.save();
  context.translate(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2);
  context.rotate((overlay.rotation_deg * Math.PI) / 180);
  context.globalAlpha = 0.92;
  context.drawImage(image, -overlay.width / 2, -overlay.height / 2, overlay.width, overlay.height);
  context.restore();
}

function drawTrackedBody(
  context: CanvasRenderingContext2D,
  landmarks: PoseLandmarks,
  rect: TrackingRect,
  isFallback: boolean
) {
  const points = buildPointsFromLandmarks(landmarks);
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
  context.fillRect(rect.x, Math.max(0, rect.y - 24), 200, 20);
  context.fillStyle = '#ffffff';
  context.fillText(isFallback ? 'tracking: fallback guide' : 'tracking: mediapipe pose', rect.x + 8, Math.max(14, rect.y - 10));

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
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
  }
}

function drawLine(context: CanvasRenderingContext2D, from: TrackingPoint, to: TrackingPoint) {
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}

function buildPointsFromLandmarks(landmarks: PoseLandmarks): Record<TrackingPointKey, TrackingPoint> {
  return {
    head: { key: 'head', x: landmarks.neck.x, y: landmarks.neck.y - 42 },
    neck: { key: 'neck', x: landmarks.neck.x, y: landmarks.neck.y },
    left_shoulder: { key: 'left_shoulder', x: landmarks.left_shoulder.x, y: landmarks.left_shoulder.y },
    right_shoulder: { key: 'right_shoulder', x: landmarks.right_shoulder.x, y: landmarks.right_shoulder.y },
    left_elbow: { key: 'left_elbow', x: landmarks.left_elbow?.x ?? landmarks.left_shoulder.x, y: landmarks.left_elbow?.y ?? landmarks.left_shoulder.y },
    right_elbow: { key: 'right_elbow', x: landmarks.right_elbow?.x ?? landmarks.right_shoulder.x, y: landmarks.right_elbow?.y ?? landmarks.right_shoulder.y },
    left_wrist: { key: 'left_wrist', x: landmarks.left_wrist?.x ?? landmarks.left_hip.x, y: landmarks.left_wrist?.y ?? landmarks.left_hip.y },
    right_wrist: { key: 'right_wrist', x: landmarks.right_wrist?.x ?? landmarks.right_hip.x, y: landmarks.right_wrist?.y ?? landmarks.right_hip.y },
    left_hip: { key: 'left_hip', x: landmarks.left_hip.x, y: landmarks.left_hip.y },
    right_hip: { key: 'right_hip', x: landmarks.right_hip.x, y: landmarks.right_hip.y }
  };
}

function buildFallbackRect(width: number, height: number): TrackingRect {
  return {
    x: Math.round(width * 0.24),
    y: Math.round(height * 0.12),
    width: Math.round(width * 0.52),
    height: Math.round(height * 0.72)
  };
}

function buildLandmarksFromRect(rect: TrackingRect): PoseLandmarks {
  return {
    neck: point(rect.x + rect.width * 0.5, rect.y + rect.height * 0.22),
    left_shoulder: point(rect.x + rect.width * 0.28, rect.y + rect.height * 0.28),
    right_shoulder: point(rect.x + rect.width * 0.72, rect.y + rect.height * 0.28),
    left_elbow: point(rect.x + rect.width * 0.18, rect.y + rect.height * 0.5),
    right_elbow: point(rect.x + rect.width * 0.82, rect.y + rect.height * 0.5),
    left_wrist: point(rect.x + rect.width * 0.15, rect.y + rect.height * 0.88),
    right_wrist: point(rect.x + rect.width * 0.85, rect.y + rect.height * 0.88),
    left_hip: point(rect.x + rect.width * 0.38, rect.y + rect.height * 0.72),
    right_hip: point(rect.x + rect.width * 0.62, rect.y + rect.height * 0.72)
  };
}

function landmarksToRect(landmarks: PoseLandmarks, frameWidth: number, frameHeight: number): TrackingRect {
  const candidates = [
    landmarks.neck,
    landmarks.left_shoulder,
    landmarks.right_shoulder,
    landmarks.left_elbow,
    landmarks.right_elbow,
    landmarks.left_wrist,
    landmarks.right_wrist,
    landmarks.left_hip,
    landmarks.right_hip
  ].filter(Boolean) as PosePoint[];

  const minX = Math.max(0, Math.min(...candidates.map((point) => point.x)) - 28);
  const maxX = Math.min(frameWidth, Math.max(...candidates.map((point) => point.x)) + 28);
  const minY = Math.max(0, Math.min(...candidates.map((point) => point.y)) - 42);
  const maxY = Math.min(frameHeight, Math.max(...candidates.map((point) => point.y)) + 42);

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY))
  };
}

function mapPoseResultsToLandmarks(
  poseLandmarks: Array<{ x: number; y: number; visibility?: number }> | undefined,
  frameWidth: number,
  frameHeight: number
): PoseLandmarks | null {
  if (!poseLandmarks || poseLandmarks.length < 25) {
    return null;
  }

  const leftShoulder = visiblePoint(poseLandmarks[11], frameWidth, frameHeight);
  const rightShoulder = visiblePoint(poseLandmarks[12], frameWidth, frameHeight);
  const leftHip = visiblePoint(poseLandmarks[23], frameWidth, frameHeight);
  const rightHip = visiblePoint(poseLandmarks[24], frameWidth, frameHeight);

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return null;
  }

  return {
    neck: point((leftShoulder.x + rightShoulder.x) / 2, (leftShoulder.y + rightShoulder.y) / 2),
    left_shoulder: leftShoulder,
    right_shoulder: rightShoulder,
    left_elbow: visiblePoint(poseLandmarks[13], frameWidth, frameHeight) ?? leftShoulder,
    right_elbow: visiblePoint(poseLandmarks[14], frameWidth, frameHeight) ?? rightShoulder,
    left_wrist: visiblePoint(poseLandmarks[15], frameWidth, frameHeight) ?? leftHip,
    right_wrist: visiblePoint(poseLandmarks[16], frameWidth, frameHeight) ?? rightHip,
    left_hip: leftHip,
    right_hip: rightHip
  };
}

function smoothLandmarks(current: PoseLandmarks | null, next: PoseLandmarks, alpha: number): PoseLandmarks {
  if (!current) {
    return next;
  }

  return {
    neck: lerpPoint(current.neck, next.neck, alpha),
    left_shoulder: lerpPoint(current.left_shoulder, next.left_shoulder, alpha),
    right_shoulder: lerpPoint(current.right_shoulder, next.right_shoulder, alpha),
    left_elbow: lerpPoint(current.left_elbow ?? next.left_elbow ?? next.left_shoulder, next.left_elbow ?? next.left_shoulder, alpha),
    right_elbow: lerpPoint(current.right_elbow ?? next.right_elbow ?? next.right_shoulder, next.right_elbow ?? next.right_shoulder, alpha),
    left_wrist: lerpPoint(current.left_wrist ?? next.left_wrist ?? next.left_hip, next.left_wrist ?? next.left_hip, alpha),
    right_wrist: lerpPoint(current.right_wrist ?? next.right_wrist ?? next.right_hip, next.right_wrist ?? next.right_hip, alpha),
    left_hip: lerpPoint(current.left_hip, next.left_hip, alpha),
    right_hip: lerpPoint(current.right_hip, next.right_hip, alpha)
  };
}

function lerpPoint(current: PosePoint, next: PosePoint, alpha: number): PosePoint {
  return {
    x: Math.round(current.x + (next.x - current.x) * alpha),
    y: Math.round(current.y + (next.y - current.y) * alpha)
  };
}

function visiblePoint(
  landmark: { x: number; y: number; visibility?: number } | undefined,
  frameWidth: number,
  frameHeight: number
): PosePoint | null {
  if (!landmark) {
    return null;
  }

  if ((landmark.visibility ?? 1) < MIN_VISIBILITY) {
    return null;
  }

  return point(landmark.x * frameWidth, landmark.y * frameHeight);
}

function point(x: number, y: number): PosePoint {
  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

async function loadScript(id: string, src: string, errorMessage: string) {
  if (document.getElementById(id)) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.async = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(errorMessage));
    document.head.appendChild(script);
  });
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
