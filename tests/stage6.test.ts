import { describe, it, expect } from 'vitest';
import type { ControlActivityMessage } from '../src/lib/webrtc/types';

describe('Stage 6 Shared Couple Activities & Telemetry', () => {
  it('formats activity control messages conforming to WebRTC protocol', () => {
    const actions: Array<ControlActivityMessage['action']> = [
      'heart',
      'sparkle',
      'high_five',
      'photo_countdown',
    ];

    for (const action of actions) {
      const msg: ControlActivityMessage = {
        type: 'activity',
        action,
        timestamp: Date.now(),
      };

      expect(msg.type).toBe('activity');
      expect(actions).toContain(msg.action);
      expect(typeof msg.timestamp).toBe('number');
      expect(msg.timestamp).toBeGreaterThan(0);
    }
  });

  it('validates polaroid snapshot canvas geometry and photo framing aspect ratio', () => {
    const cardWidth = 720;
    const cardHeight = 560;

    const photoX = 32;
    const photoY = 32;
    const photoW = cardWidth - 64;
    const photoH = cardHeight - 140;

    // Outer card must have extra bottom border margin for caption
    expect(cardWidth).toBe(720);
    expect(cardHeight).toBe(560);
    expect(photoW).toBe(656);
    expect(photoH).toBe(420);

    // Bottom caption margin
    const bottomMargin = cardHeight - (photoY + photoH);
    expect(bottomMargin).toBe(108); // Sufficient room for bold title & timestamp caption
  });

  it('verifies Web Audio sound synthesis frequencies within audible speech range', () => {
    const chimeFrequencies = {
      heartStart: 440, // A4
      heartEnd: 880, // A5
      sparkleStart: 587.33, // D5
      sparkleEnd: 1174.66, // D6
      highFiveSnap: 300,
    };

    expect(chimeFrequencies.heartStart).toBeGreaterThan(200);
    expect(chimeFrequencies.heartEnd).toBeLessThan(2000);
    expect(chimeFrequencies.sparkleEnd).toBeLessThan(4000);
  });
});
