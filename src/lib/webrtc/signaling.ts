import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { isOfferer, type PeerPresenceState, type SignalingPayload, type ControlActivityMessage } from './types';
import { BetterversePeer } from './peer-connection';
import type { DecodedMotionPacket } from './packet';

export interface SignalingCallbacks {
  onPartnerJoined?: (partner: PeerPresenceState) => void;
  onPartnerLeft?: () => void;
  onRemoteMotionPacket?: (packet: DecodedMotionPacket) => void;
  onPartnerAvatarChange?: (avatarId: string) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onCandidateTypeChange?: (type: 'host' | 'srflx' | 'relay' | 'unknown') => void;
  onRttChange?: (rttMs: number) => void;
  onWeakConnectionChange?: (isWeak: boolean) => void;
  onMultiTabWarning?: (hasMultiTab: boolean) => void;
  onRemoteAudioStream?: (stream: MediaStream) => void;
  onPartnerActivity?: (msg: ControlActivityMessage) => void;
  onError?: (err: string) => void;
}

export class SupabaseSignalingClient {
  private roomId: string;
  private localPeer: PeerPresenceState;
  private callbacks: SignalingCallbacks;

  private channel: RealtimeChannel | null = null;
  private peer: BetterversePeer | null = null;
  private currentPartnerPeerId: string | null = null;
  private iceServers: RTCIceServer[] = [];
  private isDestroyed = false;
  private currentAudioTrack: { track: MediaStreamTrack; stream: MediaStream } | null = null;

  constructor(roomId: string, localPeer: PeerPresenceState, callbacks: SignalingCallbacks) {
    this.roomId = roomId;
    this.localPeer = localPeer;
    this.callbacks = callbacks;
  }

