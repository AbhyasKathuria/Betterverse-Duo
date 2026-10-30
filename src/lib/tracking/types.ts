// Betterverse Duo - Tracking Types
// Exported for MediaPipe vision tracking, VRM mapping (Stage 3), and WebRTC DataChannel (Stage 4)

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface HandLandmarkResult {
  landmarks: NormalizedLandmark[];
  worldLandmarks: NormalizedLandmark[];
  handedness: 'Left' | 'Right';
  score: number;
}

export interface FaceBlendshape {
  categoryName: string;
  score: number;
}

/**
 * HAND LABEL CONVENTION (For Stage 3 VRM & Stage 4 WebRTC):
 * MediaPipe's HandLandmarker returns handedness categories ("Left" or "Right")
 * assuming a mirrored selfie camera image.
 * For our unmirrored world coordinates and anatomical mapping:
 * - A hand labeled "Left" by MediaPipe corresponds to the user's physical RIGHT hand.
 * - A hand labeled "Right" by MediaPipe corresponds to the user's physical LEFT hand.
 * Raw landmark coordinates are stored UNMIRRORED (y down, x right).
 * Display mirroring for self-view is done exclusively via CSS `transform: scaleX(-1)`.
 * Stage 3 retargeting maps the user's physical right hand to the avatar's right hand bone.
 */
export interface TrackingFrame {
  timestamp: number;
  // 2D image coordinates (0 to 1) for overlay drawing
  pose: NormalizedLandmark[] | null; // Upper body: indices 0-24
  leftHand: NormalizedLandmark[] | null;
  rightHand: NormalizedLandmark[] | null;
  faceLandmarks: NormalizedLandmark[] | null;
  faceBlendshapes: FaceBlendshape[] | null;

  // 3D Metric World coordinates (in meters, y down) for VRM bone retargeting
  poseWorld: NormalizedLandmark[] | null; // Upper body: indices 0-24
  leftHandWorld: NormalizedLandmark[] | null;
  rightHandWorld: NormalizedLandmark[] | null;

  // 4x4 Facial transformation matrix for head rotation (16 elements column-major)
  facialTransformationMatrix: number[] | null;
}

export interface TrackingTelemetry {
  fps: number;
  poseLatencyMs: number;
  handsLatencyMs: number;
  faceLatencyMs: number;
  totalInferenceLatencyMs: number;
  gpuDelegateActive: boolean;
}

export type CameraErrorType =
  | 'NotAllowedError'
  | 'NotFoundError'
  | 'NotReadableError'
  | 'OverconstrainedError'
  | 'GeneralError';
