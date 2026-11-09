'use client';

import { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import AvatarModel from './AvatarModel';
import type { TrackingFrame } from '@/lib/tracking/types';

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

    // Set solid blue background
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

    // Strict RGB targets:
    // Blue:   rgb(35, 145, 255)
    // Yellow: rgb(255, 248, 63)
    // Amber:  rgb(255, 205, 84)
    // Pink:   rgb(247, 0, 99)
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

function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 1.25, 1.15);
    camera.lookAt(0, 1.25, 0);
  }, [camera]);
  return null;
}

interface AvatarSceneProps {
  vrmUrl: string;
  trackingFrameRef: React.MutableRefObject<TrackingFrame | null>;
  onRenderFps?: (fps: number) => void;
  recenterTrigger?: number;
}

export default function AvatarScene({
  vrmUrl,
  trackingFrameRef,
  onRenderFps,
  recenterTrigger,
}: AvatarSceneProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

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

  return (
    <div className="relative w-full h-full min-h-[440px] bg-blue border-4 border-amber overflow-hidden flex flex-col justify-center items-center">
      {/* WebGL Context Loss Banner */}
      {contextLost && (
        <div role="alert" className="absolute z-30 p-6 bg-pink border-4 border-yellow text-center max-w-md">
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

      {/* Model Loading State (Pure 4-color palette, no drei Loader) */}
      {isLoading && !loadError && (
        <div className="absolute z-20 p-6 bg-blue border-4 border-amber text-center">
          <h3 className="text-2xl font-black text-yellow uppercase mb-2">
            Embodying Avatar...
          </h3>
          <p className="text-base font-bold text-amber">
            Parsing humanoid skeleton &amp; applying 4-color unlit shaders
          </p>
        </div>
      )}

      {/* Load Error State */}
      {loadError && (
        <div role="alert" className="absolute z-20 p-6 bg-pink border-4 border-yellow text-center max-w-md">
          <h3 className="text-2xl font-black text-yellow uppercase mb-2">
            Avatar Load Error
          </h3>
          <p className="text-base font-bold text-yellow mb-4">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              setIsLoading(true);
            }}
            className="bg-yellow text-blue border-4 border-yellow px-6 py-2 text-lg font-black uppercase cursor-pointer"
          >
            Retry Loading
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
              <div>Total Framebuffer Pixels: {auditStats.totalPixels.toLocaleString()}</div>
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
          <div className="text-[10px] text-amber border-t border-amber pt-1">
            Added Latency Estimate: ~{Math.round((1.0 / (2.0 * Math.PI * minCutoff)) * 1000)} ms
          </div>
        </div>
      )}

      {/* Three.js Canvas: Flat, Linear, Unlit, No Tone Mapping */}
      {/* Self-view is mirrored with CSS scaleX(-1); avatar data remains anatomically unmirrored */}
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
            scene.background = new THREE.Color(0x2391ff); // Solid Blue sky
            camera.lookAt(0, 1.25, 0);
          }}
          className="w-full h-full block bg-blue"
        >
          <CameraSetup />
          {isAuditMode && <PaletteAuditor onResult={setAuditStats} />}

          <AvatarModel
            vrmUrl={vrmUrl}
            trackingFrameRef={trackingFrameRef}
            onRenderFps={onRenderFps}
            recenterTrigger={recenterTrigger}
            minCutoff={minCutoff}
            beta={beta}
            onLoaded={() => {
              setIsLoading(false);
              setLoadError(null);
            }}
            onError={(err) => {
              setIsLoading(false);
              setLoadError(err);
            }}
          />
        </Canvas>
      </div>
    </div>
  );
}
