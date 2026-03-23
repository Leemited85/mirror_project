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

export type OverlayBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation_deg: number;
};

export type FittingResponse = {
  clothing_id: string;
  overlay: OverlayBox;
  landmarks: PoseLandmarks;
  engine: string;
  confidence: number;
};

export type ModelAsset = {
  id: string;
  name: string;
  original_image_url: string;
  frame_width: number;
  frame_height: number;
  landmarks: PoseLandmarks;
  pose_engine: string;
  confidence: number;
  created_at: string;
};

export type GarmentAsset = {
  id: string;
  name: string;
  category: 'top' | 'bottom' | 'dress';
  original_image_url: string;
  processed_image_url: string;
  width: number;
  height: number;
  created_at: string;
};

export type TryOnJob = {
  id: string;
  model_id: string;
  garment_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  fitting: FittingResponse | null;
  result_image_url: string | null;
  pose_engine: string;
  vton_engine: string;
  provider_job_id?: string | null;
  warnings: string[];
  created_at: string;
  updated_at: string;
};

export type ProviderStatus = {
  pose_provider: string;
  vton_provider: string;
  comfyui_base_url: string | null;
  comfyui_workflow_path: string | null;
};

export type AppStatus = {
  phase: 'idle' | 'camera-ready' | 'fitting' | 'processing' | 'capturing' | 'ready' | 'error';
  message: string;
  lastUpdatedAt?: string;
};

export type CaptureResponse = {
  capture_id: string;
  saved_path: string;
  created_at: string;
};
