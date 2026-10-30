import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  encodeMotionPacket,
  decodeMotionPacket,
  PACKET_BYTE_LENGTH,
  type UnencodedMotionState,
} from '../src/lib/webrtc/packet';
import { isNewerSequence, isOfferer } from '../src/lib/webrtc/types';

describe('WebRTC Binary Motion Packet Encoding & Decoding', () => {
  it(`encodes to exact fixed byte length of ${PACKET_BYTE_LENGTH} bytes`, () => {
    const state: UnencodedMotionState = {
      sequence: 142,
      timestamp: 987654321,
      quaternions: {
        head: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3)),
        spine: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, 0.1, 0)),
        leftUpperArm: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.2)),
        leftLowerArm: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0)),
        rightUpperArm: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 1.2)),
        rightLowerArm: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0)),
      },
      fingerCurls: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      blendshapes: {
        blinkLeft: 0.8,
        blinkRight: 0.2,
        aa: 0.5,
        happy: 1.0,
      },
    };

    const buffer = encodeMotionPacket(state);
    expect(buffer.byteLength).toBe(PACKET_BYTE_LENGTH);
  });

  it('preserves header sequence and timestamp', () => {
    const seq = 54321;
    const ts = 123456789;
    const state: UnencodedMotionState = {
      sequence: seq,
      timestamp: ts,
      quaternions: {
        head: new THREE.Quaternion(),
        spine: new THREE.Quaternion(),
        leftUpperArm: new THREE.Quaternion(),
        leftLowerArm: new THREE.Quaternion(),
        rightUpperArm: new THREE.Quaternion(),
        rightLowerArm: new THREE.Quaternion(),
      },
      fingerCurls: new Array(10).fill(0),
      blendshapes: {},
    };

    const buffer = encodeMotionPacket(state);
    const decoded = decodeMotionPacket(buffer);

    expect(decoded.sequence).toBe(seq);
    expect(decoded.timestamp).toBe(ts);
  });

  it('round-trips bone quaternions with angular error < 0.5 degrees', () => {
    const headOrig = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, -0.3, 0.15));
    const armOrig = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.8, 0.4, -0.6));

    const state: UnencodedMotionState = {
      sequence: 1,
      timestamp: 1000,
      quaternions: {
        head: headOrig,
        spine: new THREE.Quaternion(),
        leftUpperArm: armOrig,
        leftLowerArm: new THREE.Quaternion(),
        rightUpperArm: new THREE.Quaternion(),
        rightLowerArm: new THREE.Quaternion(),
      },
      fingerCurls: new Array(10).fill(0),
      blendshapes: {},
    };

    const buffer = encodeMotionPacket(state);
    const decoded = decodeMotionPacket(buffer);

    // Three.js angleTo returns radians between two quaternions
    const headAngleDeg = (headOrig.angleTo(decoded.quaternions.head) * 180) / Math.PI;
    const armAngleDeg = (armOrig.angleTo(decoded.quaternions.leftUpperArm) * 180) / Math.PI;

    expect(headAngleDeg).toBeLessThan(0.5);
    expect(armAngleDeg).toBeLessThan(0.5);
  });

  it('quantizes finger curls and blendshapes accurately', () => {
    const state: UnencodedMotionState = {
      sequence: 10,
      timestamp: 2000,
      quaternions: {
        head: new THREE.Quaternion(),
        spine: new THREE.Quaternion(),
        leftUpperArm: new THREE.Quaternion(),
        leftLowerArm: new THREE.Quaternion(),
        rightUpperArm: new THREE.Quaternion(),
        rightLowerArm: new THREE.Quaternion(),
      },
      fingerCurls: [0, 0.3, 0.7, 1.2, 1.5, 0.2, 0.4, 0.6, 0.8, 1.0],
      blendshapes: {
        blinkLeft: 0.75,
        aa: 0.5,
        happy: 0.9,
      },
    };

    const buffer = encodeMotionPacket(state);
    const decoded = decodeMotionPacket(buffer);

    // Curls: range 0 to Math.PI / 2 (~1.5707) mapped to 255 steps (~0.006 rad resolution)
    for (let i = 0; i < 10; i++) {
      expect(Math.abs(decoded.fingerCurls[i] - state.fingerCurls[i])).toBeLessThan(0.02);
    }

    // Blendshapes: 0.0 to 1.0 mapped to 255 steps (~0.004 resolution)
    expect(Math.abs(decoded.blendshapes.blinkLeft - 0.75)).toBeLessThan(0.01);
    expect(Math.abs(decoded.blendshapes.aa - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(decoded.blendshapes.happy - 0.9)).toBeLessThan(0.01);
  });

  it('throws an error on truncated packet', () => {
    const truncatedBuffer = new ArrayBuffer(50);
    expect(() => decodeMotionPacket(truncatedBuffer)).toThrow(/Invalid packet length/);
  });
});

describe('Sequence Wraparound Comparison (isNewerSequence)', () => {
  it('accepts any initial sequence when lastSeq is -1', () => {
    expect(isNewerSequence(0, -1)).toBe(true);
    expect(isNewerSequence(5000, -1)).toBe(true);
    expect(isNewerSequence(65535, -1)).toBe(true);
  });

  it('identifies sequentially strictly increasing numbers', () => {
    expect(isNewerSequence(1, 0)).toBe(true);
    expect(isNewerSequence(100, 99)).toBe(true);
    expect(isNewerSequence(500, 400)).toBe(true);
  });

  it('rejects duplicate or older numbers in standard range', () => {
    expect(isNewerSequence(10, 10)).toBe(false);
    expect(isNewerSequence(9, 10)).toBe(false);
    expect(isNewerSequence(1, 100)).toBe(false);
  });

  it('handles 16-bit wraparound correctly (65535 -> 0, 1, 2)', () => {
    expect(isNewerSequence(0, 65535)).toBe(true);
    expect(isNewerSequence(1, 65535)).toBe(true);
    expect(isNewerSequence(5, 65530)).toBe(true);
  });

  it('rejects stale packets across wraparound boundary', () => {
    expect(isNewerSequence(65535, 0)).toBe(false);
    expect(isNewerSequence(65530, 5)).toBe(false);
  });
});

describe('Deterministic Role Selection (isOfferer)', () => {
  it('assigns offerer to the lexicographically smaller peer ID', () => {
    expect(isOfferer('peer-alice', 'peer-bob')).toBe(true);
    expect(isOfferer('peer-bob', 'peer-alice')).toBe(false);
    expect(isOfferer('012345', 'abcdef')).toBe(true);
    expect(isOfferer('xyz', 'abc')).toBe(false);
  });
});
