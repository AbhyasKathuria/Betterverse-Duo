import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VRMHumanBoneName } from '@pixiv/three-vrm';
import type { TrackingFrame, NormalizedLandmark } from '@/lib/tracking/types';
import type { UnencodedMotionState } from '@/lib/webrtc/packet';
import { mediapipeWorldToThree } from './coordinates';
import { OneEuroFilter } from './one-euro-filter';

// Helper temporary objects for zero-allocation per frame
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

// Default Rest Rotations (VRM normalized humanoid conventions)
// Left upper arm (+X in T-pose): rotate clockwise around Z to rest naturally at the side
const REST_ARM_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI * 0.38));
// Right upper arm (-X in T-pose): rotate counter-clockwise around Z to rest naturally at the side
const REST_ARM_R = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI * 0.38));

const IDENTITY_QUAT = new THREE.Quaternion();

export class VRMRetargeter {
  private vrm: VRM;

  // Smoothing filters (1€ Filter)
  public headFilter: OneEuroFilter;
  public spineFilter: OneEuroFilter;
  public armLFilter: OneEuroFilter;
  public forearmLFilter: OneEuroFilter;
  public armRFilter: OneEuroFilter;
  public forearmRFilter: OneEuroFilter;
  public expressionFilters: Map<string, OneEuroFilter>;

  // Neutral offset for head recentering
  private headNeutralOffset = new THREE.Quaternion();

  // Current interpolated bone states (for 0.5s graceful tracking loss easing)
  private currentHeadQuat = new THREE.Quaternion();
  private currentSpineQuat = new THREE.Quaternion();
  private currentArmL = new THREE.Quaternion();
  private currentForearmL = new THREE.Quaternion();
  private currentArmR = new THREE.Quaternion();
  private currentForearmR = new THREE.Quaternion();

  // Locomotion & Leaning Position
  public basePosition = new THREE.Vector3(0, 0, 0);
  public leanPosition = new THREE.Vector3(0, 0, 0);
  private initialSceneY = 0;
  private activeKeys = new Set<string>();
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyupHandler: ((e: KeyboardEvent) => void) | null = null;

  // Natural Human Life Micro-Dynamics
  private lastBlinkTime = performance.now();
  private spontaneousBlinkActive = false;
  private spontaneousBlinkStart = 0;

  // Current blendshape values (0 to 1)
  private currentExpressions: Record<string, number> = {
    blinkLeft: 0,
    blinkRight: 0,
    aa: 0,
    happy: 0,
  };

  // Current finger curls (10 values: 5 Left, 5 Right)
  private currentFingerCurls: number[] = new Array(10).fill(0);

