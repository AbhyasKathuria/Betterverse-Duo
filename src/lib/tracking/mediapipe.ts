import {
  FilesetResolver,
  PoseLandmarker,
  HandLandmarker,
  FaceLandmarker,
} from '@mediapipe/tasks-vision';
import type {
  TrackingFrame,
  NormalizedLandmark,
  FaceBlendshape,
} from './types';

export interface DetectionResult {
  frame: TrackingFrame;
  poseLatencyMs: number;
  handsLatencyMs: number;
  faceLatencyMs: number;
  totalInferenceLatencyMs: number;
  gpuDelegateActive: boolean;
}

export class MediaPipeTracker {
  private poseLandmarker: PoseLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;

  private isInitialized = false;
  private gpuDelegateActive = false;
  private frameCount = 0;
  private lastTimestamp = -1;

  // Cached face result for alternating 2nd frame execution
  private cachedFaceLandmarks: NormalizedLandmark[] | null = null;
  private cachedFaceBlendshapes: FaceBlendshape[] | null = null;
  private cachedFacialMatrix: number[] | null = null;
  private lastFaceLatencyMs = 0;

  /**
   * Initializes the three MediaPipe vision landmarkers with GPU delegate (falling back to CPU).
   * WASM assets are resolved from the local /mediapipe/wasm directory.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const wasmPath = '/mediapipe/wasm';
    const vision = await FilesetResolver.forVisionTasks(wasmPath);

    // Attempt GPU delegate initialization first, fall back to CPU if unsupported
    let delegate: 'GPU' | 'CPU' = 'GPU';
    try {
      await this.createLandmarkers(vision, delegate);
      this.gpuDelegateActive = true;
    } catch (gpuError) {
      console.warn('⚠️ MediaPipe GPU delegate failed to initialize. Falling back to CPU delegate:', gpuError);
      this.close();
      delegate = 'CPU';
      await this.createLandmarkers(vision, delegate);
      this.gpuDelegateActive = false;
    }

    this.isInitialized = true;
  }

  private async createLandmarkers(vision: unknown, delegate: 'GPU' | 'CPU'): Promise<void> {
    // 1. Pose Landmarker (Lite, numPoses: 1)
    this.poseLandmarker = await PoseLandmarker.createFromOptions(vision as never, {
      baseOptions: {
        modelAssetPath: '/models/pose_landmarker_lite.task',
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    // 2. Hand Landmarker (numHands: 2)
    this.handLandmarker = await HandLandmarker.createFromOptions(vision as never, {
      baseOptions: {
        modelAssetPath: '/models/hand_landmarker.task',
        delegate,
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    // 3. Face Landmarker (numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true)
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision as never, {
      baseOptions: {
        modelAssetPath: '/models/face_landmarker.task',
        delegate,
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  /**
   * Processes a video frame and produces upper-body, hand, and facial tracking data.
   * Ensures strictly increasing timestamps required by MediaPipe VIDEO running mode.
   * Executes Pose and Hands on every frame; executes Face on every second frame.
   */
  public processVideoFrame(video: HTMLVideoElement, frameTimestampMs: number): DetectionResult {
    if (!this.isInitialized || !this.poseLandmarker || !this.handLandmarker || !this.faceLandmarker) {
      throw new Error('MediaPipeTracker is not initialized.');
    }

    // Enforce strictly increasing timestamps required by MediaPipe
    let timestamp = frameTimestampMs;
    if (timestamp <= this.lastTimestamp) {
      timestamp = this.lastTimestamp + 1;
    }
    this.lastTimestamp = timestamp;
    this.frameCount++;

    // 1. Upper Body Pose (Run every frame)
    let poseLandmarks: NormalizedLandmark[] | null = null;
    let poseWorldLandmarks: NormalizedLandmark[] | null = null;
    const poseStart = performance.now();
    try {
      const poseResult = this.poseLandmarker.detectForVideo(video, timestamp);
      if (poseResult.landmarks && poseResult.landmarks.length > 0) {
        // Enforce upper-body constraint: Only indices 0-24 (omit legs 25-32)
        poseLandmarks = poseResult.landmarks[0].slice(0, 25);
      }
      if (poseResult.worldLandmarks && poseResult.worldLandmarks.length > 0) {
        poseWorldLandmarks = poseResult.worldLandmarks[0].slice(0, 25);
      }
    } catch (err) {
      console.warn('Pose detection error on frame:', err);
    }
    const poseLatencyMs = performance.now() - poseStart;

    // 2. Hands (Run every frame, up to 2 hands)
    // MediaPipe handedness labels assume mirrored selfie view:
    // Label "Left" in MediaPipe -> User's anatomical Right hand
    // Label "Right" in MediaPipe -> User's anatomical Left hand
    let leftHand: NormalizedLandmark[] | null = null;
    let rightHand: NormalizedLandmark[] | null = null;
    let leftHandWorld: NormalizedLandmark[] | null = null;
    let rightHandWorld: NormalizedLandmark[] | null = null;

    const handsStart = performance.now();
    try {
      const handsResult = this.handLandmarker.detectForVideo(video, timestamp);
      if (handsResult.landmarks && handsResult.landmarks.length > 0) {
        for (let i = 0; i < handsResult.landmarks.length; i++) {
          const rawHandedness = handsResult.handednesses[i]?.[0]?.categoryName;
          const handPoints = handsResult.landmarks[i];
          const handWorldPoints = handsResult.worldLandmarks?.[i] || null;

          if (rawHandedness === 'Left') {
            // MediaPipe "Left" = User anatomical RIGHT hand
            rightHand = handPoints;
            rightHandWorld = handWorldPoints;
          } else if (rawHandedness === 'Right') {
            // MediaPipe "Right" = User anatomical LEFT hand
            leftHand = handPoints;
            leftHandWorld = handWorldPoints;
          } else {
            // Fallback assignment if handedness is unclassified
            if (!leftHand) {
              leftHand = handPoints;
              leftHandWorld = handWorldPoints;
            } else if (!rightHand) {
              rightHand = handPoints;
              rightHandWorld = handWorldPoints;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Hands detection error on frame:', err);
    }
    const handsLatencyMs = performance.now() - handsStart;

    // 3. Face (Run on every second frame, alternating to preserve frame budget)
    let faceLatencyMs = this.lastFaceLatencyMs;
    const shouldRunFace = this.frameCount % 2 === 0;

    if (shouldRunFace) {
      const faceStart = performance.now();
      try {
        const faceResult = this.faceLandmarker.detectForVideo(video, timestamp);
        if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
          this.cachedFaceLandmarks = faceResult.faceLandmarks[0];
        } else {
          this.cachedFaceLandmarks = null;
        }

        if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
          this.cachedFaceBlendshapes = faceResult.faceBlendshapes[0].categories;
        } else {
          this.cachedFaceBlendshapes = null;
        }

        if (faceResult.facialTransformationMatrixes && faceResult.facialTransformationMatrixes.length > 0) {
          const matrixObj = faceResult.facialTransformationMatrixes[0];
          this.cachedFacialMatrix = Array.from(matrixObj.data);
        } else {
          this.cachedFacialMatrix = null;
        }
      } catch (err) {
        console.warn('Face detection error on frame:', err);
      }
      faceLatencyMs = performance.now() - faceStart;
      this.lastFaceLatencyMs = faceLatencyMs;
    }

    const totalInferenceLatencyMs = poseLatencyMs + handsLatencyMs + (shouldRunFace ? faceLatencyMs : 0);

    const frame: TrackingFrame = {
      timestamp,
      pose: poseLandmarks,
      leftHand,
      rightHand,
      faceLandmarks: this.cachedFaceLandmarks,
      faceBlendshapes: this.cachedFaceBlendshapes,
      poseWorld: poseWorldLandmarks,
      leftHandWorld,
      rightHandWorld,
      facialTransformationMatrix: this.cachedFacialMatrix,
    };

    return {
      frame,
      poseLatencyMs,
      handsLatencyMs,
      faceLatencyMs,
      totalInferenceLatencyMs,
      gpuDelegateActive: this.gpuDelegateActive,
    };
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public getGpuActive(): boolean {
    return this.gpuDelegateActive;
  }

  public close(): void {
    try {
      this.poseLandmarker?.close();
    } catch {
      // Ignored
    }
    try {
      this.handLandmarker?.close();
    } catch {
      // Ignored
    }
    try {
      this.faceLandmarker?.close();
    } catch {
      // Ignored
    }

    this.poseLandmarker = null;
    this.handLandmarker = null;
    this.faceLandmarker = null;
    this.isInitialized = false;
    this.lastTimestamp = -1;
    this.frameCount = 0;
    this.cachedFaceLandmarks = null;
    this.cachedFaceBlendshapes = null;
    this.cachedFacialMatrix = null;
  }
}
