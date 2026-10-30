'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MediaPipeTracker } from '@/lib/tracking/mediapipe';
import { drawTrackingOverlay } from '@/lib/tracking/drawer';
import type { TrackingFrame, TrackingTelemetry, CameraErrorType } from '@/lib/tracking/types';

interface TrackingViewProps {
  onFrame?: (frame: TrackingFrame) => void;
  onCameraActiveChange?: (active: boolean) => void;
  onTelemetryChange?: (telemetry: TrackingTelemetry) => void;
  isCompact?: boolean;
}

export default function TrackingView({
  onFrame,
  onCameraActiveChange,
  onTelemetryChange,
  isCompact = false,
}: TrackingViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const trackerRef = useRef<MediaPipeTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameCallbackIdRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  // Performance telemetry refs (updated per frame, flushed at ~4 Hz)
  const lastHudUpdateRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimestampRef = useRef(0);
  const currentFpsRef = useRef(0);

  // UI States
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<{ type: CameraErrorType; message: string } | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);

  // Telemetry state
  const [telemetry, setTelemetry] = useState<TrackingTelemetry>({
    fps: 0,
    poseLatencyMs: 0,
    handsLatencyMs: 0,
    faceLatencyMs: 0,
    totalInferenceLatencyMs: 0,
    gpuDelegateActive: true,
  });

  const stopTracking = useCallback(() => {
    isRunningRef.current = false;

    if (frameCallbackIdRef.current !== null && videoRef.current) {
      if ('cancelVideoFrameCallback' in videoRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (videoRef.current as any).cancelVideoFrameCallback(frameCallbackIdRef.current);
      } else {
        cancelAnimationFrame(frameCallbackIdRef.current);
      }
      frameCallbackIdRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (trackerRef.current) {
      trackerRef.current.close();
      trackerRef.current = null;
    }

    setIsCameraActive(false);
    onCameraActiveChange?.(false);
  }, [onCameraActiveChange]);

  const startTrackingLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const tracker = trackerRef.current;

    if (!video || !canvas || !tracker) return;

    isRunningRef.current = true;
    lastFpsTimestampRef.current = performance.now();
    frameCountRef.current = 0;

    const processFrame = (timestampMs: number) => {
      if (!isRunningRef.current) return;

      try {
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const result = tracker.processVideoFrame(video, timestampMs);

          // Pass raw unmirrored frame to consumer callback (Stage 3 & 4)
          onFrame?.(result.frame);

          // Draw skeleton on canvas
          const ctx = canvas.getContext('2d');
          if (ctx) {
            drawTrackingOverlay(ctx, showOverlay ? result.frame : null, canvas.width, canvas.height);
          }

          // Compute FPS
          frameCountRef.current++;
          const now = performance.now();
          const elapsedFps = now - lastFpsTimestampRef.current;
          if (elapsedFps >= 1000) {
            currentFpsRef.current = Math.round((frameCountRef.current * 1000) / elapsedFps);
            frameCountRef.current = 0;
            lastFpsTimestampRef.current = now;
          }

          // Throttle telemetry update to ~4 Hz (250ms)
          if (now - lastHudUpdateRef.current >= 250) {
            lastHudUpdateRef.current = now;
            const updated: TrackingTelemetry = {
              fps: currentFpsRef.current,
              poseLatencyMs: Math.round(result.poseLatencyMs),
              handsLatencyMs: Math.round(result.handsLatencyMs),
              faceLatencyMs: Math.round(result.faceLatencyMs),
              totalInferenceLatencyMs: Math.round(result.totalInferenceLatencyMs),
              gpuDelegateActive: result.gpuDelegateActive,
            };
            setTelemetry(updated);
            onTelemetryChange?.(updated);
          }
        }
      } catch (err) {
        console.warn('Frame processing exception:', err);
      }

      if (isRunningRef.current && video) {
        if ('requestVideoFrameCallback' in video) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          frameCallbackIdRef.current = (video as any).requestVideoFrameCallback((now: number) => {
            processFrame(now);
          });
        } else {
          frameCallbackIdRef.current = requestAnimationFrame((now) => {
            processFrame(now);
          });
        }
      }
    };

    if ('requestVideoFrameCallback' in video) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      frameCallbackIdRef.current = (video as any).requestVideoFrameCallback((now: number) => {
        processFrame(now);
      });
    } else {
      frameCallbackIdRef.current = requestAnimationFrame((now) => {
        processFrame(now);
      });
    }
  }, [onFrame, onTelemetryChange, showOverlay]);

  const startCamera = async () => {
    setCameraError(null);
    setModelError(null);
    setIsLoadingModels(true);

    try {
      const tracker = new MediaPipeTracker();
      await tracker.initialize();
      trackerRef.current = tracker;
      setIsLoadingModels(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraActive(true);
      onCameraActiveChange?.(true);

      startTrackingLoop();
    } catch (err: unknown) {
      setIsLoadingModels(false);
      stopTracking();

      const error = err as { name?: string; message?: string };
      if (error.name === 'NotAllowedError') {
        setCameraError({
          type: 'NotAllowedError',
          message: 'Camera permission denied. Please allow camera access in your browser address bar to use tracking.',
        });
      } else if (error.name === 'NotFoundError') {
        setCameraError({
          type: 'NotFoundError',
          message: 'No camera found. Please connect a webcam to enable avatar movement.',
        });
      } else if (error.name === 'NotReadableError') {
        setCameraError({
          type: 'NotReadableError',
          message: 'Camera is currently locked or in use by another application. Please close other camera apps.',
        });
      } else if (error.name === 'OverconstrainedError') {
        setCameraError({
          type: 'OverconstrainedError',
          message: 'Requested camera resolution is not supported by your hardware.',
        });
      } else {
        setModelError(
          error.message || 'Failed to initialize MediaPipe models. Ensure model files are accessible.'
        );
      }
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#2391FF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  // In Compact/PiP mode
  if (isCompact) {
    return (
      <div className="flex flex-col gap-2">
        <div
          ref={containerRef}
          className="relative w-48 sm:w-60 h-36 sm:h-44 border-4 border-amber bg-blue overflow-hidden"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-[1px] h-[1px] absolute pointer-events-none"
          />

          <canvas
            ref={canvasRef}
            style={{ transform: 'scaleX(-1)' }}
            className="w-full h-full block bg-blue"
          />

          {!isCameraActive && !isLoadingModels && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-2 bg-blue text-center">
              <span className="text-xs font-black text-yellow uppercase mb-2">
                Webcam Off
              </span>
              <button
                type="button"
                onClick={startCamera}
                className="bg-yellow text-blue border-2 border-yellow px-2 py-1 text-xs font-black uppercase cursor-pointer"
              >
                Start Camera
              </button>
            </div>
          )}

          {isLoadingModels && (
            <div className="absolute inset-0 flex items-center justify-center p-2 bg-blue text-center">
              <span className="text-xs font-bold text-yellow animate-pulse uppercase">
                Loading Models...
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-1">
          {isCameraActive ? (
            <>
              <button
                type="button"
                onClick={stopTracking}
                className="bg-pink text-yellow border-2 border-pink px-2 py-1 text-xs font-black uppercase cursor-pointer"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => setShowOverlay((p) => !p)}
                className="bg-yellow text-blue border-2 border-yellow px-2 py-1 text-xs font-black uppercase cursor-pointer"
              >
                {showOverlay ? 'Hide Skeleton' : 'Show Skeleton'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              disabled={isLoadingModels}
              className="w-full bg-yellow text-blue border-2 border-yellow py-1 text-xs font-black uppercase cursor-pointer"
            >
              Start Camera
            </button>
          )}
        </div>

        {cameraError && (
          <div role="alert" className="border-2 border-pink bg-pink p-2 text-xs text-yellow font-bold">
            {cameraError.message}
          </div>
        )}
      </div>
    );
  }

  // Full Viewport Mode (used when no 3D avatar is displayed or in Stage 2 fallback)
  return (
    <div className="flex flex-col h-full w-full gap-4">
      {isCameraActive && (
        <div className="border-4 border-pink bg-pink p-3 text-center">
          <span className="text-yellow text-base font-black tracking-wider uppercase">
            CAMERA LIVE - VIDEO STAYS ON THIS DEVICE
          </span>
        </div>
      )}

      {isLoadingModels && (
        <div className="border-4 border-amber p-6 bg-blue text-center">
          <h3 className="text-2xl font-black text-yellow uppercase mb-2">
            Loading MediaPipe Models...
          </h3>
          <p className="text-base font-bold text-amber">
            Downloading local WebAssembly and Lite task models (Pose, Hands, Face)
          </p>
        </div>
      )}

      {cameraError && (
        <div role="alert" className="border-4 border-pink bg-pink p-6 text-center">
          <h3 className="text-2xl font-black text-yellow uppercase mb-2">
            Camera Error ({cameraError.type})
          </h3>
          <p className="text-base font-bold text-yellow mb-4">
            {cameraError.message}
          </p>
          <button
            type="button"
            onClick={startCamera}
            className="bg-yellow text-blue border-4 border-yellow px-6 py-2 text-lg font-black uppercase cursor-pointer"
          >
            Retry Camera Access
          </button>
        </div>
      )}

      {modelError && (
        <div role="alert" className="border-4 border-pink bg-pink p-6 text-center">
          <h3 className="text-2xl font-black text-yellow uppercase mb-2">
            Model Loading Error
          </h3>
          <p className="text-base font-bold text-yellow mb-4">
            {modelError}
          </p>
          <button
            type="button"
            onClick={startCamera}
            className="bg-yellow text-blue border-4 border-yellow px-6 py-2 text-lg font-black uppercase cursor-pointer"
          >
            Retry Loading Models
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-[420px]">
        <div
          ref={containerRef}
          className="flex-1 relative border-4 border-amber bg-blue flex items-center justify-center min-h-[360px]"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-[1px] h-[1px] absolute pointer-events-none"
          />

          <canvas
            ref={canvasRef}
            style={{ transform: 'scaleX(-1)' }}
            className="w-full h-full block bg-blue"
          />

          {!isCameraActive && !isLoadingModels && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-blue text-center">
              <h3 className="text-2xl sm:text-3xl font-black text-yellow uppercase mb-3">
                Tracking Inactive
              </h3>
              <p className="text-base sm:text-lg font-bold text-yellow max-w-md mb-6">
                Start your camera to enable on-device body, hand, and facial tracking. Video never leaves your computer.
              </p>
              <button
                type="button"
                onClick={startCamera}
                className="bg-yellow text-blue border-4 border-yellow hover:border-amber px-8 py-4 text-xl font-black uppercase cursor-pointer"
              >
                Enable Camera Tracking
              </button>
            </div>
          )}
        </div>

        <div className="w-full md:w-80 flex flex-col gap-4">
          <div className="border-4 border-amber p-4 bg-blue flex flex-col gap-3">
            <span className="text-amber text-sm font-black uppercase tracking-wider">
              Tracking Controls
            </span>

            {isCameraActive ? (
              <>
                <button
                  type="button"
                  onClick={stopTracking}
                  className="bg-pink text-yellow border-4 border-pink hover:border-yellow py-3 px-4 text-base font-black uppercase cursor-pointer"
                >
                  Turn Off Camera
                </button>
                <button
                  type="button"
                  onClick={() => setShowOverlay((prev) => !prev)}
                  className="bg-yellow text-blue border-4 border-yellow hover:border-amber py-3 px-4 text-base font-black uppercase cursor-pointer"
                >
                  {showOverlay ? 'Hide Skeleton Overlay' : 'Show Skeleton Overlay'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                disabled={isLoadingModels}
                className="bg-yellow text-blue border-4 border-yellow hover:border-amber py-3 px-4 text-base font-black uppercase cursor-pointer"
              >
                Start Camera
              </button>
            )}
          </div>

          <div className="border-4 border-amber p-4 bg-blue flex flex-col gap-3">
            <span className="text-amber text-sm font-black uppercase tracking-wider">
              Performance Telemetry
            </span>

            <div className="space-y-2 text-left">
              <div>
                <span className="text-amber text-xs font-black uppercase block">
                  Tracking Framerate
                </span>
                <span className="text-yellow text-2xl font-black">
                  {isCameraActive ? `${telemetry.fps} FPS` : '--'}
                </span>
              </div>

              <div>
                <span className="text-amber text-xs font-black uppercase block">
                  Inference Latency (Total)
                </span>
                <span className="text-yellow text-2xl font-black">
                  {isCameraActive ? `${telemetry.totalInferenceLatencyMs} ms` : '--'}
                </span>
              </div>

              <div className="border-2 border-amber p-2 text-xs font-bold text-yellow space-y-1">
                <div>Pose: {isCameraActive ? `${telemetry.poseLatencyMs} ms` : '--'}</div>
                <div>Hands: {isCameraActive ? `${telemetry.handsLatencyMs} ms` : '--'}</div>
                <div>Face (alternating): {isCameraActive ? `${telemetry.faceLatencyMs} ms` : '--'}</div>
                <div>Delegate: {telemetry.gpuDelegateActive ? 'GPU (WebGL)' : 'CPU (Fallback)'}</div>
              </div>

              {isCameraActive && telemetry.fps > 0 && telemetry.fps < 20 && (
                <div className="border-2 border-pink bg-pink p-2 text-xs font-black text-yellow">
                  Low FPS detected (&lt; 20). Propose resolution or delegate adjustment.
                </div>
              )}

              <div className="pt-2 border-t-2 border-amber">
                <p className="text-xs font-bold text-amber">
                  Budget: 150 ms end-to-end (measured in Stage 4)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
