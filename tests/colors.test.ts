import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ASS from '../src/ass';
import { FadeKind } from '../src/types';
import { blendAlpha, getOpacity, getOpacityComplex, parseAlpha } from '../src/utils';

function script(style: string, text: string) {
  return `[Script Info]
PlayResX: 1280
PlayResY: 720
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${style}
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${text}`;
}

describe('Colors and alpha', () => {
  let videoElement: HTMLVideoElement;
  let fills: { fillStyle: string; shadowColor: string }[];
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    videoElement = document.createElement('video');
    Object.defineProperty(videoElement, 'videoWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'videoHeight', { value: 720 });
    Object.defineProperty(videoElement, 'clientWidth', { value: 1280 });
    Object.defineProperty(videoElement, 'clientHeight', { value: 720 });
    document.body.appendChild(videoElement);

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);

    fills = [];
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = originalGetContext.apply(this, [type]) as CanvasRenderingContext2D;
      if (type === '2d') {
        const fillText = ctx.fillText;
        ctx.fillText = function (this: CanvasRenderingContext2D, ...args: any[]) {
          fills.push({ fillStyle: String(this.fillStyle), shadowColor: this.shadowColor });
          return fillText.apply(this, args as any);
        };
      }
      return ctx;
    } as any;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  async function draw(assText: string, time: number) {
    const ass = new ASS({ assText, video: videoElement });
    await ass.render();
    (ass as any).renderer.display(time);
    ass.destroy();
  }

  it('should read ASS alpha as 00 opaque and FF transparent', () => {
    expect(blendAlpha('#ffffff', 0)).toBe('rgba(255, 255, 255, 1.000)');
    expect(blendAlpha('#ffffff', 255)).toBe('rgba(255, 255, 255, 0.000)');
    expect(blendAlpha('#ff0000', 0x40)).toBe('rgba(255, 0, 0, 0.749)');
    expect(blendAlpha('', 0)).toBe('rgba(0, 0, 0, 1.000)');
  });

  it('should parse alpha values safely and correctly', () => {
    expect(parseAlpha(128)).toBe(128);
    expect(parseAlpha('80')).toBe(128);
    expect(parseAlpha('&H80')).toBe(128);
    expect(parseAlpha('&H80&')).toBe(128);
    expect(parseAlpha('')).toBe(0);
    expect(parseAlpha(undefined)).toBe(0);
    expect(parseAlpha('invalid')).toBe(0);
  });

  it('should turn \\fad and \\fade into an opacity between 0 and 1', () => {
    const fad = { type: FadeKind.Simple, fadein: 500, fadeout: 500 } as const;
    expect(getOpacity(fad, 0, 2000, 250)).toBeCloseTo(0.5, 5);
    expect(getOpacity(fad, 0, 2000, 1000)).toBe(1);
    expect(getOpacity(fad, 0, 2000, 1750)).toBeCloseTo(0.5, 5);

    // \fade(255,0,255,0,500,1500,2000): alphas, so 255 is hidden and 0 is visible
    const fade = {
      type: FadeKind.Complex,
      a1: 255,
      a2: 0,
      a3: 255,
      t1: 0,
      t2: 500,
      t3: 1500,
      t4: 2000
    } as const;
    expect(getOpacityComplex(fade, 0, 2000, 0)).toBe(0);
    expect(getOpacityComplex(fade, 0, 2000, 250)).toBeCloseTo(0.5, 5);
    expect(getOpacityComplex(fade, 0, 2000, 1000)).toBe(1);
    expect(getOpacityComplex(fade, 0, 2000, 2000)).toBe(0);
  });

  it('should cast the shadow in the BackColour of the style', async () => {
    // BackColour &H00FF0000 is blue: ASS colors are written BBGGRR
    await draw(
      script(
        'Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00FF0000,0,0,0,0,100,100,0,0,1,0,2,2,10,10,10,1',
        'Text'
      ),
      0.5
    );
    expect(fills[0]!.shadowColor).toMatch(/^(#0000ff|rgba\(0, 0, 255, 1\))$/);
  });

  it('should apply \\2c and \\2a to the part karaoke has not reached', async () => {
    await draw(
      script(
        'Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1',
        '{\\k100\\2c&H00FF00&\\2a&H80&}Text'
      ),
      0.5
    );
    // The unsung text is filled first, in the secondary color
    expect(fills[0]!.fillStyle).toMatch(/^rgba\(0, 255, 0, 0\.49\d*\)$/);
  });
});
