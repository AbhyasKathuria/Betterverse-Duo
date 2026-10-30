'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import type { DecodedMotionPacket } from '@/lib/webrtc/packet';
import { applyPaletteMaterials } from '@/lib/avatar/material-config';

interface RemoteAvatarModelProps {
  vrmUrl: string;
  packetRef: React.MutableRefObject<DecodedMotionPacket | null>;
  isWeakConnection?: boolean;
}

const REST_ARM_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI * 0.38));
const REST_ARM_R = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI * 0.38));
const IDENTITY_QUAT = new THREE.Quaternion();

export default function RemoteAvatarModel({
  vrmUrl,
  packetRef,
  isWeakConnection = false,
}: RemoteAvatarModelProps) {
  const [vrm, setVrm] = useState<VRM | null>(null);

  // Interpolated bone quaternions
  const currentHead = useRef(new THREE.Quaternion());
  const currentSpine = useRef(new THREE.Quaternion());
  const currentArmL = useRef(REST_ARM_L.clone());
  const currentForearmL = useRef(new THREE.Quaternion());
  const currentArmR = useRef(REST_ARM_R.clone());
  const currentForearmR = new THREE.Quaternion();

  useEffect(() => {
    let isCancelled = false;
    let loadedVrm: VRM | null = null;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(vrmUrl, (gltf) => {
      if (isCancelled) {
        if (gltf.userData.vrm) VRMUtils.deepDispose(gltf.scene);
        return;
      }

      const v = gltf.userData.vrm as VRM;
      if (!v) return;

      loadedVrm = v;
      VRMUtils.rotateVRM0(v);

      // Apply remote material palette: Hair is Pink, Clothing is Yellow (swapped)
      applyPaletteMaterials(v, true);
      v.scene.position.set(0, 0, 0);

      setVrm(v);
    });

    return () => {
      isCancelled = true;
      if (loadedVrm) VRMUtils.deepDispose(loadedVrm.scene);
      setVrm(null);
    };
  }, [vrmUrl]);

  useFrame((_, delta) => {
    if (!vrm) return;
    const packet = packetRef.current;
    const humanoid = vrm.humanoid;
    const exprMgr = vrm.expressionManager;
    const easeRate = Math.min(1.0, delta / 0.5);

    if (packet && !isWeakConnection) {
      // Interpolate smoothly towards received packet rotations
      currentHead.current.slerp(packet.quaternions.head, 0.4);
      currentSpine.current.slerp(packet.quaternions.spine, 0.4);
      currentArmL.current.slerp(packet.quaternions.leftUpperArm, 0.4);
      currentForearmL.current.slerp(packet.quaternions.leftLowerArm, 0.4);
      currentArmR.current.slerp(packet.quaternions.rightUpperArm, 0.4);
      currentForearmR.slerp(packet.quaternions.rightLowerArm, 0.4);

      if (humanoid) {
        const headNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);
        const spineNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.Spine);
        const armLNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm);
        const forearmLNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftLowerArm);
        const armRNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm);
        const forearmRNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightLowerArm);

        if (headNode) headNode.quaternion.copy(currentHead.current);
        if (spineNode) spineNode.quaternion.copy(currentSpine.current);
        if (armLNode) armLNode.quaternion.copy(currentArmL.current);
        if (forearmLNode) forearmLNode.quaternion.copy(currentForearmL.current);
        if (armRNode) armRNode.quaternion.copy(currentArmR.current);
        if (forearmRNode) forearmRNode.quaternion.copy(currentForearmR);

        // Apply finger curls
        const fingerBones = [
          // Left Hand
          [VRMHumanBoneName.LeftThumbProximal, VRMHumanBoneName.LeftThumbDistal],
          [VRMHumanBoneName.LeftIndexProximal, VRMHumanBoneName.LeftIndexIntermediate],
          [VRMHumanBoneName.LeftMiddleProximal, VRMHumanBoneName.LeftMiddleIntermediate],
          [VRMHumanBoneName.LeftRingProximal, VRMHumanBoneName.LeftRingIntermediate],
          [VRMHumanBoneName.LeftLittleProximal, VRMHumanBoneName.LeftLittleIntermediate],
          // Right Hand
          [VRMHumanBoneName.RightThumbProximal, VRMHumanBoneName.RightThumbDistal],
          [VRMHumanBoneName.RightIndexProximal, VRMHumanBoneName.RightIndexIntermediate],
          [VRMHumanBoneName.RightMiddleProximal, VRMHumanBoneName.RightMiddleIntermediate],
          [VRMHumanBoneName.RightRingProximal, VRMHumanBoneName.RightRingIntermediate],
          [VRMHumanBoneName.RightLittleProximal, VRMHumanBoneName.RightLittleIntermediate],
        ];

        for (let i = 0; i < 10; i++) {
          const curl = packet.fingerCurls[i] ?? 0;
          for (const boneName of fingerBones[i]) {
            const b = humanoid.getNormalizedBoneNode(boneName);
            if (b) b.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), curl);
          }
        }
      }

      if (exprMgr) {
        for (const [key, val] of Object.entries(packet.blendshapes)) {
          exprMgr.setValue(key, val);
          if (key === 'blinkLeft') exprMgr.setValue('blink_l', val);
          if (key === 'blinkRight') exprMgr.setValue('blink_r', val);
        }
        exprMgr.update();
      }
    } else {
      // Ease gracefully to rest pose over 0.5s on disconnect or weak connection
      currentHead.current.slerp(IDENTITY_QUAT, easeRate);
      currentSpine.current.slerp(IDENTITY_QUAT, easeRate);
      currentArmL.current.slerp(REST_ARM_L, easeRate);
      currentForearmL.current.slerp(IDENTITY_QUAT, easeRate);
      currentArmR.current.slerp(REST_ARM_R, easeRate);
      currentForearmR.slerp(IDENTITY_QUAT, easeRate);

      if (humanoid) {
        const headNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);
        const spineNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.Spine);
        const armLNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm);
        const forearmLNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftLowerArm);
        const armRNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm);
        const forearmRNode = humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightLowerArm);

        if (headNode) headNode.quaternion.copy(currentHead.current);
        if (spineNode) spineNode.quaternion.copy(currentSpine.current);
        if (armLNode) armLNode.quaternion.copy(currentArmL.current);
        if (forearmLNode) forearmLNode.quaternion.copy(currentForearmL.current);
        if (armRNode) armRNode.quaternion.copy(currentArmR.current);
        if (forearmRNode) forearmRNode.quaternion.copy(currentForearmR);
      }
    }

    vrm.update(delta);
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}
