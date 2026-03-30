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
  left_elbow?: PosePoint | null;
  right_elbow?: PosePoint | null;
  left_wrist?: PosePoint | null;
  right_wrist?: PosePoint | null;
};

export type OverlayBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation_deg: number;
};

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GarmentPart = {
  id: string;
  role: 'torso' | 'left_sleeve' | 'right_sleeve' | 'hood';
  source_rect: NormalizedRect;
  pivot: NormalizedPoint;
  depth: number;
  anchor_start?: string | null;
  anchor_end?: string | null;
  scale_multiplier: number;
  rotation_offset_deg: number;
};

export type GarmentRig = {
  version: string;
  render_mode: 'segmented-2d';
  anchors: Record<string, NormalizedPoint>;
  parts: GarmentPart[];
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
  rig?: GarmentRig | null;
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
  idm_vton_endpoint_url: string | null;
  idm_vton_auth_configured: boolean | null;
  idm_vton_message: string | null;
  comfyui_base_url: string | null;
  comfyui_workflow_path: string | null;
  comfyui_reachable: boolean | null;
  comfyui_workflow_exists: boolean | null;
  comfyui_workflow_is_template: boolean | null;
  comfyui_ready: boolean | null;
  comfyui_message: string | null;
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

export type CameraStreamAvailability = {
  color: boolean;
  depth: boolean;
  ir: boolean;
};

export type OpenNICameraStatus = {
  provider: 'openni';
  package_available: boolean;
  sdk_loaded: boolean;
  connected: boolean;
  dll_directory: string | null;
  device_uri: string | null;
  vendor: string | null;
  name: string | null;
  sensors: CameraStreamAvailability;
  message: string;
  last_error: string | null;
};

export type OpenNICameraPreview = {
  provider: 'openni';
  connected: boolean;
  device_uri: string | null;
  color_image_data_url: string | null;
  depth_image_data_url: string | null;
  ir_image_data_url: string | null;
  color_width: number | null;
  color_height: number | null;
  depth_width: number | null;
  depth_height: number | null;
  ir_width: number | null;
  ir_height: number | null;
  captured_at: string;
};
