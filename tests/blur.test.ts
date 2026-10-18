import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';
import * as utils from '../src/utils';

// Every blur goes through blurMask: record its calls and keep its result
vi.mock('../src/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils')>();
  return { ...actual, blurMask: vi.fn(actual.blurMask) };
});

function script(outline: number, text: string, info = '') {
  return `[Script Info]
PlayResX: 1280
PlayResY: 720${info}
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,${outline},0,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${text}`;
}

describe('Blur', () => {
  let videoElement: HTMLVideoElement;

  beforeEach(() => {
    videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1280, configurable: true });
    Object.defineProperty(videoElement, 'videoHeight', { value: 720, configurable: true });
    Object.defineProperty(videoElement, 'clientWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'clientHeight', { value: 720 });
    document.body.appendChild(videoElement);

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The masks of the first word, and the sigmas and \be passes of every blur
  async function draw(assText: string) {
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    const renderer = (ass as any).renderer;
    let masks: { fill: { data: Uint8ClampedArray }; border?: { data: Uint8ClampedArray } } = null!;
    const drawWord = renderer.drawWord.bind(renderer);
    vi.spyOn(renderer, 'drawWord').mockImplementation((...args: any[]) => {
      masks ??= drawWord(...args);
      return masks;
    });
    vi.mocked(utils.blurMask).mockClear();
    renderer.forceRender(0.5);
    const blurs = vi.mocked(utils.blurMask).mock.calls.map(([, , , x, y, be]) => ({ x, y, be }));
    ass.destroy();
    return { masks, blurs };
  }

  it('should blur the border and keep the fill sharp', async () => {
    // The masks of a blurred word have more padding, so their coverage is compared, not their size
    const coverage = (data: Uint8ClampedArray) => ({
      total: data.reduce((sum, v) => sum + v, 0),
      covered: data.filter((v) => v > 0).length
    });
    const sharp = await draw(script(3, 'Text'));
    const blurred = await draw(script(3, '{\\blur2}Text'));
    expect(coverage(blurred.masks.fill.data)).toEqual(coverage(sharp.masks.fill.data));
    expect(coverage(blurred.masks.border!.data).covered).toBeGreaterThan(
      coverage(sharp.masks.border!.data).covered
    );
  });

  it('should blur the fill when there is no border', async () => {
    const sharp = await draw(script(0, 'Text'));
    const blurred = await draw(script(0, '{\\blur2}Text'));
    expect(blurred.masks.border).toBeUndefined();
    expect(blurred.masks.fill.data).not.toEqual(sharp.masks.fill.data);
  });

  it('should blur as strongly as libass', async () => {
    // The video is the size of the canvas, so \blur2 is a gaussian of sigma 2 * 0.8493218
    const { blurs } = await draw(script(0, '{\\blur2}Text'));
    expect(blurs[0]!.x).toBeCloseTo(2 * 0.8493218, 6);
    expect(blurs[0]!.y).toBeCloseTo(2 * 0.8493218, 6);
    expect(blurs[0]!.be).toBe(0);

    // \be counts passes of a [1 2 1] kernel in output pixels
    expect((await draw(script(0, '{\\be2}Text'))).blurs[0]).toEqual({ x: 0, y: 0, be: 2 });
  });

  it('should measure the blur in video pixels, as libass does', async () => {
    // A video twice the size of the canvas makes the same \blur half as strong on screen
    Object.defineProperty(videoElement, 'videoWidth', { value: 2560 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 1440 });
    const { blurs } = await draw(script(0, '{\\blur2}Text'));
    expect(blurs[0]!.y).toBeCloseTo(0.8493218, 6);

    // LayoutResX and LayoutResY come before the size of the video
    const layout = await draw(script(0, '{\\blur2}Text', '\nLayoutResX: 640\nLayoutResY: 360'));
    expect(layout.blurs[0]!.y).toBeCloseTo(4 * 0.8493218, 6);
  });
});
