import * as THREE from 'three';

export interface DecodedMotionPacket {
  sequence: number;
  timestamp: number;
  quaternions: {
    head: THREE.Quaternion;
    spine: THREE.Quaternion;
    leftUpperArm: THREE.Quaternion;
    leftLowerArm: THREE.Quaternion;
    rightUpperArm: THREE.Quaternion;
    rightLowerArm: THREE.Quaternion;
  };
  fingerCurls: number[]; // 10 finger curls (5 left, 5 right)
  blendshapes: Record<string, number>;
}

export interface UnencodedMotionState {
  sequence: number;
  timestamp: number;
  quaternions: {
    head: THREE.Quaternion;
    spine: THREE.Quaternion;
    leftUpperArm: THREE.Quaternion;
    leftLowerArm: THREE.Quaternion;
    rightUpperArm: THREE.Quaternion;
    rightLowerArm: THREE.Quaternion;
  };
  fingerCurls: number[];
  blendshapes: Record<string, number>;
}

const BLENDSHAPE_KEYS = [
  'blinkLeft',
  'blinkRight',
  'aa',
  'happy',
  'relaxed',
  'surprised',
  'angry',
  'sad',
  'ee',
  'oh',
] as const;

export const PACKET_BYTE_LENGTH = 75; // 1 + 2 + 4 + 48 + 10 + 10 = 75 bytes

/**
 * Encodes solved humanoid bone rotations, finger curls, and blendshapes
 * into a compact binary ArrayBuffer (< 100 bytes).
 */
export function encodeMotionPacket(state: UnencodedMotionState): ArrayBuffer {
  const buffer = new ArrayBuffer(PACKET_BYTE_LENGTH);
  const view = new DataView(buffer);

  // Header
  view.setUint8(0, 1); // Type 1 = Pose motion
  view.setUint16(1, state.sequence % 65536, true);
  view.setUint32(3, state.timestamp >>> 0, true);

  // 6 Quaternions (Head, Spine, LUpper, LLower, RUpper, RLower)
  const quats = [
    state.quaternions.head,
    state.quaternions.spine,
    state.quaternions.leftUpperArm,
    state.quaternions.leftLowerArm,
    state.quaternions.rightUpperArm,
    state.quaternions.rightLowerArm,
  ];

  let offset = 7;
  for (const q of quats) {
    view.setInt16(offset, Math.round(THREE.MathUtils.clamp(q.x, -1, 1) * 32767), true);
    view.setInt16(offset + 2, Math.round(THREE.MathUtils.clamp(q.y, -1, 1) * 32767), true);
    view.setInt16(offset + 4, Math.round(THREE.MathUtils.clamp(q.z, -1, 1) * 32767), true);
    view.setInt16(offset + 6, Math.round(THREE.MathUtils.clamp(q.w, -1, 1) * 32767), true);
    offset += 8;
  }

  // 10 Finger Curls (uint8: 0 to Math.PI/2)
  for (let i = 0; i < 10; i++) {
    const curl = state.fingerCurls[i] ?? 0;
    const norm = THREE.MathUtils.clamp(curl / (Math.PI * 0.5), 0, 1);
    view.setUint8(offset + i, Math.round(norm * 255));
  }
  offset += 10;

  // 10 Blendshape weights (uint8: 0.0 to 1.0)
  for (let i = 0; i < BLENDSHAPE_KEYS.length; i++) {
    const key = BLENDSHAPE_KEYS[i];
    const weight = state.blendshapes[key] ?? 0;
    view.setUint8(offset + i, Math.round(THREE.MathUtils.clamp(weight, 0, 1) * 255));
  }

  return buffer;
}

/**
 * Decodes a binary ArrayBuffer back into normalized bone quaternions, curls, and blendshapes.
 */
export function decodeMotionPacket(buffer: ArrayBuffer): DecodedMotionPacket {
  if (buffer.byteLength < PACKET_BYTE_LENGTH) {
    throw new Error(`Invalid packet length: ${buffer.byteLength} (expected ${PACKET_BYTE_LENGTH})`);
  }

  const view = new DataView(buffer);

  const sequence = view.getUint16(1, true);
  const timestamp = view.getUint32(3, true);

  let offset = 7;
  const readQuat = () => {
    const qx = view.getInt16(offset, true) / 32767;
    const qy = view.getInt16(offset + 2, true) / 32767;
    const qz = view.getInt16(offset + 4, true) / 32767;
    const qw = view.getInt16(offset + 6, true) / 32767;
    offset += 8;
    return new THREE.Quaternion(qx, qy, qz, qw).normalize();
  };

  const head = readQuat();
  const spine = readQuat();
  const leftUpperArm = readQuat();
  const leftLowerArm = readQuat();
  const rightUpperArm = readQuat();
  const rightLowerArm = readQuat();

  const fingerCurls: number[] = [];
  for (let i = 0; i < 10; i++) {
    const byte = view.getUint8(offset + i);
    fingerCurls.push((byte / 255) * (Math.PI * 0.5));
  }
  offset += 10;

  const blendshapes: Record<string, number> = {};
  for (let i = 0; i < BLENDSHAPE_KEYS.length; i++) {
    const key = BLENDSHAPE_KEYS[i];
    const byte = view.getUint8(offset + i);
    blendshapes[key] = byte / 255;
  }

  return {
    sequence,
    timestamp,
    quaternions: {
      head,
      spine,
      leftUpperArm,
      leftLowerArm,
      rightUpperArm,
      rightLowerArm,
    },
    fingerCurls,
    blendshapes,
  };
}