  public async connect(): Promise<void> {
    const supabase = getSupabase();

    // 1. Fetch ICE servers (STUN + optional TURN from /api/turn)
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/turn', {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.ok) {
        const turnData = await res.json();
        this.iceServers = turnData.iceServers;
      }
    } catch (err) {
      console.warn('Using default STUN server fallback:', err);
      this.iceServers = [{ urls: process.env.NEXT_PUBLIC_STUN_SERVER || 'stun:stun.l.google.com:19302' }];
    }

    // 2. Set Realtime Auth token for private channel authorization
    await supabase.realtime.setAuth();

    // 3. Subscribe to private room channel with presence
    const topic = `room:${this.roomId}`;
    this.channel = supabase.channel(topic, {
      config: {
        private: true,
        presence: { key: this.localPeer.peerId },
      },
    });

    // Handle Presence state to discover peer
    this.channel.on('presence', { event: 'sync' }, () => {
      if (this.isDestroyed || !this.channel) return;
      this.handlePresenceSync();
    });

    // Handle incoming WebRTC Broadcast signals (offer, answer, ICE)
    this.channel.on('broadcast', { event: 'signaling' }, async ({ payload }) => {
      if (this.isDestroyed || !payload) return;
      await this.handleSignalingPayload(payload as SignalingPayload);
    });

    await this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track self in presence
        await this.channel?.track(this.localPeer);
      }
    });
  }

  private async handlePresenceSync(): Promise<void> {
    if (!this.channel) return;
    const presenceState = this.channel.presenceState<PeerPresenceState>();
    const allPeers: PeerPresenceState[] = [];

    for (const key of Object.keys(presenceState)) {
      const presences = presenceState[key];
      if (presences && presences.length > 0) {
        allPeers.push(presences[0]);
      }
    }

    // Check for more than 2 peers in the same room (e.g. multiple tabs)
    if (allPeers.length > 2) {
      this.callbacks.onMultiTabWarning?.(true);
    } else {
      this.callbacks.onMultiTabWarning?.(false);
    }

    // Find the other peer (partner)
    const partner = allPeers.find((p) => p.peerId !== this.localPeer.peerId);

    if (partner) {
      if (this.currentPartnerPeerId !== partner.peerId) {
        // New partner or refreshed partner -> tear down old peer connection and initiate
        this.teardownPeerConnection();
        this.currentPartnerPeerId = partner.peerId;
        this.callbacks.onPartnerJoined?.(partner);

        // Determine WebRTC negotiation role:
        // Lexicographically smaller peerId creates the offer
        const amOfferer = isOfferer(this.localPeer.peerId, partner.peerId);
        await this.setupPeerConnection(amOfferer, partner.peerId);

        if (amOfferer) {
          await this.initiateOffer(partner.peerId);
        }
      }
    } else {
      // Partner left
      if (this.currentPartnerPeerId !== null) {
        this.teardownPeerConnection();
        this.currentPartnerPeerId = null;
        this.callbacks.onPartnerLeft?.();
      }
    }
  }

  private async setupPeerConnection(amOfferer: boolean, partnerPeerId: string): Promise<void> {
    this.peer = new BetterversePeer(amOfferer, {
      onMotionPacket: (packet) => {
        this.callbacks.onRemoteMotionPacket?.(packet);
      },
      onControlMessage: (msg) => {
        if (msg.type === 'hello') {
          this.callbacks.onPartnerAvatarChange?.(msg.avatarId);
        } else if (msg.type === 'activity') {
          this.callbacks.onPartnerActivity?.(msg);
        }
      },
      onConnectionStateChange: (state) => {
        this.callbacks.onConnectionStateChange?.(state);
      },
      onCandidateTypeChange: (type) => {
        this.callbacks.onCandidateTypeChange?.(type);
      },
      onRttChange: (rtt) => {
        this.callbacks.onRttChange?.(rtt);
      },
      onWeakConnectionChange: (isWeak) => {
        this.callbacks.onWeakConnectionChange?.(isWeak);
      },
      onSendIceCandidate: (candidate) => {
        this.sendBroadcast('ice-candidate', partnerPeerId, candidate);
      },
      onRemoteAudioTrack: (stream) => {
        this.callbacks.onRemoteAudioStream?.(stream);
      },
    });

    if (this.currentAudioTrack) {
      this.peer.setAudioTrack(this.currentAudioTrack.track, this.currentAudioTrack.stream);
    }

    await this.peer.initialize(this.iceServers);

    // Send Hello message on control channel with avatarId
    this.peer.sendControlMessage({
      type: 'hello',
      peerId: this.localPeer.peerId,
      avatarId: this.localPeer.avatarId,
      displayName: this.localPeer.displayName,
      capabilities: ['motion_binary_v1'],
    });
  }

  private async initiateOffer(partnerPeerId: string): Promise<void> {
    if (!this.peer) return;
    try {
      const offer = await this.peer.createOffer();
      await this.sendBroadcast('offer', partnerPeerId, offer);
    } catch (err) {
      console.warn('Failed to create/send offer:', err);
    }
  }

  private async handleSignalingPayload(payload: SignalingPayload): Promise<void> {
    if (payload.targetPeerId !== this.localPeer.peerId) return;

    if (payload.type === 'offer') {
      if (!this.peer) {
        await this.setupPeerConnection(false, payload.senderPeerId);
      }
      if (this.peer && payload.data) {
        const answer = await this.peer.handleOfferAndCreateAnswer(payload.data as RTCSessionDescriptionInit);
        await this.sendBroadcast('answer', payload.senderPeerId, answer);
      }
    } else if (payload.type === 'answer') {
      if (this.peer && payload.data) {
        await this.peer.handleAnswer(payload.data as RTCSessionDescriptionInit);
      }
    } else if (payload.type === 'ice-candidate') {
      if (this.peer && payload.data) {
        await this.peer.addIceCandidate(payload.data as RTCIceCandidateInit);
      }
    }
  }

  private async sendBroadcast(
    type: SignalingPayload['type'],
    targetPeerId: string,
    data: SignalingPayload['data']
  ): Promise<void> {
    if (!this.channel) return;
    const payload: SignalingPayload = {
      type,
      senderPeerId: this.localPeer.peerId,
      targetPeerId,
      data,
    };
    await this.channel.send({
      type: 'broadcast',
      event: 'signaling',
      payload,
    });
  }

  public setAudioTrack(track: MediaStreamTrack | null, stream?: MediaStream): void {
    if (track && stream) {
      this.currentAudioTrack = { track, stream };
    } else {
      this.currentAudioTrack = null;
    }
    this.peer?.setAudioTrack(track, stream);
  }

  public sendMotionPacket(buffer: ArrayBuffer): boolean {
    return this.peer?.sendMotionPacket(buffer) ?? false;
  }

  public sendActivity(action: ControlActivityMessage['action']): void {
    this.peer?.sendControlMessage({
      type: 'activity',
      action,
      timestamp: Date.now(),
    });
  }

  public updateLocalAvatar(avatarId: string): void {
    this.localPeer.avatarId = avatarId;
    this.channel?.track(this.localPeer);
    this.peer?.sendControlMessage({
      type: 'hello',
      peerId: this.localPeer.peerId,
      avatarId,
      displayName: this.localPeer.displayName,
      capabilities: ['motion_binary_v1'],
    });
  }

  private teardownPeerConnection(): void {
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    }
  }

  public disconnect(): void {
    this.isDestroyed = true;
    this.teardownPeerConnection();
    if (this.channel) {
      const ch = this.channel;
      this.channel = null;
      ch.untrack().catch(() => {});
      ch.unsubscribe().catch(() => {});
    }
  }
}
