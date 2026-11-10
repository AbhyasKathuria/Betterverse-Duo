'use client';

import { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import AvatarModel from './AvatarModel';
import RemoteAvatarModel from './RemoteAvatarModel';
import WaitingPod from './WaitingPod';
import WorldEnvironment from '../world/WorldEnvironment';
import type { TrackingFrame } from '@/lib/tracking/types';
import type { DecodedMotionPacket, UnencodedMotionState } from '@/lib/webrtc/packet';
import { type ThemeId, THEMES } from '@/lib/colors';
import type { WorldId } from '@/lib/world-types';

// Ensure exact 1:1 color mapping without Three.js ColorManagement transformations
if (typeof window !== 'undefined') {
  THREE.ColorManagement.enabled = false;
}

interface AuditStats {
  totalPixels: number;
  validPixels: number;
  nonPalettePixels: number;
  percentage: string;
}

function PaletteAuditor({ onResult }: { onResult: (stats: AuditStats) => void }) {
  const { gl, scene } = useThree();
  const auditedRef = useRef(false);

  useFrame(() => {
    if (auditedRef.current) return;

    scene.background = new THREE.Color(0x2391ff);

    const w = gl.domElement.width;
    const h = gl.domElement.height;
    if (w <= 0 || h <= 0) return;

    const context = gl.getContext();
    if (!context) return;

    const pixels = new Uint8Array(w * h * 4);
    context.readPixels(0, 0, w, h, context.RGBA, context.UNSIGNED_BYTE, pixels);

    let validPixels = 0;
    let nonPalettePixels = 0;
    const totalPixels = w * h;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      const isBlue = r === 35 && g === 145 && b === 255;
      const isYellow = r === 255 && g === 248 && b === 63;
      const isAmber = r === 255 && g === 205 && b === 84;
      const isPink = r === 247 && g === 0 && b === 99;

      if (isBlue || isYellow || isAmber || isPink) {
        validPixels++;
      } else {
        nonPalettePixels++;
      }
    }

    const percentage = ((nonPalettePixels / totalPixels) * 100).toFixed(2);
    auditedRef.current = true;
    onResult({
      totalPixels,
      validPixels,
      nonPalettePixels,
      percentage,
    });
  });

  return null;
}

function RotatingWaitingPod() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group ref={groupRef}>
      <WaitingPod />
    </group>
  );
}

function SceneBackground({ color }: { color: number }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color(color);
  }, [scene, color]);
  return null;
}

function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 1.25, 1.15);
    camera.lookAt(0, 1.25, 0);
  }, [camera]);
  return null;
}

interface DualAvatarSceneProps {
  roomId: string;
  vrmUrl: string;
  partnerVrmUrl?: string;
  trackingFrameRef: React.MutableRefObject<TrackingFrame | null>;
  remotePacketRef: React.MutableRefObject<DecodedMotionPacket | null>;
  isPartnerConnected: boolean;
  isLoopback?: boolean;
  partnerDisplayName?: string;
  onMotionState?: (motion: UnencodedMotionState) => void;
  onRenderFps?: (fps: number) => void;
  recenterTrigger?: number;
  isWeakConnection?: boolean;
  theme?: ThemeId;
  worldId?: WorldId;
}

