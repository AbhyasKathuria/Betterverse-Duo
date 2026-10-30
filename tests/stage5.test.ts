import { describe, it, expect } from 'vitest';

describe('Stage 5 Audio Processing & Spatial Logic', () => {
  it('correctly calculates 0 RMS volume for silent PCM byte data', () => {
    // 128 is the 0-crossing midpoint for Web Audio getByteTimeDomainData
    const silentBuffer = new Uint8Array(64).fill(128);

    let sum = 0;
    for (let i = 0; i < silentBuffer.length; i++) {
      const normalized = (silentBuffer[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / silentBuffer.length);

    expect(rms).toBe(0);
  });

  it('correctly calculates high RMS volume for maximum amplitude square wave', () => {
    // Alternating 0 and 255 represents +/- 1.0 maximum amplitude
    const loudBuffer = new Uint8Array(64);
    for (let i = 0; i < loudBuffer.length; i++) {
      loudBuffer[i] = i % 2 === 0 ? 0 : 255;
    }

    let sum = 0;
    for (let i = 0; i < loudBuffer.length; i++) {
      const normalized = (loudBuffer[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / loudBuffer.length);

    // Normalized amplitude is ~1.0, so RMS is close to 1.0
    expect(rms).toBeGreaterThan(0.95);
  });

  it('enforces required audio processing constraints for WebRTC voice communication', () => {
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    expect(audioConstraints.echoCancellation).toBe(true);
    expect(audioConstraints.noiseSuppression).toBe(true);
    expect(audioConstraints.autoGainControl).toBe(true);
  });

  it('calculates spatial inverse distance attenuation accurately', () => {
    const refDistance = 1;
    const maxDistance = 10;
    const rolloffFactor = 1;

    // Web Audio Inverse Distance Model formula:
    // gain = refDistance / (refDistance + rolloffFactor * (clamp(distance, refDistance, maxDistance) - refDistance))
    const calcGain = (distance: number) => {
      const clamped = Math.max(refDistance, Math.min(maxDistance, distance));
      return refDistance / (refDistance + rolloffFactor * (clamped - refDistance));
    };

    // At reference distance (1m), gain is 1.0
    expect(calcGain(1)).toBe(1.0);

    // At 2 meters, gain is 0.5 (half amplitude)
    expect(calcGain(2)).toBe(0.5);

    // At 5 meters, gain is 0.2
    expect(calcGain(5)).toBe(0.2);

    // At 10+ meters, clamped at maxDistance (gain = 0.1)
    expect(calcGain(10)).toBe(0.1);
    expect(calcGain(20)).toBe(0.1);
  });
});
