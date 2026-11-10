'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TrackingView from '@/components/tracking/TrackingView';
import AvatarPicker, { AVAILABLE_AVATARS, type AvatarOption } from '@/components/avatar/AvatarPicker';
import ThemeSelector from '@/components/theme/ThemeSelector';
import WorldSelector from '@/components/world/WorldSelector';
import { type ThemeId, THEMES } from '@/lib/colors';
import { type WorldId, WORLDS } from '@/lib/world-types';
import { DynamicDualAvatarScene } from '@/components/avatar/DynamicDualAvatarScene';
import AudioControls from '@/components/audio/AudioControls';
import SharedActivities from '@/components/activity/SharedActivities';
import AuthModal from '@/components/auth/AuthModal';
import { getSupabase } from '@/lib/supabase/client';
import { joinRoomRpc, createRoomRpc, mapRoomError, type RoomErrorType } from '@/lib/supabase/rooms';
import { SupabaseSignalingClient } from '@/lib/webrtc/signaling';
import { encodeMotionPacket, decodeMotionPacket, type DecodedMotionPacket, type UnencodedMotionState } from '@/lib/webrtc/packet';
import type { TrackingFrame, TrackingTelemetry } from '@/lib/tracking/types';
import type { PeerPresenceState, ControlActivityMessage } from '@/lib/webrtc/types';

interface RoomViewProps {
  roomId: string;
}

