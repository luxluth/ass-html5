import { describe, expect, it } from 'vitest';
import { blurMask, expandMask, halveMask, reduceAlpha } from '../src/utils';

function impulse(width: number, height: number, x: number, y: number) {
  const mask = new Uint8ClampedArray(width * height);
  mask[y * width + x] = 255;
  return mask;
}

describe('Alpha mask filters', () => {
  it('should preserve zero masks and return an independent copy without a filter', () => {
    const mask = new Uint8ClampedArray([0, 100, 255, 0]);
    const blurred = blurMask(mask, 2, 2, 0, 0, 0);
    const expanded = expandMask(mask, 2, 2, 0, 0);
    expect(blurred).toEqual(mask);
    expect(expanded).toEqual(mask);
    expect(blurred).not.toBe(mask);
    expect(expanded).not.toBe(mask);
    expect(blurMask(new Uint8ClampedArray(25), 5, 5, 2, 3, 4)).toEqual(new Uint8ClampedArray(25));
    expect(expandMask(new Uint8ClampedArray(25), 5, 5, 2, 3)).toEqual(new Uint8ClampedArray(25));
  });

  it('should apply the discrete edge blur kernel with one final integer truncation', () => {
    const mask = impulse(5, 5, 2, 2);
    const blurred = blurMask(mask, 5, 5, 0, 0, 1);
    expect(Array.from(blurred)).toEqual([
      0, 0, 0, 0, 0, 0, 15, 31, 15, 0, 0, 31, 63, 31, 0, 0, 15, 31, 15, 0, 0, 0, 0, 0, 0
    ]);
    expect(mask[12]).toBe(255);
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(255);
  });

  it('should keep multiple edge blur passes separate from the Gaussian filter', () => {
    const mask = impulse(9, 9, 4, 4);
    const twoPasses = blurMask(mask, 9, 9, 0, 0, 2);
    expect(twoPasses[40]).toBe(36);
    expect(twoPasses[36]).toBe(0);
    expect(blurMask(mask, 9, 9, 1, 1, 0)).not.toEqual(twoPasses);
    expect(blurMask(mask, 9, 9, 1, 1, 2)).toEqual(
      blurMask(blurMask(mask, 9, 9, 1, 1, 0), 9, 9, 0, 0, 2)
    );
  });

  it('should blur each axis independently without wrapping between rows', () => {
    const mask = impulse(5, 3, 4, 1);
    const horizontal = blurMask(mask, 5, 3, 1, 0, 0);
    expect(horizontal[9]).toBeGreaterThan(0);
    expect(horizontal[8]).toBeGreaterThan(0);
    expect(Array.from(horizontal.slice(0, 5))).toEqual([0, 0, 0, 0, 0]);
    expect(Array.from(horizontal.slice(10))).toEqual([0, 0, 0, 0, 0]);

    const vertical = blurMask(mask, 5, 3, 0, 1, 0);
    expect(vertical[4]).toBeGreaterThan(0);
    expect(vertical[14]).toBeGreaterThan(0);
    expect(vertical[8]).toBe(0);
    // Samples beyond the supplied mask are transparent, not a normalized edge extension.
    expect(blurMask(new Uint8ClampedArray([255]), 1, 1, 1, 0, 0)[0]).toBeLessThan(150);
  });

  it('should retain symmetry and approximately preserve a padded Gaussian impulse mass', () => {
    const blurred = blurMask(impulse(17, 17, 8, 8), 17, 17, 1.5, 0.75, 0);
    expect(blurred[8 * 17 + 7]).toBe(blurred[8 * 17 + 9]);
    expect(blurred[7 * 17 + 8]).toBe(blurred[9 * 17 + 8]);
    expect(blurred[8 * 17 + 6]).toBeGreaterThan(blurred[6 * 17 + 8]!);
    const sum = blurred.reduce((total, value) => total + value, 0);
    expect(sum).toBeGreaterThan(245);
    expect(sum).toBeLessThan(265);
  });

  it('should expand one axis without accidentally widening the other axis', () => {
    const mask = impulse(7, 5, 3, 2);
    const horizontal = expandMask(mask, 7, 5, 2, 0);
    expect(Array.from(horizontal.slice(14, 21))).toEqual([0, 255, 255, 255, 255, 255, 0]);
    expect(horizontal[10]).toBe(0);
    const vertical = expandMask(mask, 7, 5, 0, 1);
    expect(vertical[10]).toBe(255);
    expect(vertical[24]).toBe(255);
    expect(vertical[16]).toBe(0);
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(255);
  });

  it('should retain a subpixel bold radius rather than rounding it to zero', () => {
    const expanded = expandMask(impulse(5, 5, 2, 2), 5, 5, 0.25, 0.25);
    expect(expanded[12]).toBe(255);
    expect(expanded[11]).toBe(64);
    expect(expanded[13]).toBe(64);
    expect(expanded[7]).toBe(64);
    expect(expanded[17]).toBe(64);
    expect(expanded[6]).toBeGreaterThan(0);
    expect(expanded[6]).toBeLessThan(expanded[7]!);
  });

  it('should use an elliptical footprint rather than a rectangular border', () => {
    const expanded = expandMask(impulse(7, 7, 3, 3), 7, 7, 2, 1);
    expect(expanded[3 * 7 + 5]).toBe(255);
    expect(expanded[4 * 7 + 3]).toBe(255);
    expect(expanded[4 * 7 + 5]).toBeLessThan(255);
    expect(expanded[4 * 7 + 5]).toBe(expanded[2 * 7 + 1]);
    expect(expanded[5 * 7 + 3]).toBe(0);
  });

  it('should keep fractional expansions on the correct side of a row boundary', () => {
    const expanded = expandMask(impulse(4, 2, 3, 0), 4, 2, 0.5, 0);
    expect(expanded[2]).toBe(128);
    expect(Array.from(expanded.slice(4))).toEqual([0, 0, 0, 0]);
  });

  it('should halve supersampled coverage with an exact box filter at a whole-pixel offset', () => {
    // prettier-ignore
    const mask = new Uint8ClampedArray([
      255, 255, 0, 0,
      255, 255, 0, 0,
      255, 0, 0, 0,
      0, 0, 0, 0
    ]);
    expect(Array.from(halveMask(mask, 4, 4, 0, 0, 2, 2))).toEqual([255, 0, 64, 0]);
    // One output pixel to the left: the first column only sees transparent samples.
    expect(Array.from(halveMask(mask, 4, 4, -2, 0, 3, 2))).toEqual([0, 255, 0, 0, 64, 0]);
    // Half a block off the edge: missing samples count as transparent.
    expect(Array.from(halveMask(mask, 4, 4, -1, -1, 1, 1))).toEqual([64]);
  });

  it('should average the alpha of a raster drawn a whole number of times larger', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [3, 3]
    ] as const) {
      rgba[(y * 4 + x) * 4 + 3] = 255;
    }
    expect(Array.from(reduceAlpha(rgba, 2, 2, 2))).toEqual([191, 0, 0, 64]);
    expect(reduceAlpha(rgba, 4, 4, 1)[15]).toBe(255);
    // Stretched along one axis only: each output pixel is a 1 x 4 or 4 x 1 block
    expect(Array.from(reduceAlpha(rgba, 4, 1, 1, 4))).toEqual([128, 64, 0, 64]);
    expect(Array.from(reduceAlpha(rgba, 1, 4, 4, 1))).toEqual([128, 64, 0, 64]);
    expect(() => reduceAlpha(rgba, 3, 3, 2)).toThrow(RangeError);
  });

  it('should bound edge blur work and ignore nonfinite or negative effect parameters', () => {
    const mask = impulse(3, 3, 1, 1);
    expect(blurMask(mask, 3, 3, 0, 0, 10000)).toEqual(blurMask(mask, 3, 3, 0, 0, 127));
    expect(blurMask(mask, 3, 3, NaN, -1, Infinity)).toEqual(mask);
    expect(expandMask(mask, 3, 3, NaN, -1)).toEqual(mask);
  });
});
