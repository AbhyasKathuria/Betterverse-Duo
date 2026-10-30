import { isNewerSequence, type ControlMessage } from './types';
import { decodeMotionPacket, type DecodedMotionPacket } from './packet';

export interface PeerConnectionCallbacks {
  onMotionPacket?: (packet: DecodedMotionPacket) => void;
  onControlMessage?: (msg: ControlMessage) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onCandidateTypeChange?: (type: 'host' | 'srflx' | 'relay' | 'unknown') => void;
  onRttChange?: (rttMs: number) => void;
  onSendIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onWeakConnectionChange?: (isWeak: boolean) => void;
  onRemoteAudioTrack?: (stream: MediaStream) => void;
}

export class BetterversePeer {
  private pc: RTCPeerConnection | null = null;
  private poseChannel: RTCDataChannel | null = null;
  private controlChannel: RTCDataChannel | null = null;

  private isOfferer: boolean;
  private callbacks: PeerConnectionCallbacks;

  // Audio track management
  private localAudioSender: RTCRtpSender | null = null;
  private pendingAudioTrack: { track: MediaStreamTrack; stream: MediaStream } | null = null;

  // ICE candidate queue before remote description is set
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;

  // Ping/Pong RTT tracking
  private rttHistory: number[] = [];
  private pingIntervalId: number | null = null;

  // Sequence tracking
  private lastReceivedSeq = -1;
  private lastPacketTime = 0;
  private healthCheckIntervalId: number | null = null;

  constructor(isOfferer: boolean, callbacks: PeerConnectionCallbacks) {
    this.isOfferer = isOfferer;
    this.callbacks = callbacks;
  }

