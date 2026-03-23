import type { GarmentAsset, GarmentPart, GarmentRig, PoseLandmarks, PosePoint } from '../types/fitting';
import { computeOverlayFromLandmarks } from './fittingGeometry';

type RiggedPartDraw = {
  part: GarmentPart;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  pivotX: number;
  pivotY: number;
};

const LANDMARK_KEYS = [
  'neck',
  'left_shoulder',
  'right_shoulder',
  'left_hip',
  'right_hip',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist'
] as const;

export function drawGarmentRig(
  context: CanvasRenderingContext2D,
  garment: GarmentAsset,
  image: HTMLImageElement,
  landmarks: PoseLandmarks,
  frameHeight: number
) {
  if (!garment.rig) {
    const overlay = computeOverlayFromLandmarks(landmarks, frameHeight, garment.width, garment.height);
    drawImagePart(context, image, {
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      height: overlay.height,
      rotationDeg: overlay.rotation_deg
    }, {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    }, { x: 0.5, y: 0.5 });
    return;
  }

  const draws = garment.rig.parts
    .map((part) => buildRiggedPartDraw(part, garment.rig as GarmentRig, garment, landmarks, frameHeight))
    .sort((left, right) => left.part.depth - right.part.depth);

  for (const draw of draws) {
    drawImagePart(context, image, draw, draw.part.source_rect, {
      x: draw.pivotX,
      y: draw.pivotY
    });
  }
}

function buildRiggedPartDraw(
  part: GarmentPart,
  rig: GarmentRig,
  garment: GarmentAsset,
  landmarks: PoseLandmarks,
  frameHeight: number
): RiggedPartDraw {
  if (part.role === 'torso') {
    return buildTorsoDraw(part, rig, garment, landmarks, frameHeight);
  }

  if (part.role === 'hood') {
    return buildHoodDraw(part, rig, garment, landmarks, frameHeight);
  }

  return buildSleeveDraw(part, rig, garment, landmarks);
}

function buildTorsoDraw(
  part: GarmentPart,
  rig: GarmentRig,
  garment: GarmentAsset,
  landmarks: PoseLandmarks,
  frameHeight: number
): RiggedPartDraw {
  const overlay = computeOverlayFromLandmarks(landmarks, frameHeight, garment.width, garment.height);
  const torsoHeight = landmarksMidY(landmarks.left_hip, landmarks.right_hip) - landmarks.neck.y;
  const width = Math.max(1, Math.round(overlay.width * part.source_rect.width * part.scale_multiplier));
  const height = Math.max(1, Math.round(Math.max(overlay.height * part.source_rect.height, torsoHeight * 1.1)));
  const anchor = rig.anchors.neck ?? { x: 0.5, y: 0.16 };
  const pivotX = part.pivot.x;
  const pivotY = part.pivot.y;

  return {
    part,
    x: Math.round(landmarks.neck.x - width * anchor.x),
    y: Math.round(landmarks.neck.y - height * anchor.y),
    width,
    height,
    rotationDeg: overlay.rotation_deg,
    pivotX,
    pivotY
  };
}

function buildHoodDraw(
  part: GarmentPart,
  rig: GarmentRig,
  garment: GarmentAsset,
  landmarks: PoseLandmarks,
  frameHeight: number
): RiggedPartDraw {
  const overlay = computeOverlayFromLandmarks(landmarks, frameHeight, garment.width, garment.height);
  const hoodWidth = Math.max(1, Math.round(overlay.width * part.source_rect.width * part.scale_multiplier));
  const hoodHeight = Math.max(1, Math.round(overlay.height * part.source_rect.height * part.scale_multiplier));
  const neckAnchor = rig.anchors.neck ?? { x: 0.5, y: 0.16 };

  return {
    part,
    x: Math.round(landmarks.neck.x - hoodWidth * neckAnchor.x),
    y: Math.round(landmarks.neck.y - hoodHeight * 0.9),
    width: hoodWidth,
    height: hoodHeight,
    rotationDeg: overlay.rotation_deg,
    pivotX: part.pivot.x,
    pivotY: part.pivot.y
  };
}

function buildSleeveDraw(
  part: GarmentPart,
  _rig: GarmentRig,
  garment: GarmentAsset,
  landmarks: PoseLandmarks
): RiggedPartDraw {
  const fallbackStart = part.role === 'left_sleeve' ? landmarks.left_shoulder : landmarks.right_shoulder;
  const fallbackMid = part.role === 'left_sleeve' ? landmarks.left_elbow ?? landmarks.left_hip : landmarks.right_elbow ?? landmarks.right_hip;
  const fallbackEnd = part.role === 'left_sleeve' ? landmarks.left_wrist ?? landmarks.left_hip : landmarks.right_wrist ?? landmarks.right_hip;
  const start = resolveLandmark(part.anchor_start, landmarks) ?? fallbackStart;
  const mid = fallbackMid;
  const end = resolveLandmark(part.anchor_end, landmarks) ?? fallbackEnd;
  const upperLength = distance(start, mid);
  const lowerLength = distance(mid, end);
  const sleeveLength = Math.max(upperLength + lowerLength, garment.height * part.source_rect.height * 0.55);
  const sleeveWidth = Math.max(distance(landmarks.left_shoulder, landmarks.right_shoulder) * 0.32, garment.width * part.source_rect.width * 0.3);
  const rotationDeg = radiansToDegrees(Math.atan2(end.y - start.y, end.x - start.x)) + part.rotation_offset_deg;

  return {
    part,
    x: Math.round(start.x - sleeveWidth * part.pivot.x),
    y: Math.round(start.y - sleeveLength * part.pivot.y),
    width: Math.max(1, Math.round(sleeveWidth * part.scale_multiplier)),
    height: Math.max(1, Math.round(sleeveLength * part.scale_multiplier)),
    rotationDeg,
    pivotX: part.pivot.x,
    pivotY: part.pivot.y
  };
}

function drawImagePart(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  placement: { x: number; y: number; width: number; height: number; rotationDeg: number },
  sourceRect: { x: number; y: number; width: number; height: number },
  pivot: { x: number; y: number }
) {
  const sourceX = Math.round(image.width * sourceRect.x);
  const sourceY = Math.round(image.height * sourceRect.y);
  const sourceWidth = Math.max(1, Math.round(image.width * sourceRect.width));
  const sourceHeight = Math.max(1, Math.round(image.height * sourceRect.height));

  context.save();
  context.translate(placement.x + placement.width * pivot.x, placement.y + placement.height * pivot.y);
  context.rotate((placement.rotationDeg * Math.PI) / 180);
  context.globalAlpha = 0.96;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -placement.width * pivot.x,
    -placement.height * pivot.y,
    placement.width,
    placement.height
  );
  context.restore();
}

function resolveLandmark(name: string | null | undefined, landmarks: PoseLandmarks) {
  if (!name) {
    return null;
  }

  if ((LANDMARK_KEYS as readonly string[]).includes(name)) {
    return landmarks[name as keyof PoseLandmarks] ?? null;
  }

  return null;
}

function distance(from: PosePoint, to: PosePoint) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function landmarksMidY(left: PosePoint, right: PosePoint) {
  return (left.y + right.y) / 2;
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}
