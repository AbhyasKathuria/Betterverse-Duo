'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';
import type { TrackingFrame } from '@/lib/tracking/types';
import type { UnencodedMotionState } from '@/lib/webrtc/packet';
import { VRMRetargeter } from '@/lib/avatar/vrm-retarget';
import { applyPaletteMaterials } from '@/lib/avatar/material-config';

interface AvatarModelProps {
  vrmUrl: string;
  trackingFrameRef: React.MutableRefObject<TrackingFrame | null>;
  onMotionState?: (motion: UnencodedMotionState) => void;
  onRenderFps?: (fps: number) => void;
  recenterTrigger?: number;
  minCutoff?: number;
  beta?: number;
  onLoaded?: () => void;
  onError?: (err: string) => void;
}

export default function AvatarModel({
  vrmUrl,
  trackingFrameRef,
  onMotionState,
  onRenderFps,
  recenterTrigger,
  minCutoff = 1.0,
  beta = 0.007,
  onLoaded,
  onError,
}: AvatarModelProps) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const retargeterRef = useRef<VRMRetargeter | null>(null);

  // FPS calculation refs
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);

  // Motion packet rate limiting (~30 Hz) and sequence tracking
  const lastMotionSendTimeRef = useRef(0);
  const sequenceRef = useRef(0);

  // Load VRM with race condition guard and React Strict Mode safety
  useEffect(() => {
    let isCancelled = false;
    let loadedVrm: VRM | null = null;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      vrmUrl,
      (gltf) => {
        if (isCancelled) {
          if (gltf.userData.vrm) {
            VRMUtils.deepDispose(gltf.scene);
          }
          return;
        }

        const v = gltf.userData.vrm as VRM;
        if (!v) {
          onError?.('Loaded asset is not a valid VRM model.');
          return;
        }

        loadedVrm = v;

        // Ensure both VRM 0.x and 1.0 face the camera
        VRMUtils.rotateVRM0(v);

        // Apply strict 4-color flat palette and inverted-hull Pink outline
        applyPaletteMaterials(v);

        // Position avatar waist-up centered
        v.scene.position.set(0, 0, 0);

        const retargeter = new VRMRetargeter(v, minCutoff, beta);
        retargeterRef.current = retargeter;

        setVrm(v);
        onLoaded?.();
      },
      undefined,
      (err) => {
        if (!isCancelled) {
          console.error('Failed to load VRM model:', err);
          onError?.(`Failed to load VRM model from ${vrmUrl}`);
        }
      }
    );

    return () => {
      isCancelled = true;
      if (loadedVrm) {
        VRMUtils.deepDispose(loadedVrm.scene);
      }
      setVrm(null);
      retargeterRef.current = null;
    };
  }, [vrmUrl, minCutoff, beta, onLoaded, onError]);

  // Recenter trigger
  useEffect(() => {
    if (recenterTrigger && retargeterRef.current) {
      retargeterRef.current.recenterHead();
    }
  }, [recenterTrigger]);

  // Update dynamic filter params when sliders change
  useEffect(() => {
    if (retargeterRef.current) {
      retargeterRef.current.setFilterParams(minCutoff, beta);
    }
  }, [minCutoff, beta]);

  // Render & Retargeting Loop (runs every frame)
  useFrame((_, delta) => {
    if (!vrm || !retargeterRef.current) return;

    // Read latest tracking frame directly from ref (NO setState per frame)
    const latestFrame = trackingFrameRef.current;
    retargeterRef.current.update(latestFrame, delta);
    vrm.update(delta);

    // Export motion state at 30 Hz for WebRTC transmission
    const now = performance.now();
    if (onMotionState && now - lastMotionSendTimeRef.current >= 33) {
      lastMotionSendTimeRef.current = now;
      const motion = retargeterRef.current.getCurrentMotionState(
        sequenceRef.current++ % 65536,
        Math.floor(now)
      );
      onMotionState(motion);
    }

    // Calculate avatar rendering FPS
    frameCountRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current));
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
      onRenderFps?.(fps);
    }
  });

  if (!vrm) return null;

  return <primitive object={vrm.scene} />;
}
