import { PALETTE } from '@/lib/colors';
import type { NormalizedLandmark, TrackingFrame } from './types';

// Upper-body pose connections strictly between indices 0 and 24 (no legs)
const UPPER_BODY_CONNECTIONS: [number, number][] = [
  // Shoulders & Torso
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // Left arm
  [11, 13],
  [13, 15],
  // Right arm
  [12, 14],
  [14, 16],
  // Left wrist to fingers
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  // Right wrist to fingers
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  // Facial feature structure anchors (nose to eyes and ears)
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
];

// Hand finger connections (21 points)
const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm knuckle base
  [5, 9],
  [9, 13],
  [13, 17],
];

// Face contour paths (curated contours only; not the dense 478-mesh)
const FACE_CONTOURS = {
  oval: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
    400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
    54, 103, 67, 109, 10,
  ],
  leftEyebrow: [70, 63, 105, 66, 107],
  rightEyebrow: [336, 296, 334, 293, 300],
  leftEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33],
  rightEye: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466, 263],
  outerLips: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 61],
};

// Key facial anchors highlighted with Pink center + Yellow outer ring
const KEY_FACE_ANCHORS = [
  1,   // Nose tip
  13,  // Upper lip center
  14,  // Lower lip center
  159, // Left eye center
  386, // Right eye center
];

function drawPath(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], indices: number[], width: number, height: number): void {
  ctx.beginPath();
  let started = false;
  for (const idx of indices) {
    const pt = landmarks[idx];
    if (!pt) continue;
    const x = pt.x * width;
    const y = pt.y * height;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

/**
 * Draws the complete landmark overlay for upper-body pose, hands, and facial contours.
 * Uses STRICTLY the 4 palette colors:
 * - Blue: Canvas background
 * - Amber: Pose connections and face contour paths
 * - Yellow: Hand connections, pose joints, and anchor rings
 * - Pink: Key facial anchor points
 * Note: Mirroring is handled via CSS transform: scaleX(-1) on the canvas element.
 * No text is drawn to the canvas to preserve readable rendering.
 */
export function drawTrackingOverlay(
  ctx: CanvasRenderingContext2D,
  frame: TrackingFrame | null,
  width: number,
  height: number
): void {
  // 1. Clear with strict Blue background
  ctx.fillStyle = PALETTE.blue.hex;
  ctx.fillRect(0, 0, width, height);

  if (!frame) return;

  // 2. Draw Upper-Body Pose (Landmarks 0 to 24 only)
  if (frame.pose && frame.pose.length >= 25) {
    const pose = frame.pose;

    // Pose skeleton lines in Amber (line width >= 3)
    ctx.strokeStyle = PALETTE.amber.hex;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const [startIdx, endIdx] of UPPER_BODY_CONNECTIONS) {
      const p1 = pose[startIdx];
      const p2 = pose[endIdx];
      if (p1 && p2 && (p1.visibility ?? 1) > 0.4 && (p2.visibility ?? 1) > 0.4) {
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
      }
    }
    ctx.stroke();

    // Pose joints in Yellow (radius >= 5)
    ctx.fillStyle = PALETTE.yellow.hex;
    for (let i = 0; i < 25; i++) {
      const pt = pose[i];
      if (pt && (pt.visibility ?? 1) > 0.4) {
        ctx.beginPath();
        ctx.arc(pt.x * width, pt.y * height, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 3. Draw Face Contours & Key Anchors
  if (frame.faceLandmarks && frame.faceLandmarks.length > 0) {
    const face = frame.faceLandmarks;

    // Contours in Amber (line width >= 3)
    ctx.strokeStyle = PALETTE.amber.hex;
    ctx.lineWidth = 3;
    drawPath(ctx, face, FACE_CONTOURS.oval, width, height);
    drawPath(ctx, face, FACE_CONTOURS.leftEyebrow, width, height);
    drawPath(ctx, face, FACE_CONTOURS.rightEyebrow, width, height);
    drawPath(ctx, face, FACE_CONTOURS.leftEye, width, height);
    drawPath(ctx, face, FACE_CONTOURS.rightEye, width, height);
    drawPath(ctx, face, FACE_CONTOURS.outerLips, width, height);

    // Key anchors: Pink with Yellow outer ring
    for (const anchorIdx of KEY_FACE_ANCHORS) {
      const anchor = face[anchorIdx];
      if (!anchor) continue;
      const ax = anchor.x * width;
      const ay = anchor.y * height;

      // Outer Yellow ring
      ctx.strokeStyle = PALETTE.yellow.hex;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ax, ay, 7, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Pink anchor dot
      ctx.fillStyle = PALETTE.pink.hex;
      ctx.beginPath();
      ctx.arc(ax, ay, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Draw Hands (Left and Right)
  const handsToDraw = [frame.leftHand, frame.rightHand];
  for (const hand of handsToDraw) {
    if (!hand || hand.length < 21) continue;

    // Hand bones in Yellow
    ctx.strokeStyle = PALETTE.yellow.hex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const h1 = hand[startIdx];
      const h2 = hand[endIdx];
      if (h1 && h2) {
        ctx.moveTo(h1.x * width, h1.y * height);
        ctx.lineTo(h2.x * width, h2.y * height);
      }
    }
    ctx.stroke();

    // Hand joints in Amber (radius >= 5)
    ctx.fillStyle = PALETTE.amber.hex;
    for (let i = 0; i < 21; i++) {
      const pt = hand[i];
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt.x * width, pt.y * height, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
