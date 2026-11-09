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
const _mat4 = new THREE.Matrix4();

// Default Rest Rotations
const REST_ARM_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI * 0.38));
const REST_ARM_R = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI * 0.38));
const IDENTITY_QUAT = new THREE.Quaternion();

// Basis transformation: converts MediaPipe camera space (Y-down, Z-into-scene) to Three.js space (Y-up, Z-towards-viewer)
const MP_TO_THREE_BASIS = new THREE.Matrix4().set(
  1,  0,  0, 0,
  0, -1,  0, 0,
  0,  0, -1, 0,
  0,  0,  0, 1
);

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
  private currentArmL = REST_ARM_L.clone();
  private currentForearmL = new THREE.Quaternion();
  private currentArmR = REST_ARM_R.clone();
  private currentForearmR = new THREE.Quaternion();

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

    if (frame?.facialTransformationMatrix && frame.facialTransformationMatrix.length === 16) {
      const m = frame.facialTransformationMatrix;
      // MediaPipe matrix data is row-major; Matrix4.set accepts row-major arguments
      _mat4.set(
        m[0], m[1], m[2], m[3],
        m[4], m[5], m[6], m[7],
        m[8], m[9], m[10], m[11],
        m[12], m[13], m[14], m[15]
      );
      // Transform MediaPipe Y-down, Z-into-scene basis into Three.js coordinates
      _mat4.premultiply(MP_TO_THREE_BASIS);
      _q1.setFromRotationMatrix(_mat4);
      hasHeadPose = true;
    } else if (frame?.faceLandmarks && frame.faceLandmarks.length >= 468) {
      // Robust landmark fallback: estimate head yaw, pitch, and roll from face landmarks
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
        const rawYaw = ((nose.x - eyeMidX) / eyeDist) * 1.5;
        // Pitch: vertical ratio of nose to chin/forehead
        const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y) || 0.2;
        const rawPitch = (((nose.y - eyeMidY) / faceHeight) - 0.25) * 2.0;
        // Roll: eye line angle
        const rawRoll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

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

      // Smooth with 1€ filter
      const smoothedYaw = this.headFilter.filter(_euler.y, timeSec).value;
      _euler.y = smoothedYaw;
      _q2.setFromEuler(_euler);

      this.currentHeadQuat.slerp(_q2, 0.4);
    } else {
      // Easing back to neutral on tracking loss
      this.currentHeadQuat.slerp(IDENTITY_QUAT, easeRate);
    }

    headNode.quaternion.copy(this.currentHeadQuat);
  }

  private updateSpine(frame: TrackingFrame | null, timeSec: number, easeRate: number): void {
    const spineNode = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Spine);
    if (!spineNode) return;

    const pose = frame?.poseWorld;
    if (pose && pose.length >= 25 && (pose[11].visibility ?? 1) > 0.25 && (pose[12].visibility ?? 1) > 0.25) {
      const p11 = mediapipeWorldToThree(pose[11]); // Left shoulder
      const p12 = mediapipeWorldToThree(pose[12]); // Right shoulder

      _v1.set(p11.x - p12.x, p11.y - p12.y, p11.z - p12.z).normalize();
      const tiltRoll = Math.asin(THREE.MathUtils.clamp(_v1.y, -0.4, 0.4));
      const twistYaw = Math.atan2(_v1.z, _v1.x);

      _euler.set(0, twistYaw * 0.3, tiltRoll * 0.4, 'YXZ');
      _q1.setFromEuler(_euler);

      const smoothedRoll = this.spineFilter.filter(_euler.z, timeSec).value;
      _euler.z = smoothedRoll;
      _q1.setFromEuler(_euler);

      this.currentSpineQuat.slerp(_q1, 0.3);
    } else {
      this.currentSpineQuat.slerp(IDENTITY_QUAT, easeRate);
    }

    spineNode.quaternion.copy(this.currentSpineQuat);
  }

  private updateArms(frame: TrackingFrame | null, timeSec: number, easeRate: number): void {
    const pose = frame?.poseWorld;

    const leftUpper = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm);
    const leftLower = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.LeftLowerArm);
    const rightUpper = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm);
    const rightLower = this.vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.RightLowerArm);

    // Left Arm (User's physical Left: landmarks 11, 13, 15)
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
      // T-pose left arm initial unit vector is (+1, 0, 0)
      _q1.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _v1);
      this.currentArmL.slerp(_q1, 0.35);

      if (leftLower && (pose[15]?.visibility ?? 0) > 0.25) {
        _v2.set(w.x - e.x, w.y - e.y, w.z - e.z).normalize();
        const bendAngle = THREE.MathUtils.clamp(_v1.angleTo(_v2), 0, THREE.MathUtils.degToRad(145));
        _q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), bendAngle);
        this.currentForearmL.slerp(_q2, 0.35);
      }
    } else {
      this.currentArmL.slerp(REST_ARM_L, easeRate);
      this.currentForearmL.slerp(IDENTITY_QUAT, easeRate);
    }

    if (leftUpper) leftUpper.quaternion.copy(this.currentArmL);
    if (leftLower) leftLower.quaternion.copy(this.currentForearmL);

    // Right Arm (User's physical Right: landmarks 12, 14, 16)
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
      // T-pose right arm initial unit vector is (-1, 0, 0)
      _q1.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), _v1);
      this.currentArmR.slerp(_q1, 0.35);

      if (rightLower && (pose[16]?.visibility ?? 0) > 0.25) {
        _v2.set(w.x - e.x, w.y - e.y, w.z - e.z).normalize();
        const bendAngle = THREE.MathUtils.clamp(_v1.angleTo(_v2), 0, THREE.MathUtils.degToRad(145));
        _q2.setFromAxisAngle(new THREE.Vector3(0, 0, -1), bendAngle);
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
    // Left Hand (Thumb: metacarpal, proximal, distal; Others: proximal, intermediate, distal)
    this.applyHandFingers(frame?.leftHandWorld, 'Left', easeRate);
    // Right Hand
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
      // Index: 3 joints (proximal, intermediate, distal) - NO metacarpal
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

        // Store into currentFingerCurls (0-4 for Left, 5-9 for Right)
        const curlIndex = isLeft ? i : i + 5;
        this.currentFingerCurls[curlIndex] = (curl1 + curl2) * 0.5;

        // Apply curls to joints
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

    // Filter and assign blendshape weights
    for (const [key, targetVal] of Object.entries(targetExprs)) {
      const filter = this.expressionFilters.get(key);
      const filtered = filter ? filter.filter(targetVal, timeSec).value : targetVal;

      if (!blendshapes || blendshapes.length === 0) {
        // Easing to 0 on tracking loss
        this.currentExpressions[key] = THREE.MathUtils.lerp(this.currentExpressions[key], 0, easeRate);
      } else {
        this.currentExpressions[key] = filtered;
      }

      // Support VRM 1.0 and VRM 0.x expression naming variations
      exprMgr.setValue(key, this.currentExpressions[key]);
      if (key === 'blinkLeft') exprMgr.setValue('blink_l', this.currentExpressions[key]);
      if (key === 'blinkRight') exprMgr.setValue('blink_r', this.currentExpressions[key]);
    }

    try {
      exprMgr.update();
    } catch (err) {
      console.warn('VRM expressionManager update error:', err);
    }
  }
}
