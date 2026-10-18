import { describe, expect, it } from 'vitest';
import { assProjection, invertProjection, projectPoint } from '../src/utils';

describe('ASS projection', () => {
  it('should leave screen coordinates unchanged without rotations or shear', () => {
    const matrix = assProjection({ x: 640, y: 360 }, {}, 312.5);
    expect(projectPoint(matrix, 123, 456)).toEqual({ x: 123, y: 456 });
    expect(projectPoint(matrix, 640, 360)).toEqual({ x: 640, y: 360 });
  });

  it('should keep the event origin fixed during combined rotations', () => {
    const origin = { x: 640, y: 360 };
    const matrix = assProjection(origin, { frz: 39, frx: -125, fry: 61 }, 312.5);
    const point = projectPoint(matrix, origin.x, origin.y)!;
    expect(point.x).toBeCloseTo(origin.x, 10);
    expect(point.y).toBeCloseTo(origin.y, 10);
  });

  it('should rotate positive frz counterclockwise in screen coordinates', () => {
    const point = projectPoint(assProjection({ x: 20, y: 30 }, { frz: 90 }, 312.5), 30, 30)!;
    expect(point.x).toBeCloseTo(20);
    expect(point.y).toBeCloseTo(20);
  });

  it('should project a tilted plane with perspective instead of an affine cosine scale', () => {
    const matrix = assProjection({ x: 0, y: 0 }, { frx: 45 }, 100);
    const end = projectPoint(matrix, 0, 20)!;
    const middle = projectPoint(matrix, 0, 10)!;
    expect(end.y).toBeCloseTo(16.471566962990764);
    expect(Math.abs(middle.y - end.y / 2)).toBeGreaterThan(0.5);
  });

  it('should follow the libass Z then X then Y rotation and perspective convention', () => {
    // Scalar reference: libass 0.17.5 ass_render.c, calc_transform_matrix.
    // Before perspective the local point is (70.422830105, -10.606601718, 61.871843354).
    const matrix = assProjection({ x: 20, y: 30 }, { frz: 45, frx: 60, fry: 30 }, 312.5);
    const point = projectPoint(matrix, 100, 80)!;
    expect(point.x).toBeCloseTo(78.78416018327115, 10);
    expect(point.y).toBeCloseTo(21.14633459846148, 10);
  });

  it('should shear around the glyph pen and top rather than the event rotation origin', () => {
    const matrix = assProjection(
      { x: 0, y: 0 },
      { fax: 0.5, fay: 0.25, shearOrigin: { x: 10, y: 20 } },
      312.5
    );
    expect(projectPoint(matrix, 14, 24)).toEqual({ x: 16, y: 25 });
  });

  it('should preserve the projected shape when the output and focal length scale together', () => {
    const angles = { frx: -40, fry: 30, frz: 12 };
    const small = projectPoint(assProjection({ x: 20, y: 30 }, angles, 312.5), 100, 80)!;
    const large = projectPoint(assProjection({ x: 40, y: 60 }, angles, 625), 200, 160)!;
    expect(large.x).toBeCloseTo(small.x * 2, 10);
    expect(large.y).toBeCloseTo(small.y * 2, 10);
  });

  it('should invert a perspective mapping for mask sampling', () => {
    const matrix = assProjection({ x: 640, y: 360 }, { frx: -35, fry: 22, frz: 16 }, 312.5);
    const inverse = invertProjection(matrix)!;
    expect(inverse).not.toBeNull();
    const projected = projectPoint(matrix, 681, 342)!;
    const restored = projectPoint(inverse, projected.x, projected.y)!;
    expect(restored.x).toBeCloseTo(681, 10);
    expect(restored.y).toBeCloseTo(342, 10);
  });

  it('should reject points on, too close to, or behind the eye plane', () => {
    const matrix = assProjection({ x: 0, y: 0 }, { fry: 90 }, 312.5);
    expect(projectPoint(matrix, -312.5, 10)).toBeNull();
    expect(projectPoint(matrix, -312.5 + 1e-8, 10)).toBeNull();
    expect(projectPoint(matrix, -400, 10)).toBeNull();
    expect(projectPoint(matrix, Infinity, 10)).toBeNull();
  });

  it('should reject a collapsed mapping and invalid focal lengths', () => {
    const matrix = assProjection({ x: 0, y: 0 }, { frx: 90 }, 312.5);
    expect(invertProjection(matrix)).toBeNull();
    expect(() => assProjection({ x: 0, y: 0 }, {}, 0)).toThrow(RangeError);
    expect(() => assProjection({ x: 0, y: 0 }, {}, Infinity)).toThrow(RangeError);
  });
});