export default function DualAvatarScene({
  roomId,
  vrmUrl,
  partnerVrmUrl,
  trackingFrameRef,
  remotePacketRef,
  isPartnerConnected,
  isLoopback = false,
  partnerDisplayName,
  onMotionState,
  onRenderFps,
  recenterTrigger,
  isWeakConnection = false,
  theme = 'classic',
  worldId = 'cyberGrid',
}: DualAvatarSceneProps) {
  const [contextLost, setContextLost] = useState(false);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  // Dev-only modes via query params
  const [isAuditMode, setIsAuditMode] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);

  // 1€ Filter Tuning (Debug panel)
  const [minCutoff, setMinCutoff] = useState(1.0);
  const [beta, setBeta] = useState(0.007);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsAuditMode(params.has('audit'));
      setIsDebugMode(params.has('debug'));
    }
  }, []);

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    setContextLost(true);
  };

  const handleRetryContext = () => {
    setContextLost(false);
    window.location.reload();
  };

  const remoteVrmUrl = partnerVrmUrl || vrmUrl;
  const showRemoteAvatar = isPartnerConnected || isLoopback;

  return (
    <div className="relative w-full h-full min-h-[480px] bg-blue flex flex-col">
      {/* WebGL Context Loss Banner */}
      {contextLost && (
        <div role="alert" className="absolute z-40 p-6 bg-pink border-4 border-yellow text-center max-w-md m-auto inset-0 h-fit">
          <h3 className="text-2xl font-black text-yellow uppercase mb-2">
            WebGL Context Lost
          </h3>
          <p className="text-base font-bold text-yellow mb-4">
            The graphics device context was interrupted by the operating system.
          </p>
          <button
            type="button"
            onClick={handleRetryContext}
            className="bg-yellow text-blue border-4 border-yellow px-6 py-2 text-lg font-black uppercase cursor-pointer"
          >
            Reload 3D Stage
          </button>
        </div>
      )}

      {/* Dev-Only ?audit Mode Report Card */}
      {isAuditMode && (
        <div className="absolute top-2 left-2 z-30 bg-blue border-4 border-amber p-3 text-xs text-yellow max-w-xs text-left">
          <span className="text-amber font-black uppercase block mb-1">
            Pixel Audit (?audit mode)
          </span>
          {auditStats ? (
            <div className="space-y-1 font-bold">
              <div>Total Pixels: {auditStats.totalPixels.toLocaleString()}</div>
              <div>Palette Compliant: {auditStats.validPixels.toLocaleString()}</div>
              <div className={auditStats.nonPalettePixels === 0 ? 'text-yellow' : 'text-pink'}>
                Non-Palette: {auditStats.nonPalettePixels} ({auditStats.percentage}%)
              </div>
              <div className="text-amber text-[10px] mt-1">Target: 0.00% non-palette pixels</div>
            </div>
          ) : (
            <div>Reading framebuffer pixels...</div>
          )}
        </div>
      )}

      {/* Dev-Only ?debug Tuning Panel */}
      {isDebugMode && (
        <div className="absolute bottom-2 left-2 z-30 bg-blue border-4 border-amber p-3 text-xs text-yellow max-w-xs text-left space-y-2">
          <span className="text-amber font-black uppercase block">
            1€ Filter Tuner (?debug mode)
          </span>
          <div>
            <label htmlFor="min-cutoff-slider" className="block text-amber font-bold">
              Min Cutoff: {minCutoff.toFixed(2)} Hz
            </label>
            <input
              id="min-cutoff-slider"
              type="range"
              min="0.1"
              max="5.0"
              step="0.1"
              value={minCutoff}
              onChange={(e) => setMinCutoff(parseFloat(e.target.value))}
              className="w-full bg-blue border-2 border-amber"
            />
          </div>
          <div>
            <label htmlFor="beta-slider" className="block text-amber font-bold">
              Beta (Speed): {beta.toFixed(4)}
            </label>
            <input
              id="beta-slider"
              type="range"
              min="0.0001"
              max="0.05"
              step="0.001"
              value={beta}
              onChange={(e) => setBeta(parseFloat(e.target.value))}
              className="w-full bg-blue border-2 border-amber"
            />
          </div>
        </div>
      )}

      {/* Two-Person Dual Viewport Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 w-full h-full">
        {/* VIEWPORT 1: SELF AVATAR (Mirrored via CSS scaleX(-1)) */}
        <div className="relative w-full h-full min-h-[380px] bg-blue border-4 border-amber flex flex-col overflow-hidden">
          {/* Viewport Header */}
          <div className="absolute top-2 left-2 z-20 flex items-center gap-2">
            <span className="border-2 border-amber bg-blue px-3 py-1 text-xs font-black text-yellow uppercase">
              You (Local)
            </span>
          </div>

          {/* Loading Indicator */}
          {localLoading && !localError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-blue p-4 text-center">
              <h4 className="text-xl font-black text-yellow uppercase mb-1">
                Embodying Your Avatar...
              </h4>
              <p className="text-xs font-bold text-amber">
                Applying unlit 4-color shaders &amp; bone rigging
              </p>
            </div>
          )}

          {/* Error Indicator */}
          {localError && (
            <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-pink p-4 text-center">
              <h4 className="text-xl font-black text-yellow uppercase mb-2">
                Avatar Error
              </h4>
              <p className="text-xs font-bold text-yellow mb-3">{localError}</p>
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  setLocalLoading(true);
                }}
                className="bg-yellow text-blue border-2 border-yellow px-4 py-1 text-sm font-black uppercase cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Three.js Canvas: Flat, Linear, Unlit, Mirrored with CSS scaleX(-1) */}
          <div style={{ transform: 'scaleX(-1)' }} className="w-full h-full flex-1">
            <Canvas
              flat
              linear
              frameloop="always"
              camera={{ position: [0, 1.25, 1.15], fov: 35 }}
              gl={{
                antialias: false,
                powerPreference: 'high-performance',
                outputColorSpace: THREE.LinearSRGBColorSpace,
              }}
              onCreated={({ gl, scene, camera }) => {
                gl.toneMapping = THREE.NoToneMapping;
                gl.domElement.addEventListener('webglcontextlost', handleContextLost);
                scene.background = new THREE.Color(THEMES[theme]?.sceneBg ?? 0x2391ff);
                camera.lookAt(0, 1.25, 0);
              }}
              className="w-full h-full block bg-blue"
            >
              <CameraSetup />
              <SceneBackground color={THEMES[theme]?.sceneBg ?? 0x2391ff} />
              <WorldEnvironment worldId={worldId} theme={theme} />
              {isAuditMode && <PaletteAuditor onResult={setAuditStats} />}

              <AvatarModel
                vrmUrl={vrmUrl}
                trackingFrameRef={trackingFrameRef}
                onMotionState={onMotionState}
                onRenderFps={onRenderFps}
                recenterTrigger={recenterTrigger}
                minCutoff={minCutoff}
                beta={beta}
                theme={theme}
                onLoaded={() => {
                  setLocalLoading(false);
                  setLocalError(null);
                }}
                onError={(err) => {
                  setLocalLoading(false);
                  setLocalError(err);
                }}
              />
            </Canvas>
          </div>
        </div>

        {/* VIEWPORT 2: PARTNER AVATAR (Unmirrored, CSS scaleX(1)) */}
        <div className="relative w-full h-full min-h-[380px] bg-blue border-4 border-amber flex flex-col overflow-hidden">
          {/* Viewport Header */}
          <div className="absolute top-2 left-2 z-20 flex flex-wrap items-center gap-2">
            <span className="border-2 border-amber bg-blue px-3 py-1 text-xs font-black text-yellow uppercase">
              {isLoopback
                ? 'Partner (Loopback Test)'
                : partnerDisplayName
                ? `Partner: ${partnerDisplayName}`
                : 'Partner (Remote)'}
            </span>

            {isWeakConnection && (
              <span className="border-2 border-pink bg-pink px-2 py-0.5 text-[10px] font-black text-yellow uppercase">
                Weak Connection (Hold Pose)
              </span>
            )}
          </div>

          {/* Three.js Canvas: Flat, Linear, Unlit, Unmirrored */}
          <div className="w-full h-full flex-1">
            <Canvas
              flat
              linear
              frameloop="always"
              camera={{ position: [0, 1.25, 1.15], fov: 35 }}
              gl={{
                antialias: false,
                powerPreference: 'high-performance',
                outputColorSpace: THREE.LinearSRGBColorSpace,
              }}
              onCreated={({ gl, scene, camera }) => {
                gl.toneMapping = THREE.NoToneMapping;
                gl.domElement.addEventListener('webglcontextlost', handleContextLost);
                scene.background = new THREE.Color(THEMES[theme]?.sceneBg ?? 0x2391ff);
                camera.lookAt(0, 1.25, 0);
              }}
              className="w-full h-full block bg-blue"
            >
              <CameraSetup />
              <SceneBackground color={THEMES[theme]?.sceneBg ?? 0x2391ff} />
              <WorldEnvironment worldId={worldId} theme={theme} />
              {showRemoteAvatar ? (
                <RemoteAvatarModel
                  vrmUrl={remoteVrmUrl}
                  packetRef={remotePacketRef}
                  isWeakConnection={isWeakConnection}
                  theme={theme}
                />
              ) : (
                <RotatingWaitingPod />
              )}
            </Canvas>
          </div>

          {/* Waiting For Partner Overlay (when not connected) */}
          {!showRemoteAvatar && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-end pb-8 p-4 text-center">
              <div className="bg-blue border-4 border-amber p-4 max-w-sm pointer-events-auto">
                <p className="text-lg font-black text-yellow uppercase mb-1">
                  Waiting For Partner...
                </p>
                <p className="text-xs font-bold text-amber mb-3">
                  Share this room code with your partner to step in together.
                </p>
                <div className="border-2 border-yellow bg-blue px-3 py-1 inline-block">
                  <span className="text-sm font-black text-yellow tracking-widest uppercase">
                    {roomId}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
