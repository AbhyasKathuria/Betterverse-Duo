/**
 * Betterverse Duo - Coordinate Transformation
 * Converts MediaPipe 3D points from MediaPipe World space (metric, Y-down)
 * into Three.js standard coordinates (metric, right-handed, Y-up).
 *
 * MediaPipe World Coordinates:
 *   +X = Rightward
 *   +Y = Downward (towards floor/feet)
 *   +Z = Away from camera (depth into scene)
 *
 * Three.js Coordinates:
 *   +X = Rightward
 *   +Y = Upward (towards ceiling/head)
 *   +Z = Towards viewer (inverted depth)
 *
 * Transformation:
 *   three.x =  mp.x
 *   three.y = -mp.y
 *   three.z = -mp.z
 */
export function mediapipeWorldToThree(mp: { x: number; y: number; z: number }): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: mp.x,
    y: -mp.y,
    z: -mp.z,
  };
}