  public async initialize(iceServers: RTCIceServer[]): Promise<void> {
    this.pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 2,
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onSendIceCandidate?.(event.candidate.toJSON());
      }
    };

    // Listen for incoming remote tracks (Stage 5 Voice & Spatial Audio)
    this.pc.ontrack = (event) => {
      if (event.track.kind === 'audio' && event.streams[0]) {
        this.callbacks.onRemoteAudioTrack?.(event.streams[0]);
      }
    };

    if (this.pendingAudioTrack) {
      try {
        this.localAudioSender = this.pc.addTrack(this.pendingAudioTrack.track, this.pendingAudioTrack.stream);
        this.pendingAudioTrack = null;
      } catch (err) {
        console.warn('Failed to add pending audio track:', err);
      }
    }

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const state = this.pc.connectionState;
      this.callbacks.onConnectionStateChange?.(state);

      if (state === 'connected') {
        this.startStatsLoop();
      } else if (state === 'disconnected') {
        // Wait 3s before triggering ICE restart
        setTimeout(() => {
          if (this.pc && this.pc.connectionState === 'disconnected') {
            try {
              this.pc.restartIce();
            } catch {
              // Ignored
            }
          }
        }, 3000);
      }
    };

    if (this.isOfferer) {
      // Offerer creates channels
      this.poseChannel = this.pc.createDataChannel('pose', {
        ordered: false,
        maxRetransmits: 0, // Unreliable, ultra-low latency for motion
      });
      this.setupPoseChannel(this.poseChannel);

      this.controlChannel = this.pc.createDataChannel('control', {
        ordered: true, // Reliable for hello & ping/pong
      });
      this.setupControlChannel(this.controlChannel);
    } else {
      // Answerer listens for channels created by offerer
      this.pc.ondatachannel = (event) => {
        const ch = event.channel;
        if (ch.label === 'pose') {
          this.poseChannel = ch;
          this.setupPoseChannel(ch);
        } else if (ch.label === 'control') {
          this.controlChannel = ch;
          this.setupControlChannel(ch);
        }
      };
    }

    this.startHealthCheck();
  }

  private setupPoseChannel(ch: RTCDataChannel): void {
    ch.binaryType = 'arraybuffer';
    ch.onmessage = (event) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          const decoded = decodeMotionPacket(event.data);
          this.lastPacketTime = performance.now();

          // Drop packets with older or equal sequence numbers
          if (isNewerSequence(decoded.sequence, this.lastReceivedSeq)) {
            this.lastReceivedSeq = decoded.sequence;
            this.callbacks.onMotionPacket?.(decoded);
          }
        }
      } catch (err) {
        console.warn('Error parsing incoming pose packet:', err);
      }
    };
  }

  private setupControlChannel(ch: RTCDataChannel): void {
    ch.onopen = () => {
      this.startPingPongLoop();
    };

    ch.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ControlMessage;
        if (msg.type === 'ping') {
          // Echo pong immediately
          this.sendControlMessage({ type: 'pong', t: msg.t });
        } else if (msg.type === 'pong') {
          const rtt = performance.now() - msg.t;
          this.recordRtt(rtt);
        } else {
          this.callbacks.onControlMessage?.(msg);
        }
      } catch (err) {
        console.warn('Error parsing control message:', err);
      }
    };
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  public async handleOfferAndCreateAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescSet = true;
    await this.drainPendingCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.remoteDescSet = true;
    await this.drainPendingCandidates();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescSet || !this.pc) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Failed to add ICE candidate:', err);
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    if (!this.pc) return;
    for (const c of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.warn('Failed to add queued ICE candidate:', err);
      }
    }
    this.pendingCandidates = [];
  }

  public setAudioTrack(track: MediaStreamTrack | null, stream?: MediaStream): void {
    if (!this.pc) {
      if (track && stream) {
        this.pendingAudioTrack = { track, stream };
      } else {
        this.pendingAudioTrack = null;
      }
      return;
    }

    try {
      if (track && stream) {
        if (this.localAudioSender) {
          this.localAudioSender.replaceTrack(track);
        } else {
          this.localAudioSender = this.pc.addTrack(track, stream);
        }
      } else if (!track && this.localAudioSender) {
        this.localAudioSender.replaceTrack(null);
      }
    } catch (err) {
      console.warn('Failed to set audio track on peer connection:', err);
    }
  }

  public sendMotionPacket(buffer: ArrayBuffer): boolean {
    if (!this.poseChannel || this.poseChannel.readyState !== 'open') return false;
    // Skip packet if bufferedAmount is high to prevent queue congestion
    if (this.poseChannel.bufferedAmount > 65536) return false;

    try {
      this.poseChannel.send(buffer);
      return true;
    } catch {
      return false;
    }
  }

  public sendControlMessage(msg: ControlMessage): void {
    if (!this.controlChannel || this.controlChannel.readyState !== 'open') return;
    try {
      this.controlChannel.send(JSON.stringify(msg));
    } catch (err) {
      console.warn('Failed to send control message:', err);
    }
  }

  private startPingPongLoop(): void {
    if (this.pingIntervalId !== null) clearInterval(this.pingIntervalId);
    // Send ping every 1 second
    this.pingIntervalId = window.setInterval(() => {
      this.sendControlMessage({ type: 'ping', t: performance.now() });
    }, 1000);
  }

  private recordRtt(rtt: number): void {
    this.rttHistory.push(rtt);
    if (this.rttHistory.length > 5) {
      this.rttHistory.shift();
    }
    // Calculate median RTT of last 5
    const sorted = [...this.rttHistory].sort((a, b) => a - b);
    const median = Math.round(sorted[Math.floor(sorted.length / 2)]);
    this.callbacks.onRttChange?.(median);
  }

  private startHealthCheck(): void {
    if (this.healthCheckIntervalId !== null) clearInterval(this.healthCheckIntervalId);
    this.healthCheckIntervalId = window.setInterval(() => {
      if (this.lastPacketTime > 0) {
        const isWeak = performance.now() - this.lastPacketTime > 500;
        this.callbacks.onWeakConnectionChange?.(isWeak);
      }
    }, 250);
  }

  private startStatsLoop(): void {
    if (!this.pc) return;
    const interval = window.setInterval(async () => {
      if (!this.pc || this.pc.connectionState !== 'connected') {
        clearInterval(interval);
        return;
      }

      try {
        const stats = await this.pc.getStats();
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const localCandidate = stats.get(report.localCandidateId);
            if (localCandidate && localCandidate.candidateType) {
              const type = localCandidate.candidateType as 'host' | 'srflx' | 'relay';
              this.callbacks.onCandidateTypeChange?.(type);
            }
          }
        });
      } catch {
        // Ignored
      }
    }, 1000);
  }

  public close(): void {
    if (this.pingIntervalId !== null) clearInterval(this.pingIntervalId);
    if (this.healthCheckIntervalId !== null) clearInterval(this.healthCheckIntervalId);

    try {
      this.poseChannel?.close();
    } catch {
      // Ignored
    }
    try {
      this.controlChannel?.close();
    } catch {
      // Ignored
    }
    try {
      this.pc?.close();
    } catch {
      // Ignored
    }

    this.pc = null;
    this.poseChannel = null;
    this.controlChannel = null;
    this.remoteDescSet = false;
    this.pendingCandidates = [];
    this.rttHistory = [];
  }
}
