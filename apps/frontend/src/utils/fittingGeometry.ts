import type { OverlayBox, PoseLandmarks } from '../types/fitting';

export function computeOverlayFromLandmarks(
  landmarks: PoseLandmarks,
  frameHeight: number,
  garmentWidth: number,
  garmentHeight: number
): OverlayBox {
  const shoulderWidth = Math.max(landmarks.right_shoulder.x - landmarks.left_shoulder.x, 1);
  const torsoHeight = Math.max(landmarks.left_hip.y - landmarks.neck.y, 1);
  const garmentRatio = garmentWidth / Math.max(garmentHeight, 1);
  const shoulderAngleRadians = Math.atan2(
    landmarks.right_shoulder.y - landmarks.left_shoulder.y,
    landmarks.right_shoulder.x - landmarks.left_shoulder.x
  );

  let overlayWidth = Math.round(shoulderWidth * 1.45);
  let overlayHeight = Math.round(overlayWidth / garmentRatio);
  const minimumHeight = Math.round(torsoHeight * 1.15);
  overlayHeight = Math.max(overlayHeight, minimumHeight);
  overlayWidth = Math.round(overlayHeight * garmentRatio);

  return {
    x: Math.round(landmarks.neck.x - overlayWidth / 2),
    y: Math.round(landmarks.neck.y - frameHeight * 0.02),
    width: overlayWidth,
    height: overlayHeight,
    rotation_deg: radiansToDegrees(shoulderAngleRadians)
  };
}

export function smoothOverlay(current: OverlayBox | null, next: OverlayBox, alpha = 0.3): OverlayBox {
  if (!current) {
    return next;
  }

  return {
    x: lerp(current.x, next.x, alpha),
    y: lerp(current.y, next.y, alpha),
    width: Math.max(1, lerp(current.width, next.width, alpha)),
    height: Math.max(1, lerp(current.height, next.height, alpha)),
    rotation_deg: lerp(current.rotation_deg, next.rotation_deg, alpha)
  };
}

function lerp(a: number, b: number, alpha: number) {
  return Math.round(a + (b - a) * alpha);
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}
