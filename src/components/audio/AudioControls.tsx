'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SpatialAudioEngine, LocalAudioMeter } from '@/lib/audio/spatial-audio';

interface AudioControlsProps {
  onAudioTrackReady?: (track: MediaStreamTrack | null, stream?: MediaStream) => void;
  remoteAudioStream?: MediaStream | null;
}

export default function AudioControls({
  onAudioTrackReady,
  remoteAudioStream,
}: AudioControlsProps) {
  const [micActive, setMicActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [localVolume, setLocalVolume] = useState(0);
  const [partnerVolume, setPartnerVolume] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localMeterRef = useRef<LocalAudioMeter | null>(null);
  const spatialEngineRef = useRef<SpatialAudioEngine | null>(null);
  const meterIntervalRef = useRef<number | null>(null);

  // Initialize Spatial Audio Engine for partner audio
  useEffect(() => {
    const engine = new SpatialAudioEngine();
    spatialEngineRef.current = engine;

    return () => {
      engine.destroy();
      spatialEngineRef.current = null;
    };
  }, []);

  // When remote audio stream is received from WebRTC peer
  useEffect(() => {
    if (remoteAudioStream && spatialEngineRef.current) {
      spatialEngineRef.current.attachRemoteStream(remoteAudioStream);
    }
  }, [remoteAudioStream]);

  // Request Microphone Access
  const startMicrophone = useCallback(async () => {
    setMicError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Audio devices not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.enabled = true;
        setMicActive(true);
        setMicMuted(false);
        onAudioTrackReady?.(track, stream);

        // Start local RMS volume meter
        localMeterRef.current = new LocalAudioMeter(stream);
      }
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setMicError('Microphone permission denied. Enable microphone access in browser settings.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setMicError('No microphone hardware detected on this device.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setMicError('Microphone is currently in use by another application or tab.');
      } else {
        setMicError(error.message || 'Unable to access microphone.');
      }
      setMicActive(false);
    }
  }, [onAudioTrackReady]);

  // Stop Microphone
  const stopMicrophone = useCallback(() => {
    if (localMeterRef.current) {
      localMeterRef.current.destroy();
      localMeterRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setMicActive(false);
    setMicMuted(false);
    setLocalVolume(0);
    onAudioTrackReady?.(null);
  }, [onAudioTrackReady]);

  // Toggle Mute
  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) {
      const nextMuted = !micMuted;
      track.enabled = !nextMuted;
      setMicMuted(nextMuted);
    }
  };

  // Poll RMS volume for meters at ~20 Hz
  useEffect(() => {
    meterIntervalRef.current = window.setInterval(() => {
      // Local mic meter
      if (micActive && !micMuted && localMeterRef.current) {
        setLocalVolume(localMeterRef.current.getRmsVolume());
      } else {
        setLocalVolume(0);
      }

      // Partner incoming spatial audio meter
      if (spatialEngineRef.current) {
        setPartnerVolume(spatialEngineRef.current.getRmsVolume());
      }
    }, 50);

    return () => {
      if (meterIntervalRef.current !== null) {
        clearInterval(meterIntervalRef.current);
      }
    };
  }, [micActive, micMuted]);

  // Resume AudioContext on any interaction (satisfy browser autoplay policy)
  useEffect(() => {
    const handleInteract = () => {
      spatialEngineRef.current?.resume();
    };
    window.addEventListener('click', handleInteract, { once: true });
    window.addEventListener('keydown', handleInteract, { once: true });
    return () => {
      window.removeEventListener('click', handleInteract);
      window.removeEventListener('keydown', handleInteract);
    };
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, [stopMicrophone]);

  // Calculate volume meter segments (0 to 5)
  const localBars = Math.round(localVolume * 5);
  const partnerBars = Math.round(partnerVolume * 5);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      {/* Microphone Error Banner */}
      {micError && (
        <div role="alert" className="border-2 border-pink bg-pink px-3 py-1">
          <span className="text-yellow text-xs font-black uppercase">
            {micError}
          </span>
        </div>
      )}

      {/* Microphone Toggle & Status Badges */}
      {!micActive ? (
        <button
          type="button"
          onClick={startMicrophone}
          className="min-h-[44px] bg-yellow text-blue border-4 border-yellow hover:border-amber px-4 py-2 text-sm font-black uppercase cursor-pointer"
        >
          Enable Microphone
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {/* Mic Privacy Badge (Pink only when unmuted and broadcasting live) */}
          {!micMuted ? (
            <div className="border-2 border-pink bg-pink px-3 py-2 flex items-center gap-2">
              <span className="text-yellow text-xs font-black uppercase">
                MIC LIVE
              </span>
            </div>
          ) : (
            <div className="border-2 border-amber bg-blue px-3 py-2 flex items-center gap-2">
              <span className="text-amber text-xs font-black uppercase">
                MIC MUTED
              </span>
            </div>
          )}

          {/* Mute / Unmute Button */}
          <button
            type="button"
            onClick={toggleMute}
            className="min-h-[44px] bg-blue text-yellow border-4 border-amber hover:border-yellow px-4 py-2 text-sm font-black uppercase cursor-pointer"
          >
            {micMuted ? 'Unmute' : 'Mute'}
          </button>

          {/* Stop Mic Button */}
          <button
            type="button"
            onClick={stopMicrophone}
            className="min-h-[44px] bg-pink text-yellow border-2 border-pink hover:border-yellow px-3 py-1 text-xs font-black uppercase cursor-pointer"
          >
            Disable
          </button>
        </div>
      )}

      {/* Real-time Voice RMS Audio Meters */}
      <div className="flex items-center gap-3">
        {/* Local Mic Volume Meter */}
        <div className="flex items-center gap-1.5" title="Your Microphone Level">
          <span className="text-amber text-[10px] font-black uppercase">Mic:</span>
          <div className="flex items-center gap-0.5 border-2 border-amber p-0.5 bg-blue">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={`local-${i}`}
                className={`w-1.5 h-3 ${
                  i < localBars
                    ? i === 4
                      ? 'bg-pink'
                      : i >= 3
                      ? 'bg-amber'
                      : 'bg-yellow'
                    : 'bg-blue'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Partner Incoming Spatial Audio Meter */}
        <div className="flex items-center gap-1.5" title="Partner Voice Audio Level (Spatial HRTF)">
          <span className="text-amber text-[10px] font-black uppercase">Partner:</span>
          <div className="flex items-center gap-0.5 border-2 border-amber p-0.5 bg-blue">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={`partner-${i}`}
                className={`w-1.5 h-3 ${
                  i < partnerBars
                    ? i === 4
                      ? 'bg-pink'
                      : i >= 3
                      ? 'bg-amber'
                      : 'bg-yellow'
                    : 'bg-blue'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