  constructor(vrm: VRM, minCutoff = 1.0, beta = 0.007) {
    this.vrm = vrm;

    this.currentArmL.copy(REST_ARM_L);
    this.currentArmR.copy(REST_ARM_R);

    this.headFilter = new OneEuroFilter({ minCutoff, beta });
    this.spineFilter = new OneEuroFilter({ minCutoff, beta });
    this.armLFilter = new OneEuroFilter({ minCutoff, beta });
    this.forearmLFilter = new OneEuroFilter({ minCutoff, beta });
    this.armRFilter = new OneEuroFilter({ minCutoff, beta });
    this.forearmRFilter = new OneEuroFilter({ minCutoff, beta });

    this.expressionFilters = new Map([
      ['blinkLeft', new OneEuroFilter({ minCutoff: 1.5, beta: 0.01 })],
      ['blinkRight', new OneEuroFilter({ minCutoff: 1.5, beta: 0.01 })],
      ['aa', new OneEuroFilter({ minCutoff: 1.2, beta: 0.01 })],
      ['happy', new OneEuroFilter({ minCutoff: 1.0, beta: 0.007 })],
    ]);

    // Calibrate head height so avatar is framed waist-up in center
    this.calibrateHeadHeight(1.35);

    // Setup keyboard locomotion listeners
    if (typeof window !== 'undefined') {
      this.keydownHandler = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;

        this.activeKeys.add(e.code);
        if (e.code === 'KeyR') {
          this.recenter();
        }
      };
      this.keyupHandler = (e: KeyboardEvent) => {
        this.activeKeys.delete(e.code);
      };
      window.addEventListener('keydown', this.keydownHandler);
      window.addEventListener('keyup', this.keyupHandler);
    }
  }

  public calibrateHeadHeight(targetHeadY = 1.35): void {
    this.vrm.scene.updateMatrixWorld(true);
    const headNode = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head);
    if (headNode) {
      const headPos = new THREE.Vector3();
      headNode.getWorldPosition(headPos);
      this.initialSceneY = targetHeadY - headPos.y;
      this.vrm.scene.position.y = this.initialSceneY;
    }
  }

  public setFilterParams(minCutoff: number, beta: number): void {
    this.headFilter.setParams(minCutoff, beta);
    this.spineFilter.setParams(minCutoff, beta);
    this.armLFilter.setParams(minCutoff, beta);
    this.forearmLFilter.setParams(minCutoff, beta);
    this.armRFilter.setParams(minCutoff, beta);
    this.forearmRFilter.setParams(minCutoff, beta);
  }

  public recenterHead(): void {
    this.headNeutralOffset.copy(this.currentHeadQuat).invert();
  }

  public recenter(): void {
    this.recenterHead();
    this.basePosition.set(0, 0, 0);
    this.leanPosition.set(0, 0, 0);
  }

  public getCurrentMotionState(sequence: number, timestamp: number): UnencodedMotionState {
    return {
      sequence,
      timestamp,
      quaternions: {
        head: this.currentHeadQuat.clone(),
        spine: this.currentSpineQuat.clone(),
        leftUpperArm: this.currentArmL.clone(),
        leftLowerArm: this.currentForearmL.clone(),
        rightUpperArm: this.currentArmR.clone(),
        rightLowerArm: this.currentForearmR.clone(),
      },
      fingerCurls: [...this.currentFingerCurls],
      blendshapes: { ...this.currentExpressions },
    };
  }

  /**
   * Main Retargeting update called every frame from useFrame.
   */
  public update(frame: TrackingFrame | null, deltaSec: number): void {
    const timestampSec = (frame?.timestamp ?? performance.now()) / 1000.0;
    const easeRate = Math.min(1.0, deltaSec / 0.5); // 0.5s ease duration on tracking loss

    // 0. Update Locomotion (WASD / Arrow Keys)
    const moveSpeed = 1.35; // meters per second
    if (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp')) {
      this.basePosition.z -= moveSpeed * deltaSec;
    }
    if (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown')) {
      this.basePosition.z += moveSpeed * deltaSec;
    }
    if (this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft')) {
      this.basePosition.x -= moveSpeed * deltaSec;
    }
    if (this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight')) {
      this.basePosition.x += moveSpeed * deltaSec;
    }
    // Clamp to 3D room boundaries
    this.basePosition.x = THREE.MathUtils.clamp(this.basePosition.x, -2.5, 2.5);
    this.basePosition.z = THREE.MathUtils.clamp(this.basePosition.z, -3.0, 1.5);

    // Natural Positional Parallax Leaning from Face Landmarks
    if (frame?.faceLandmarks && frame.faceLandmarks.length >= 468) {
      const nose = frame.faceLandmarks[1];
      const leftEye = frame.faceLandmarks[33];
      const rightEye = frame.faceLandmarks[263];
      if (nose && leftEye && rightEye) {
        const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 0.14;
        const targetLeanX = (0.5 - nose.x) * 0.45;
        const targetLeanY = (0.5 - nose.y) * 0.25;
        const targetLeanZ = (0.14 - eyeDist) * 1.2;

        this.leanPosition.x = THREE.MathUtils.lerp(this.leanPosition.x, targetLeanX, 0.15);
        this.leanPosition.y = THREE.MathUtils.lerp(this.leanPosition.y, targetLeanY, 0.15);
        this.leanPosition.z = THREE.MathUtils.lerp(this.leanPosition.z, targetLeanZ, 0.15);
      }
    } else {
      this.leanPosition.lerp(IDENTITY_QUAT as unknown as THREE.Vector3, easeRate);
    }

    // Natural Respiration Breathing Heave & Idle Sway
    const breathHeave = Math.sin(timestampSec * 1.6) * 0.012;
    const idleSwayX = Math.sin(timestampSec * 0.5) * 0.005;

    // Apply combined position to avatar
    this.vrm.scene.position.x = this.basePosition.x + this.leanPosition.x + idleSwayX;
    this.vrm.scene.position.y = this.initialSceneY + this.basePosition.y + this.leanPosition.y + breathHeave;
    this.vrm.scene.position.z = this.basePosition.z + this.leanPosition.z;

    // 1. Head & Neck Retargeting
    this.updateHead(frame, timestampSec, easeRate);

    // 2. Spine & Torso Retargeting
    this.updateSpine(frame, timestampSec, easeRate);

    // 3. Left & Right Arms Retargeting (Anatomical mapping)
    this.updateArms(frame, timestampSec, easeRate);

    // 4. Fingers Retargeting
    this.updateFingers(frame, easeRate);

    // 5. Facial Blendshapes Retargeting
    this.updateExpressions(frame, timestampSec, easeRate);
  }

  private updateHead(frame: TrackingFrame | null, timeSec: number, easeRate: number): void {
    const headNode = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head);
    if (!headNode) return;

    let hasHeadPose = false;

    if (frame?.faceLandmarks && frame.faceLandmarks.length >= 468) {
      const nose = frame.faceLandmarks[1];      // Nose tip
      const leftEye = frame.faceLandmarks[33];   // Left eye outer corner
      const rightEye = frame.faceLandmarks[263]; // Right eye outer corner
      const chin = frame.faceLandmarks[152];    // Chin
      const forehead = frame.faceLandmarks[10]; // Forehead center

      if (nose && leftEye && rightEye && chin && forehead) {
        const eyeMidX = (leftEye.x + rightEye.x) * 0.5;
        const eyeMidY = (leftEye.y + rightEye.y) * 0.5;
        const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 0.1;

        // Yaw: nose deviation from eye midpoint relative to interocular distance
        // Mirrors selfie camera naturally: turning head left/right rotates avatar left/right
        const rawYaw = -((nose.x - eyeMidX) / eyeDist) * 1.5;

        // Pitch: vertical ratio of nose to forehead and chin
        const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y) || 0.2;
        const rawPitch = (((nose.y - eyeMidY) / faceHeight) - 0.22) * 1.8;

        // Roll: eye line tilt
        const rawRoll = -Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

        _euler.set(rawPitch, rawYaw, rawRoll, 'YXZ');
        _q1.setFromEuler(_euler);
        hasHeadPose = true;
      }
    }

    if (hasHeadPose) {
      // Apply user recentering offset
      _q2.multiplyQuaternions(this.headNeutralOffset, _q1);

      // Clamp rotations to realistic human limits
      _euler.setFromQuaternion(_q2, 'YXZ');
      _euler.x = THREE.MathUtils.clamp(_euler.x, -THREE.MathUtils.degToRad(35), THREE.MathUtils.degToRad(35));
      _euler.y = THREE.MathUtils.clamp(_euler.y, -THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(60));
      _euler.z = THREE.MathUtils.clamp(_euler.z, -THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(25));

      // Add gentle idle head breathing micro-movement
      _euler.y += Math.sin(timeSec * 0.5) * 0.01;
      _euler.x += Math.cos(timeSec * 0.6) * 0.008;

      // Smooth with 1€ filter
      const smoothedYaw = this.headFilter.filter(_euler.y, timeSec).value;
      _euler.y = smoothedYaw;
      _q2.setFromEuler(_euler);

      this.currentHeadQuat.slerp(_q2, 0.45);
    } else {
      // Easing back to neutral on tracking loss with subtle idle micro-movement
      _euler.set(
        Math.cos(timeSec * 0.6) * 0.008,
        Math.sin(timeSec * 0.5) * 0.01,
        0,
        'YXZ'
      );
      _q1.setFromEuler(_euler);
      this.currentHeadQuat.slerp(_q1, easeRate);
    }

    headNode.quaternion.copy(this.currentHeadQuat);
  }

  private updateSpine(frame: TrackingFrame | null, timeSec: number, easeRate: number): void {
    const spineNode = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Spine);
    if (!spineNode) return;

    // Respiration breathing pitch on the spine
    const breathPitch = Math.sin(timeSec * 1.6) * 0.015;

    const pose = frame?.poseWorld;
    if (pose && pose.length >= 25 && (pose[11].visibility ?? 1) > 0.25 && (pose[12].visibility ?? 1) > 0.25) {
      const p11 = mediapipeWorldToThree(pose[11]); // Left shoulder
      const p12 = mediapipeWorldToThree(pose[12]); // Right shoulder

      _v1.set(p11.x - p12.x, p11.y - p12.y, p11.z - p12.z).normalize();
      const tiltRoll = Math.asin(THREE.MathUtils.clamp(_v1.y, -0.4, 0.4));
      const twistYaw = Math.atan2(_v1.z, _v1.x);

      _euler.set(breathPitch, twistYaw * 0.3, tiltRoll * 0.4, 'YXZ');
      _q1.setFromEuler(_euler);

      const smoothedRoll = this.spineFilter.filter(_euler.z, timeSec).value;
      _euler.z = smoothedRoll;
      _q1.setFromEuler(_euler);

      this.currentSpineQuat.slerp(_q1, 0.3);
    } else {
      _euler.set(breathPitch, 0, 0, 'YXZ');
      _q1.setFromEuler(_euler);
      this.currentSpineQuat.slerp(_q1, easeRate);
    }

    spineNode.quaternion.copy(this.currentSpineQuat);
  }

  private updateArms(frame: TrackingFrame | null, timeSec: number, easeRate: number): void {
    const pose = frame?.poseWorld;

    const leftUpper = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm);
    const leftLower = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.LeftLowerArm);
    const rightUpper = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm);
    const rightLower = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.RightLowerArm);

    // Initial bone vectors for normalized VRM humanoid (Left = +X, Right = -X)
    const armLInitVec = new THREE.Vector3(1, 0, 0);
    const armRInitVec = new THREE.Vector3(-1, 0, 0);
    const bendAxisL = new THREE.Vector3(0, 0, 1);
    const bendAxisR = new THREE.Vector3(0, 0, -1);

    // Left Arm (User's anatomical Left: pose landmarks 11, 13, 15)
    if (
      leftUpper &&
      pose &&
      (pose[11]?.visibility ?? 0) > 0.25 &&
      (pose[13]?.visibility ?? 0) > 0.25
    ) {
      const s = mediapipeWorldToThree(pose[11]);
      const e = mediapipeWorldToThree(pose[13]);
      const w = mediapipeWorldToThree(pose[15]);

      _v1.set(e.x - s.x, e.y - s.y, e.z - s.z).normalize();
      _q1.setFromUnitVectors(armLInitVec, _v1);
      this.currentArmL.slerp(_q1, 0.35);

      if (leftLower && (pose[15]?.visibility ?? 0) > 0.25) {
        _v2.set(w.x - e.x, w.y - e.y, w.z - e.z).normalize();
        const bendAngle = THREE.MathUtils.clamp(_v1.angleTo(_v2), 0, THREE.MathUtils.degToRad(145));
        _q2.setFromAxisAngle(bendAxisL, bendAngle);
        this.currentForearmL.slerp(_q2, 0.35);
      }
    } else {
      this.currentArmL.slerp(REST_ARM_L, easeRate);
      this.currentForearmL.slerp(IDENTITY_QUAT, easeRate);
    }

    if (leftUpper) leftUpper.quaternion.copy(this.currentArmL);
    if (leftLower) leftLower.quaternion.copy(this.currentForearmL);

    // Right Arm (User's anatomical Right: pose landmarks 12, 14, 16)
    if (
      rightUpper &&
      pose &&
      (pose[12]?.visibility ?? 0) > 0.25 &&
      (pose[14]?.visibility ?? 0) > 0.25
    ) {
      const s = mediapipeWorldToThree(pose[12]);
      const e = mediapipeWorldToThree(pose[14]);
      const w = mediapipeWorldToThree(pose[16]);

      _v1.set(e.x - s.x, e.y - s.y, e.z - s.z).normalize();
      _q1.setFromUnitVectors(armRInitVec, _v1);
      this.currentArmR.slerp(_q1, 0.35);

      if (rightLower && (pose[16]?.visibility ?? 0) > 0.25) {
        _v2.set(w.x - e.x, w.y - e.y, w.z - e.z).normalize();
        const bendAngle = THREE.MathUtils.clamp(_v1.angleTo(_v2), 0, THREE.MathUtils.degToRad(145));
        _q2.setFromAxisAngle(bendAxisR, bendAngle);
        this.currentForearmR.slerp(_q2, 0.35);
      }
    } else {
      this.currentArmR.slerp(REST_ARM_R, easeRate);
      this.currentForearmR.slerp(IDENTITY_QUAT, easeRate);
    }

    if (rightUpper) rightUpper.quaternion.copy(this.currentArmR);
    if (rightLower) rightLower.quaternion.copy(this.currentForearmR);
  }

  private updateFingers(frame: TrackingFrame | null, easeRate: number): void {
    this.applyHandFingers(frame?.leftHandWorld, 'Left', easeRate);
    this.applyHandFingers(frame?.rightHandWorld, 'Right', easeRate);
  }

  private applyHandFingers(hand: NormalizedLandmark[] | null | undefined, side: 'Left' | 'Right', easeRate: number): void {
    const isLeft = side === 'Left';
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    const fingerConfigs = [
      // Thumb: 3 joints (metacarpal, proximal, distal)
      {
        bones: isLeft
          ? [VRMHumanBoneName.LeftThumbMetacarpal, VRMHumanBoneName.LeftThumbProximal, VRMHumanBoneName.LeftThumbDistal]
          : [VRMHumanBoneName.RightThumbMetacarpal, VRMHumanBoneName.RightThumbProximal, VRMHumanBoneName.RightThumbDistal],
        indices: [1, 2, 3, 4],
      },
      // Index: 3 joints (proximal, intermediate, distal)
      {
        bones: isLeft
          ? [VRMHumanBoneName.LeftIndexProximal, VRMHumanBoneName.LeftIndexIntermediate, VRMHumanBoneName.LeftIndexDistal]
          : [VRMHumanBoneName.RightIndexProximal, VRMHumanBoneName.RightIndexIntermediate, VRMHumanBoneName.RightIndexDistal],
        indices: [5, 6, 7, 8],
      },
      // Middle: 3 joints (proximal, intermediate, distal)
      {
        bones: isLeft
          ? [VRMHumanBoneName.LeftMiddleProximal, VRMHumanBoneName.LeftMiddleIntermediate, VRMHumanBoneName.LeftMiddleDistal]
          : [VRMHumanBoneName.RightMiddleProximal, VRMHumanBoneName.RightMiddleIntermediate, VRMHumanBoneName.RightMiddleDistal],
        indices: [9, 10, 11, 12],
      },
      // Ring: 3 joints (proximal, intermediate, distal)
      {
        bones: isLeft
          ? [VRMHumanBoneName.LeftRingProximal, VRMHumanBoneName.LeftRingIntermediate, VRMHumanBoneName.LeftRingDistal]
          : [VRMHumanBoneName.RightRingProximal, VRMHumanBoneName.RightRingIntermediate, VRMHumanBoneName.RightRingDistal],
        indices: [13, 14, 15, 16],
      },
      // Little: 3 joints (proximal, intermediate, distal)
      {
        bones: isLeft
          ? [VRMHumanBoneName.LeftLittleProximal, VRMHumanBoneName.LeftLittleIntermediate, VRMHumanBoneName.LeftLittleDistal]
          : [VRMHumanBoneName.RightLittleProximal, VRMHumanBoneName.RightLittleIntermediate, VRMHumanBoneName.RightLittleDistal],
        indices: [17, 18, 19, 20],
      },
    ];

    if (hand && hand.length >= 21) {
      for (let i = 0; i < fingerConfigs.length; i++) {
        const finger = fingerConfigs[i];
        const [p0, p1, p2, p3] = finger.indices.map((idx) => mediapipeWorldToThree(hand[idx]));
        _v1.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).normalize();
        _v2.set(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).normalize();
        _v3.set(p3.x - p2.x, p3.y - p2.y, p3.z - p2.z).normalize();

        const curl1 = THREE.MathUtils.clamp(_v1.angleTo(_v2), 0, Math.PI * 0.45);
        const curl2 = THREE.MathUtils.clamp(_v2.angleTo(_v3), 0, Math.PI * 0.45);

        const curlIndex = isLeft ? i : i + 5;
        this.currentFingerCurls[curlIndex] = (curl1 + curl2) * 0.5;

        const b0 = humanoid.getNormalizedBoneNode(finger.bones[0]);
        const b1 = humanoid.getNormalizedBoneNode(finger.bones[1]);
        const b2 = humanoid.getNormalizedBoneNode(finger.bones[2]);

        if (b0) b0.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), curl1 * 0.6);
        if (b1) b1.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), curl1);
        if (b2) b2.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), curl2);
      }
    } else {
      // Ease fingers to relaxed neutral open hand
      const offset = isLeft ? 0 : 5;
      for (let i = 0; i < fingerConfigs.length; i++) {
        this.currentFingerCurls[offset + i] = THREE.MathUtils.lerp(this.currentFingerCurls[offset + i], 0, easeRate);
        const finger = fingerConfigs[i];
        for (const boneName of finger.bones) {
          const b = humanoid.getNormalizedBoneNode(boneName);
          if (b) b.quaternion.slerp(IDENTITY_QUAT, easeRate);
        }
      }
    }
  }

  private updateExpressions(frame: TrackingFrame | null, timeSec: number, easeRate: number): void {
    const exprMgr = this.vrm.expressionManager;
    if (!exprMgr) return;

    const blendshapes = frame?.faceBlendshapes;
    const targetExprs: Record<string, number> = {
      blinkLeft: 0,
      blinkRight: 0,
      aa: 0,
      happy: 0,
    };

    if (blendshapes && blendshapes.length > 0) {
      for (const bs of blendshapes) {
        if (bs.categoryName === 'eyeBlinkLeft') {
          targetExprs.blinkLeft = THREE.MathUtils.clamp(bs.score * 1.2, 0, 1);
        } else if (bs.categoryName === 'eyeBlinkRight') {
          targetExprs.blinkRight = THREE.MathUtils.clamp(bs.score * 1.2, 0, 1);
        } else if (bs.categoryName === 'jawOpen') {
          targetExprs.aa = THREE.MathUtils.clamp(bs.score * 1.4, 0, 1);
        } else if (bs.categoryName === 'mouthSmileLeft' || bs.categoryName === 'mouthSmileRight') {
          targetExprs.happy = Math.max(targetExprs.happy, bs.score);
        }
      }
    }

    // Natural Spontaneous Blinking (human realism)
    const now = performance.now();
    if (targetExprs.blinkLeft > 0.35 || targetExprs.blinkRight > 0.35) {
      this.lastBlinkTime = now;
      this.spontaneousBlinkActive = false;
    } else if (now - this.lastBlinkTime > 3600) {
      this.spontaneousBlinkActive = true;
      this.spontaneousBlinkStart = now;
      this.lastBlinkTime = now + 500;
    }

    if (this.spontaneousBlinkActive) {
      const elapsed = now - this.spontaneousBlinkStart;
      if (elapsed < 160) {
        const blinkProgress = Math.sin((elapsed / 160) * Math.PI);
        targetExprs.blinkLeft = Math.max(targetExprs.blinkLeft, blinkProgress);
        targetExprs.blinkRight = Math.max(targetExprs.blinkRight, blinkProgress);
      } else {
        this.spontaneousBlinkActive = false;
      }
    }

    // Filter and assign blendshape weights
    for (const [key, targetVal] of Object.entries(targetExprs)) {
      const filter = this.expressionFilters.get(key);
      const filtered = filter ? filter.filter(targetVal, timeSec).value : targetVal;

      if (!blendshapes || blendshapes.length === 0) {
        this.currentExpressions[key] = THREE.MathUtils.lerp(this.currentExpressions[key], targetVal, easeRate);
      } else {
        this.currentExpressions[key] = filtered;
      }

      exprMgr.setValue(key, this.currentExpressions[key]);
      if (key === 'blinkLeft') exprMgr.setValue('blink_l', this.currentExpressions[key]);
      if (key === 'blinkRight') exprMgr.setValue('blink_r', this.currentExpressions[key]);
    }

    try {
      exprMgr.update();
    } catch {
      // Defensive suppress on textureless materials
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      if (this.keydownHandler) window.removeEventListener('keydown', this.keydownHandler);
      if (this.keyupHandler) window.removeEventListener('keyup', this.keyupHandler);
    }
  }
}
