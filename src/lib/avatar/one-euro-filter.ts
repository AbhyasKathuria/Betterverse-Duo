/**
 * Betterverse Duo - One-Euro Filter (1€ Filter)
 * Reference: Casiez, Roussel, Vogel (CHI 2012)
 *
 * Provides adaptive low-pass filtering:
 * - High smoothing at low speeds (eliminates micro-jitter)
 * - Low smoothing at high speeds (zero perceptible lag)
 */

export class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.y = value;
    this.s = alpha * value + (1.0 - alpha) * (this.s as number);
    return this.s;
  }

  public lastValue(): number | null {
    return this.s;
  }

  public reset(): void {
    this.y = null;
    this.s = null;
  }
}

export interface OneEuroConfig {
  minCutoff: number; // Minimum cutoff frequency in Hz (default 1.0)
  beta: number;      // Speed coefficient (default 0.007)
  dCutoff: number;   // Derivative cutoff frequency in Hz (default 1.0)
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTime: number | null = null;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.minCutoff = config.minCutoff ?? 1.0;
    this.beta = config.beta ?? 0.007;
    this.dCutoff = config.dCutoff ?? 1.0;

    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
  }

  public setParams(minCutoff: number, beta: number): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  public getParams(): { minCutoff: number; beta: number } {
    return { minCutoff: this.minCutoff, beta: this.beta };
  }

  private alpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  /**
   * Filters a scalar value at a given timestamp (in seconds).
   */
  public filter(value: number, timestampSec: number): { value: number; lagMs: number } {
    if (this.lastTime === null) {
      this.lastTime = timestampSec;
      return { value: this.xFilter.filter(value, 1.0), lagMs: 0 };
    }

    const dt = timestampSec - this.lastTime;
    this.lastTime = timestampSec;

    // Guard against non-positive dt
    const rate = dt > 0 ? 1.0 / dt : 30.0;

    // Filter derivative (velocity)
    const prevX = this.xFilter.lastValue() ?? value;
    const dx = (value - prevX) * rate;
    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));

    // Adaptive cutoff
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const filteredValue = this.xFilter.filter(value, this.alpha(rate, cutoff));

    // Lag estimate in milliseconds: tau = 1 / (2 * pi * cutoff)
    const lagMs = (1.0 / (2.0 * Math.PI * cutoff)) * 1000;

    return { value: filteredValue, lagMs };
  }

  public reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}
