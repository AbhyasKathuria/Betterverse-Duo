import { describe, it, expect } from 'vitest';
import { mediapipeWorldToThree } from '../src/lib/avatar/coordinates';
import { OneEuroFilter } from '../src/lib/avatar/one-euro-filter';

describe('mediapipeWorldToThree Coordinate Transformation', () => {
  it('correctly inverts Y and Z while preserving X', () => {
    const input = { x: 0.5, y: 1.2, z: 0.8 };
    const result = mediapipeWorldToThree(input);

    expect(result.x).toBe(0.5);
    expect(result.y).toBe(-1.2);
    expect(result.z).toBe(-0.8);
  });

  it('maps origin (0, 0, 0) to origin (0, 0, 0)', () => {
    const result = mediapipeWorldToThree({ x: 0, y: 0, z: 0 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(-0);
    expect(result.z).toBe(-0);
  });
});

describe('OneEuroFilter Smoothing Filter', () => {
  it('returns initial value on first sample', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.007 });
    const { value, lagMs } = filter.filter(10.0, 0.0);

    expect(value).toBe(10.0);
    expect(lagMs).toBe(0);
  });

  it('smooths high-frequency jitter at low velocities', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.001 });

    // Feed a base value of 5.0
    filter.filter(5.0, 0.0);
    filter.filter(5.0, 0.033);

    // Jitter perturbation
    const { value: jittered } = filter.filter(5.3, 0.066);

    // Filtered value should strongly suppress the 0.3 spike
    expect(jittered).toBeGreaterThan(5.0);
    expect(jittered).toBeLessThan(5.15);
  });

  it('adapts cutoff dynamically during fast movement', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.05 });

    filter.filter(0.0, 0.0);
    filter.filter(0.0, 0.033);

    // Rapid step motion
    const { value: fastMotion, lagMs } = filter.filter(10.0, 0.066);

    // Should react rapidly with small lag estimate
    expect(fastMotion).toBeGreaterThan(2.0);
    expect(lagMs).toBeLessThan(100);
  });

  it('resets cleanly', () => {
    const filter = new OneEuroFilter();
    filter.filter(10.0, 0.0);
    filter.reset();

    const { value } = filter.filter(25.0, 1.0);
    expect(value).toBe(25.0);
  });
});
