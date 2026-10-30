'use client';

export interface SpatialAudioOptions {
  partnerPosition?: { x: number; y: number; z: number };
  listenerPosition?: { x: number; y: number; z: number };
}

export class SpatialAudioEngine {
  private audioCtx: AudioContext | null = null;
  private pannerNode: PannerNode | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private fallbackAudio: HTMLAudioElement | null = null;
  private isSpatialActive = false;
  private dataArray: Uint8Array | null = null;

  constructor() {
    // Initialized lazily on user gesture or stream arrival
  }

  public async initialize(): Promise<void> {
    if (this.audioCtx) return;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio API not supported');

      this.audioCtx = new AudioContextClass();

      // Configure Listener orientation (looking forward into the screen -Z)
      if (this.audioCtx.listener) {
        const listener = this.audioCtx.listener;
        if (listener.positionX) {
          listener.positionX.value = 0;
          listener.positionY.value = 0;
          listener.positionZ.value = 0;
          listener.forwardX.value = 0;
          listener.forwardY.value = 0;
          listener.forwardZ.value = -1;
          listener.upX.value = 0;
          listener.upY.value = 1;
          listener.upZ.value = 0;
        } else {
          // Legacy Web Audio API orientation fallback
          listener.setPosition(0, 0, 0);
          listener.setOrientation(0, 0, -1, 0, 1, 0);
        }
      }

      // HRTF Panner Node
      this.pannerNode = this.audioCtx.createPanner();
      this.pannerNode.panningModel = 'HRTF';
      this.pannerNode.distanceModel = 'inverse';
      this.pannerNode.refDistance = 1;
      this.pannerNode.maxDistance = 10;
      this.pannerNode.rolloffFactor = 1;
      this.pannerNode.coneInnerAngle = 360;

      // Position partner slightly to the right side (1.2m, 0, -0.5m)
      this.setPartnerPosition(1.2, 0, -0.5);

      // Gain Node (Volume)
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;

      // Analyser Node for Volume RMS meter
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 64;
      this.dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

      // Connect: Panner -> Gain -> Analyser -> Destination
      this.pannerNode.connect(this.gainNode);
      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);

      this.isSpatialActive = true;
    } catch (err) {
      console.warn('Web Audio HRTF initialization failed; using stereo fallback:', err);
      this.isSpatialActive = false;
    }
  }

  public setPartnerPosition(x: number, y: number, z: number): void {
    if (!this.pannerNode) return;
    if (this.pannerNode.positionX) {
      this.pannerNode.positionX.value = x;
      this.pannerNode.positionY.value = y;
      this.pannerNode.positionZ.value = z;
    } else {
      // Legacy Web Audio API fallback
      this.pannerNode.setPosition(x, y, z);
    }
  }

  public async attachRemoteStream(stream: MediaStream): Promise<void> {
    await this.initialize();

    if (this.audioCtx && this.isSpatialActive && this.pannerNode) {
      try {
        if (this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume();
        }

        if (this.sourceNode) {
          this.sourceNode.disconnect();
        }

        this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
        this.sourceNode.connect(this.pannerNode);
        return;
      } catch (err) {
        console.warn('Failed to route stream through Web Audio; engaging direct audio fallback:', err);
      }
    }

    // Direct HTMLAudioElement Fallback
    if (!this.fallbackAudio) {
      this.fallbackAudio = new Audio();
      this.fallbackAudio.autoplay = true;
      (this.fallbackAudio as unknown as { playsInline?: boolean }).playsInline = true;
    }
    this.fallbackAudio.srcObject = stream;
    await this.fallbackAudio.play().catch((e) => console.warn('Audio element play interrupted:', e));
  }

  public async resume(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume().catch(() => {});
    }
    if (this.fallbackAudio && this.fallbackAudio.paused) {
      await this.fallbackAudio.play().catch(() => {});
    }
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = clamped;
    }
    if (this.fallbackAudio) {
      this.fallbackAudio.volume = clamped;
    }
  }

  public getRmsVolume(): number {
    if (!this.analyserNode || !this.dataArray) return 0;

    // TypeScript 5.7+ requires Uint8Array<ArrayBuffer> for getByteTimeDomainData
    this.analyserNode.getByteTimeDomainData(this.dataArray as unknown as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = (this.dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    return Math.min(1.0, rms * 3.0); // Boosted for visual meter clarity
  }

  public destroy(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.pannerNode) {
      this.pannerNode.disconnect();
      this.pannerNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.fallbackAudio) {
      this.fallbackAudio.srcObject = null;
      this.fallbackAudio = null;
    }
  }
}

/**
 * Helper to analyze local microphone audio volume (RMS)
 */
export class LocalAudioMeter {
  private audioCtx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;

  constructor(stream: MediaStream) {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioCtx = new AudioContextClass();
      this.source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.source.connect(this.analyser);
    } catch (err) {
      console.warn('Could not initialize local audio meter:', err);
    }
  }

  public getRmsVolume(): number {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getByteTimeDomainData(this.dataArray as unknown as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = (this.dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    return Math.min(1.0, rms * 3.0);
  }

  public destroy(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
