import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ASS from '../src/ass';

type MaskBitmap = { data: Uint8ClampedArray; width: number; height: number; x: number; y: number };

function script(text: string, fillAlpha = '00', borderAlpha = '00', shadowAlpha = '00') {
  const position = /\\(?:pos|move)\(/.test(text) ? '' : '{\\pos(30,30)}';
  return `[Script Info]
PlayResX: 200
PlayResY: 100
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,28,&H${fillAlpha}FFFFFF,&H000000FF,&H${borderAlpha}000000,&H${shadowAlpha}FF00FF,0,0,0,0,100,100,0,0,1,2,6,7,0,0,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,${position}${text}`;
}

function alphaPixels(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  return Uint8ClampedArray.from({ length: width * height }, (_, i) => data[i * 4 + 3]!);
}

function coverageBounds(bitmap: MaskBitmap) {
  let left = bitmap.width;
  let right = -1;
  let top = bitmap.height;
  let bottom = -1;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (bitmap.data[y * bitmap.width + x]! < 32) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

describe('ASS mask compositing', () => {
  const instances: ASS[] = [];
  let video: HTMLVideoElement;

  beforeEach(() => {
    video = document.createElement('video');
    for (const [key, value] of Object.entries({
      videoWidth: 200,
      videoHeight: 100,
      clientWidth: 200,
      clientHeight: 100,
      offsetLeft: 0,
      offsetTop: 0
    })) {
      Object.defineProperty(video, key, { value, configurable: true });
    }
    document.body.appendChild(video);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  });

  afterEach(() => {
    for (const ass of instances.splice(0)) ass.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  async function renderer(
    text: string,
    fillAlpha?: string,
    borderAlpha?: string,
    shadowAlpha?: string
  ) {
    const ass = new ASS({ assText: script(text, fillAlpha, borderAlpha, shadowAlpha), video });
    instances.push(ass);
    await ass.render();
    return (ass as any).renderer as any;
  }

  it('should paint every shadow and outline in an event before any foreground fill', async () => {
    const r = await renderer(String.raw`{\1c&H0000FF&\3c&H00FF00&}A{\1c&HFF0000&\3c&H00FFFF&}B`);
    const colors: string[] = [];
    const paint = r.paintMask.bind(r);
    vi.spyOn(r, 'paintMask').mockImplementation((...args: any[]) => {
      colors.push(args[1].toLowerCase());
      return paint(...args);
    });
    r.forceRender(1);
    expect(colors).toEqual(['#ff00ff', '#ff00ff', '#00ff00', '#ffff00', '#ff0000', '#0000ff']);
  });

  it('should give the shadow its own alpha instead of inheriting fill or outline alpha', async () => {
    const shadowOnly = async (fill: string, border: string, shadow: string) => {
      const r = await renderer('H', fill, border, shadow);
      const paint = r.paintMask.bind(r);
      vi.spyOn(r, 'paintMask').mockImplementation((...args: any[]) => {
        if (args[1].toLowerCase() === '#ff00ff') return paint(...args);
      });
      r.forceRender(1);
      return alphaPixels(r.layers[0].ctx);
    };
    const opaque = await shadowOnly('40', '80', '00');
    const otherAlphas = await shadowOnly('C0', 'FF', '00');
    const halfShadow = await shadowOnly('40', '80', '80');
    expect(Math.max(...opaque)).toBe(255);
    expect(otherAlphas).toEqual(opaque);
    expect(Math.max(...halfShadow)).toBe(127);
  });

  it('should apply a fade once to the completed bold glyph coverage', async () => {
    const r = await renderer(String.raw`{\b1\bord0\shad0\fad(1000,0)}HHH`);
    // Exercise the renderer's own light-face synthesis without loading or installing a font.
    r.fonts.set('arial', [
      {
        family: 'Arial',
        minWeight: 400,
        maxWeight: 400,
        weightKnown: true,
        bold: false,
        italic: false,
        ratio: 0.895
      }
    ]);
    r.faceCache.clear();
    r.forceRender(0.5);
    const alpha = alphaPixels(r.layers[0].ctx);
    expect(Math.max(...alpha)).toBeGreaterThanOrEqual(127);
    expect(Math.max(...alpha)).toBeLessThanOrEqual(128);
  });

  it('should keep independent horizontal and vertical border widths through rasterization', async () => {
    const bounds = async (tags: string) => {
      const r = await renderer(`${tags}H`);
      let painted: { fill: MaskBitmap; border: MaskBitmap } | undefined;
      const draw = r.drawWord.bind(r);
      vi.spyOn(r, 'drawWord').mockImplementation((...args: any[]) => {
        const result = draw(...args);
        painted = result;
        return result;
      });
      r.forceRender(1);
      expect(painted?.border).toBeDefined();
      return { fill: coverageBounds(painted!.fill), border: coverageBounds(painted!.border) };
    };
    const horizontal = await bounds(String.raw`{\xbord4\ybord0\shad0}`);
    const vertical = await bounds(String.raw`{\xbord0\ybord4\shad0}`);
    expect(horizontal.border.width - horizontal.fill.width).toBeGreaterThanOrEqual(6);
    expect(horizontal.border.height).toBe(horizontal.fill.height);
    expect(vertical.border.height - vertical.fill.height).toBeGreaterThanOrEqual(6);
    expect(vertical.border.width).toBe(vertical.fill.width);
  });

  it('should preserve the difference between discrete edge blur and Gaussian blur in final pixels', async () => {
    const edge = await renderer(String.raw`{\bord0\shad0\be1}H`);
    edge.forceRender(1);
    const edgePixels = alphaPixels(edge.layers[0].ctx);
    // sqrt(1/2) / 0.8493218 gives the same variance as a single discrete be pass.
    const gaussian = await renderer(String.raw`{\bord0\shad0\blur0.8325546}H`);
    gaussian.forceRender(1);
    const gaussianPixels = alphaPixels(gaussian.layers[0].ctx);
    expect(Math.max(...edgePixels)).toBeGreaterThan(0);
    expect(Math.max(...gaussianPixels)).toBeGreaterThan(0);
    expect(gaussianPixels).not.toEqual(edgePixels);
  });

  it('should measure blur in video pixels like libass rather than in script pixels', async () => {
    const blurred = async (blur: number, videoScale: number, info = '') => {
      Object.defineProperty(video, 'videoWidth', { value: 200 * videoScale, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 100 * videoScale, configurable: true });
      const assText = script(String.raw`{\bord0\shad0\blur${blur}}H`).replace(
        'PlayResY: 100',
        `PlayResY: 100${info}`
      );
      const ass = new ASS({ assText, video });
      instances.push(ass);
      await ass.render();
      const r = (ass as any).renderer as any;
      r.forceRender(1);
      return alphaPixels(r.layers[0].ctx);
    };
    // A video twice the script's resolution halves the blur on the same canvas, as in JASSUB.
    const half = await blurred(1, 1);
    expect(await blurred(2, 2)).toEqual(half);
    expect(await blurred(2, 1)).not.toEqual(half);
    // LayoutResX/Y takes precedence over the video size.
    expect(await blurred(2, 1, '\nLayoutResX: 400\nLayoutResY: 200')).toEqual(half);
  });

  it('should project a supersampled affine mask at its script position without retaining old pixels', async () => {
    const r = await renderer('H');
    const source = {
      data: new Uint8ClampedArray(100).fill(255),
      width: 10,
      height: 10,
      x: 40,
      y: 20
    };
    // A 90 degree rotation and translation: [40,45]x[20,25] becomes [55,60]x[20,25].
    const matrix = [0, -1, 80, 1, 0, -20, 0, 0, 1];
    const projected = r.projectBitmap(
      source,
      new Uint8ClampedArray(100),
      matrix,
      r.layers[0],
      2,
      2
    );
    const bounds = coverageBounds(projected.fill);
    expect(projected.fill.x + bounds.left).toBe(55);
    expect(projected.fill.y + bounds.top).toBe(20);
    expect(bounds.width).toBe(5);
    expect(bounds.height).toBe(5);
    expect(Math.max(...projected.fill.data)).toBe(255);
    // The same native scratch surface is reused for the outline, which is entirely empty.
    expect(Math.max(...projected.border.data)).toBe(0);
  });

  it('should put unrotated glyph coverage on whole pixels instead of resampling it', async () => {
    const r = await renderer(String.raw`{\pos(30.37,30.81)\bord0\shad0}H`);
    const project = vi.spyOn(r, 'projectBitmap');
    const affine = vi.spyOn(r, 'projectAffineBitmap');
    r.forceRender(1);
    const [source, , , , , supersample] = project.mock.calls[0]! as any[];
    const { fill } = project.mock.results[0]!.value as { fill: MaskBitmap };
    expect(Number.isInteger(source.x) && Number.isInteger(source.y)).toBe(true);
    expect(affine).not.toHaveBeenCalled();
    // Rasterized at the output resolution: each output pixel is its own sample, unchanged.
    expect(supersample).toBe(1);
    for (let y = 0; y < fill.height; y++) {
      for (let x = 0; x < fill.width; x++) {
        const col = fill.x + x - source.x;
        const row = fill.y + y - source.y;
        const inside = col >= 0 && row >= 0 && col < source.width && row < source.height;
        expect(fill.data[y * fill.width + x]).toBe(
          inside ? source.data[row * source.width + col] : 0
        );
      }
    }
  });

  it('should box filter 2x2 supersampled coverage that lands on whole pixels', async () => {
    const r = await renderer('H');
    const source = { data: new Uint8ClampedArray(16), width: 4, height: 4, x: 10, y: 20 };
    source.data.set([255, 255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0], 0);
    const projected = r.projectBitmap(
      source,
      undefined,
      [1, 0, 0, 0, 1, 0, 0, 0, 1],
      r.layers[0],
      0,
      2
    );
    // Each output pixel is the mean of its own 2x2 samples: nothing from its neighbours.
    expect(Array.from(projected.fill.data)).toEqual([255, 0, 64, 0]);
  });

  it('should draw small text large enough for the browser to fill it as an outline', async () => {
    const r = await renderer(String.raw`{\bord0\shad0}H`);
    const proto = Object.getPrototypeOf(r.layers[0].ctx);
    const original = proto.fillText;
    const sizes: number[] = [];
    vi.spyOn(proto, 'fillText').mockImplementation(function (
      this: CanvasRenderingContext2D,
      ...args: any[]
    ) {
      const { a, d } = this.getTransform();
      sizes.push(parseFloat(/([\d.]+)px/.exec(this.font)![1]!) * Math.max(a, d));
      return original.apply(this, args);
    });
    r.forceRender(1);
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThan(256);
  });
});
