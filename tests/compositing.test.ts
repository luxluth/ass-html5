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
});