export default function RoomView({ roomId }: RoomViewProps) {
  const router = useRouter();

  // URL Query Params state
  const [isLoopback, setIsLoopback] = useState(false);

  // Authentication & Room Joining state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [roomError, setRoomError] = useState<{ type: RoomErrorType; message: string } | null>(null);
  const [isJoiningRoom, setIsJoiningRoom] = useState(true);

  // Room & Avatar selection
  const [copied, setCopied] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarOption>(AVAILABLE_AVATARS[0]);
  const [theme, setTheme] = useState<ThemeId>('classic');
  const [worldId, setWorldId] = useState<WorldId>('cyberGrid');
  const [partnerAvatarId, setPartnerAvatarId] = useState<string | null>(null);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [showPip, setShowPip] = useState(true);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('betterverse_theme') as ThemeId;
      if (savedTheme && THEMES[savedTheme]) setTheme(savedTheme);
      const savedWorld = localStorage.getItem('betterverse_world') as WorldId;
      if (savedWorld && WORLDS[savedWorld]) setWorldId(savedWorld);
    } catch {}
  }, []);

  const handleSelectTheme = (newTheme: ThemeId) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('betterverse_theme', newTheme);
    } catch {}
  };

  const handleSelectWorld = (newWorld: WorldId) => {
    setWorldId(newWorld);
    try {
      localStorage.setItem('betterverse_world', newWorld);
    } catch {}
  };

  // WebRTC & Signaling state
  const [partnerPresence, setPartnerPresence] = useState<PeerPresenceState | null>(null);
  const [webrtcState, setWebrtcState] = useState<RTCPeerConnectionState>('new');
  const [candidateType, setCandidateType] = useState<'host' | 'srflx' | 'relay' | 'unknown'>('unknown');
  const [peerRtt, setPeerRtt] = useState<number | null>(null);
  const [isWeakConnection, setIsWeakConnection] = useState(false);
  const [hasMultiTab, setHasMultiTab] = useState(false);
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [incomingActivity, setIncomingActivity] = useState<ControlActivityMessage | null>(null);

  // FPS & Tracking Telemetry
  const [avatarFps, setAvatarFps] = useState(0);
  const [trackingTelemetry, setTrackingTelemetry] = useState<TrackingTelemetry>({
    fps: 0,
    poseLatencyMs: 0,
    handsLatencyMs: 0,
    faceLatencyMs: 0,
    totalInferenceLatencyMs: 0,
    gpuDelegateActive: true,
  });

  // Local & Remote Motion Packet Refs (ZERO per-frame React state calls)
  const localFrameRef = useRef<TrackingFrame | null>(null);
  const remotePacketRef = useRef<DecodedMotionPacket | null>(null);
  const signalingClientRef = useRef<SupabaseSignalingClient | null>(null);

  // Check URL parameters for loopback mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsLoopback(params.get('loopback') === '1');
    }
  }, []);

  // 1. Check Auth status on mount
  useEffect(() => {
    let isCancelled = false;

    const checkAuthAndJoin = async () => {
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();

        if (isCancelled) return;

        if (!user) {
          setIsAuthenticated(false);
          setShowAuthModal(true);
          setIsJoiningRoom(false);
        } else {
          setIsAuthenticated(true);
          setShowAuthModal(false);
          await handleJoinOrCreateRoom();
        }
      } catch (err) {
        if (!isCancelled) {
          const mapped = mapRoomError(err);
          setRoomError(mapped);
          setIsJoiningRoom(false);
        }
      }
    };

    checkAuthAndJoin();

    return () => {
      isCancelled = true;
    };
  }, [roomId]);

  // 2. Join or Create Room RPC
  const handleJoinOrCreateRoom = async (forceCreate = false) => {
    setIsJoiningRoom(true);
    setRoomError(null);
    try {
      const isCreateParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('create') === '1';

      if (forceCreate) {
        await createRoomRpc(roomId);
      } else {
        // Attempt idempotent join first. If room already exists, join succeeds with zero 409 conflict error.
        try {
          await joinRoomRpc(roomId);
        } catch (joinErr: unknown) {
          const msg = joinErr instanceof Error ? joinErr.message : String(joinErr);
          if (isCreateParam && msg.includes('room_not_found')) {
            // Room does not exist yet and user clicked 'Create Room' -> create it now
            await createRoomRpc(roomId);
          } else {
            throw joinErr;
          }
        }
      }

      // Clean query string immediately so reloads don't re-trigger creation
      if (typeof window !== 'undefined' && window.history.replaceState) {
        window.history.replaceState({}, '', `/room/${roomId}`);
      }

      setIsJoiningRoom(false);
      startSignaling();
    } catch (err) {
      setIsJoiningRoom(false);
      const mapped = mapRoomError(err);
      if (mapped.type === 'not_authenticated') {
        setShowAuthModal(true);
      } else {
        setRoomError(mapped);
      }
    }
  };

  // 3. Connect Supabase Realtime & WebRTC Signaling
  const startSignaling = useCallback(async () => {
    if (signalingClientRef.current) return;

    try {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const peerId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);

      const localPeer: PeerPresenceState = {
        userId: user.id,
        peerId,
        avatarId: selectedAvatar.id,
        displayName: user.email ? user.email.split('@')[0] : `Guest-${peerId.slice(0, 4)}`,
      };

      const client = new SupabaseSignalingClient(roomId, localPeer, {
        onPartnerJoined: (partner) => {
          setPartnerPresence(partner);
          if (partner.avatarId) {
            setPartnerAvatarId(partner.avatarId);
          }
        },
        onPartnerLeft: () => {
          setPartnerPresence(null);
          setWebrtcState('disconnected');
          setPeerRtt(null);
          remotePacketRef.current = null;
        },
        onRemoteMotionPacket: (packet) => {
          remotePacketRef.current = packet;
        },
        onPartnerAvatarChange: (avatarId) => {
          setPartnerAvatarId(avatarId);
        },
        onConnectionStateChange: (state) => {
          setWebrtcState(state);
        },
        onCandidateTypeChange: (type) => {
          setCandidateType(type);
        },
        onRttChange: (rtt) => {
          setPeerRtt(rtt);
        },
        onWeakConnectionChange: (isWeak) => {
          setIsWeakConnection(isWeak);
        },
        onMultiTabWarning: (warn) => {
          setHasMultiTab(warn);
        },
        onRemoteAudioStream: (stream) => {
          setRemoteAudioStream(stream);
        },
        onPartnerActivity: (activity) => {
          setIncomingActivity(activity);
        },
        onError: (err) => {
          console.warn('Signaling error:', err);
        },
      });

      signalingClientRef.current = client;
      await client.connect();
    } catch (err) {
      console.warn('Failed to start signaling client:', err);
    }
  }, [roomId, selectedAvatar.id]);

  // Clean up WebRTC & Realtime signaling on unmount
  useEffect(() => {
    return () => {
      if (signalingClientRef.current) {
        signalingClientRef.current.disconnect();
        signalingClientRef.current = null;
      }
    };
  }, []);

  // Update local avatar choice over signaling channel
  const handleSelectAvatar = (avatar: AvatarOption) => {
    setSelectedAvatar(avatar);
    if (signalingClientRef.current) {
      signalingClientRef.current.updateLocalAvatar(avatar.id);
    }
  };

  // Stage 5 Voice track forwarding to WebRTC peer connection
  const handleAudioTrackReady = useCallback((track: MediaStreamTrack | null, stream?: MediaStream) => {
    signalingClientRef.current?.setAudioTrack(track, stream);
  }, []);

  // Stage 6 Couple Activities & Emote broadcasting
  const handleSendActivity = useCallback(
    (action: ControlActivityMessage['action']) => {
      signalingClientRef.current?.sendActivity(action);
      if (isLoopback) {
        setIncomingActivity({
          type: 'activity',
          action,
          timestamp: Date.now(),
        });
      }
    },
    [isLoopback]
  );

  // Handle local tracking frame from TrackingView
  const handleFrame = useCallback((frame: TrackingFrame) => {
    localFrameRef.current = frame;
  }, []);

  // Handle solved motion state from local AvatarModel (throttled at 30 Hz)
  const handleMotionState = useCallback(
    (motion: UnencodedMotionState) => {
      const buffer = encodeMotionPacket(motion);

      // 1. Loopback mode: directly decode and feed to remote avatar
      if (isLoopback) {
        try {
          const decoded = decodeMotionPacket(buffer);
          remotePacketRef.current = decoded;
        } catch (err) {
          console.warn('Loopback decode error:', err);
        }
      }

      // 2. Transmit binary motion packet over WebRTC pose data channel
      if (signalingClientRef.current) {
        signalingClientRef.current.sendMotionPacket(buffer);
      }
    },
    [isLoopback]
  );

  const handleCopyLink = async () => {
    try {
      if (typeof window !== 'undefined') {
        const canonicalUrl = `${window.location.origin}/room/${roomId}`;
        await navigator.clipboard.writeText(canonicalUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setCopied(false);
    }
  };

  const handleLeaveRoom = () => {
    if (signalingClientRef.current) {
      signalingClientRef.current.disconnect();
      signalingClientRef.current = null;
    }
    router.push('/');
  };

  const handleRecenter = () => {
    setRecenterTrigger(Date.now());
  };

  // Global Keyboard Shortcuts for hands-free / rapid couple interactions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'r') {
        setRecenterTrigger(Date.now());
      } else if (key === 'h') {
        handleSendActivity('heart');
      } else if (key === 's') {
        handleSendActivity('sparkle');
      } else if (key === 'f') {
        handleSendActivity('high_five');
      } else if (key === 'p') {
        handleSendActivity('photo_countdown');
      } else if (key === 't') {
        setShowPip((p) => !p);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSendActivity]);

  // Resolve partner avatar VRM URL
  const partnerAvatarOption = AVAILABLE_AVATARS.find((a) => a.id === partnerAvatarId) || (
    isLoopback ? AVAILABLE_AVATARS[1] : undefined
  );
  const partnerVrmUrl = partnerAvatarOption?.vrmUrl;

  const isPartnerConnected = Boolean(partnerPresence && webrtcState === 'connected');

  return (
    <main className="min-h-screen bg-blue text-yellow p-4 sm:p-6 flex flex-col justify-between">
      {/* Auth Modal for Unauthenticated Users */}
      {showAuthModal && (
        <AuthModal
          onSuccess={async () => {
            setShowAuthModal(false);
            setIsAuthenticated(true);
            await handleJoinOrCreateRoom();
          }}
        />
      )}

      {/* Top Header Bar */}
      <header className="border-4 border-amber p-4 bg-blue mb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-yellow tracking-wider">
              BETTERVERSE DUO
            </h1>
            <span className="border-2 border-amber px-3 py-1 text-sm font-black text-yellow uppercase">
              Room: {roomId}
            </span>

            {/* Loopback Mode Badge */}
            {isLoopback && (
              <span className="border-2 border-yellow bg-blue px-3 py-1 text-xs font-black text-yellow uppercase">
                Loopback Mode Active (?loopback=1)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Live Camera Privacy Badge - strictly Pink only when active */}
            {isCameraActive ? (
              <div className="border-2 border-pink bg-pink px-3 py-2 flex items-center gap-2">
                <span className="text-yellow text-sm font-black uppercase">
                  CAMERA LIVE - VIDEO STAYS ON THIS DEVICE
                </span>
              </div>
            ) : (
              <div className="border-2 border-amber px-3 py-2 flex items-center gap-2">
                <span className="text-amber text-sm font-black uppercase">
                  Camera Inactive
                </span>
              </div>
            )}

            {/* WebRTC Connection Status Badge */}
            {isLoopback ? (
              <div className="border-2 border-yellow bg-blue px-3 py-2">
                <span className="text-yellow text-sm font-black uppercase">
                  Peer: Loopback Test
                </span>
              </div>
            ) : isPartnerConnected ? (
              <div className="border-2 border-yellow bg-blue px-3 py-2">
                <span className="text-yellow text-sm font-black uppercase">
                  Peer Connected
                </span>
              </div>
            ) : partnerPresence ? (
              <div className="border-2 border-amber bg-blue px-3 py-2">
                <span className="text-amber text-sm font-black uppercase">
                  Connecting... ({webrtcState})
                </span>
              </div>
            ) : (
              <div className="border-2 border-amber bg-blue px-3 py-2">
                <span className="text-amber text-sm font-black uppercase">
                  Waiting For Partner
                </span>
              </div>
            )}

            {/* Recenter Button */}
            <button
              type="button"
              onClick={handleRecenter}
              className="bg-yellow text-blue border-4 border-yellow hover:border-amber px-4 py-2 text-base font-black uppercase cursor-pointer"
            >
              Recenter Pose
            </button>

            {/* Copy Invite Link */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="bg-yellow text-blue border-4 border-yellow hover:border-amber px-4 py-2 text-base font-black uppercase cursor-pointer"
            >
              {copied ? 'Link Copied!' : 'Copy Invite Link'}
            </button>

            {/* Leave Room Button */}
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="bg-pink text-yellow border-4 border-pink hover:border-yellow px-4 py-2 text-base font-black uppercase cursor-pointer"
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* Multi-Tab Alert Banner */}
        {hasMultiTab && (
          <div role="alert" className="mt-3 border-4 border-pink bg-pink p-3 text-center">
            <span className="text-yellow text-sm font-black uppercase">
              Notice: This room is currently open in another browser tab on this device.
            </span>
          </div>
        )}
      </header>

      {/* Room Access Error Banner */}
      {roomError && (
        <div role="alert" className="border-4 border-pink bg-pink p-6 mb-3 text-center space-y-4">
          <h2 className="text-2xl font-black text-yellow uppercase">
            Room Access Notice
          </h2>
          <p className="text-base font-bold text-yellow max-w-lg mx-auto">
            {roomError.message}
          </p>
          <div className="flex justify-center gap-4">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="bg-yellow text-blue border-4 border-yellow px-6 py-2 text-base font-black uppercase cursor-pointer"
            >
              Return Home
            </button>
            {roomError.type === 'room_not_found' && (
              <button
                type="button"
                onClick={() => handleJoinOrCreateRoom(true)}
                className="bg-yellow text-blue border-4 border-yellow px-6 py-2 text-base font-black uppercase cursor-pointer"
              >
                Create This Room
              </button>
            )}
            {roomError.type === 'network_error' && (
              <button
                type="button"
                onClick={() => handleJoinOrCreateRoom(false)}
                className="bg-blue text-yellow border-4 border-yellow px-6 py-2 text-base font-black uppercase cursor-pointer"
              >
                Retry Join
              </button>
            )}
          </div>
        </div>
      )}

      {/* Avatar Picker & Stage Viewport Toolbar */}
      {!roomError && (
        <section className="border-4 border-amber p-3 bg-blue mb-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <AvatarPicker
              selectedId={selectedAvatar.id}
              onSelect={handleSelectAvatar}
            />
            <ThemeSelector
              currentTheme={theme}
              onSelectTheme={handleSelectTheme}
            />
            <WorldSelector
              currentWorld={worldId}
              onSelectWorld={handleSelectWorld}
            />
          </div>

          {/* Voice & Spatial Audio Controls */}
          <AudioControls
            onAudioTrackReady={handleAudioTrackReady}
            remoteAudioStream={remoteAudioStream}
          />

          {/* Couple Activities (High Five, Heart, Sparkle, Duo Polaroid) */}
          <SharedActivities
            roomId={roomId}
            onSendActivity={handleSendActivity}
            incomingActivity={incomingActivity}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPip((p) => !p)}
              className="min-h-[44px] bg-blue text-yellow border-4 border-amber hover:border-yellow px-4 py-2 text-sm font-black uppercase cursor-pointer"
            >
              {showPip ? 'Hide Tracking PiP' : 'Show Tracking PiP'}
            </button>
          </div>
        </section>
      )}

      {/* Main 3D Duo Avatar Stage Viewport */}
      {!roomError && (
        <section className="flex-1 relative flex flex-col min-h-[480px]">
          <DynamicDualAvatarScene
            roomId={roomId}
            vrmUrl={selectedAvatar.vrmUrl}
            partnerVrmUrl={partnerVrmUrl}
            trackingFrameRef={localFrameRef}
            remotePacketRef={remotePacketRef}
            isPartnerConnected={isPartnerConnected}
            isLoopback={isLoopback}
            partnerDisplayName={partnerPresence?.displayName}
            onMotionState={handleMotionState}
            onRenderFps={setAvatarFps}
            recenterTrigger={recenterTrigger}
            isWeakConnection={isWeakConnection}
            theme={theme}
            worldId={worldId}
          />

          {/* Floating Tracking PiP Container */}
          {showPip && (
            <div className="absolute bottom-4 right-4 z-30">
              <TrackingView
                isCompact
                onFrame={handleFrame}
                onCameraActiveChange={setIsCameraActive}
                onTelemetryChange={setTrackingTelemetry}
              />
            </div>
          )}
        </section>
      )}

      {/* Bottom Performance & WebRTC Telemetry Footnote */}
      <footer className="border-4 border-amber p-4 bg-blue mt-3">
        {/* Quick Keyboard Shortcuts Legend */}
        <div className="flex flex-wrap items-center gap-3 border-b-2 border-amber pb-2 mb-3 text-xs font-black text-yellow">
          <span className="text-amber uppercase">Controls:</span>
          <span><kbd className="border border-amber px-1.5 py-0.5 text-yellow font-black">WASD / Arrows</kbd> Move Avatar</span>
          <span><kbd className="border border-amber px-1.5 py-0.5 text-yellow font-black">R</kbd> Recenter</span>
          <span><kbd className="border border-amber px-1.5 py-0.5 text-yellow font-black">H</kbd> Heart</span>
          <span><kbd className="border border-amber px-1.5 py-0.5 text-yellow font-black">S</kbd> Sparkle</span>
          <span><kbd className="border border-amber px-1.5 py-0.5 text-yellow font-black">F</kbd> High Five</span>
          <span><kbd className="border border-amber px-1.5 py-0.5 text-yellow font-black">P</kbd> Photo</span>
          <span><kbd className="border border-amber px-1.5 py-0.5 text-yellow font-black">T</kbd> PiP</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-yellow">
            <div>
              <span className="text-amber uppercase">Avatar Render: </span>
              <span className="text-yellow text-sm font-black">{avatarFps} FPS</span>
            </div>
            <div>
              <span className="text-amber uppercase">Tracking: </span>
              <span className="text-yellow text-sm font-black">
                {isCameraActive ? `${trackingTelemetry.fps} FPS` : '--'}
              </span>
            </div>
            <div>
              <span className="text-amber uppercase">Inference: </span>
              <span className="text-yellow text-sm font-black">
                {isCameraActive ? `${trackingTelemetry.totalInferenceLatencyMs} ms` : '--'}
              </span>
            </div>
            <div>
              <span className="text-amber uppercase">Peer RTT: </span>
              <span className="text-yellow text-sm font-black">
                {isLoopback ? '0 ms (Local)' : peerRtt !== null ? `${peerRtt} ms` : '--'}
              </span>
            </div>
            <div>
              <span className="text-amber uppercase">Candidate: </span>
              <span className="text-yellow text-sm font-black uppercase">
                {isLoopback ? 'loopback' : candidateType}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="border-2 border-amber px-3 py-1 text-xs font-black text-yellow uppercase">
              Budget: 150 ms end-to-end (Stage 4)
            </span>
            <span className="border-2 border-yellow bg-blue px-3 py-1 text-xs font-black text-yellow uppercase">
              Stage 6 Activities &amp; Duo Connected
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
