export type Garment = {
  id: string;
  name: string;
  thumbnailUrl: string;
  overlayUrl: string;
};

export type FittingRequest = {
  clothing_id: string;
  frame_width: number;
  frame_height: number;
  garment_width: number;
  garment_height: number;
};

export type OverlayBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation_deg: number;
};

export type PosePoint = {
  x: number;
  y: number;
};

export type PoseLandmarks = {
  neck: PosePoint;
  left_shoulder: PosePoint;
  right_shoulder: PosePoint;
  left_hip: PosePoint;
  right_hip: PosePoint;
};

export type FittingResponse = {
  clothing_id: string;
  overlay: OverlayBox;
  landmarks: PoseLandmarks;
  engine: string;
  confidence: number;
};

export type AppStatus = {
  phase: 'idle' | 'camera-ready' | 'fitting' | 'processing' | 'ready' | 'error';
  message: string;
  lastUpdatedAt?: string;
};
