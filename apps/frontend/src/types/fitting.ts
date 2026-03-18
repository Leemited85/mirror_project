export type Garment = {
  id: string;
  name: string;
  thumbnailUrl: string;
  overlayUrl: string;
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

export type TryOnRequest = {
  clothing_id: string;
  model_image_base64: string;
  garment_image_base64: string;
  frame_width: number;
  frame_height: number;
  garment_width: number;
  garment_height: number;
  manual_landmarks?: PoseLandmarks;
};

export type ModelAnalyzeRequest = {
  model_image_base64: string;
  frame_width: number;
  frame_height: number;
};

export type ModelAnalyzeResponse = {
  status: string;
  landmarks: PoseLandmarks;
  pose_engine: string;
  confidence: number;
  warnings: string[];
};

export type TryOnResponse = {
  status: string;
  fitting: FittingResponse;
  result_image_base64: string | null;
  pose_engine: string;
  vton_engine: string;
  warnings: string[];
};

export type AppStatus = {
  phase: 'idle' | 'camera-ready' | 'fitting' | 'processing' | 'ready' | 'error';
  message: string;
  lastUpdatedAt?: string;
};
